/**
 * BASICAI (Basic Autopilot AI): a sound, cautious player. It reaches the game only through Player API, decides each
 * Player action from the current Player-visible information alone, keeps no plan across turns, and writes no
 * Autopilot memory. Its thresholds are the Implementer's choice; see DEC-021.
 */
import type {
  AgentView,
  AutopilotAi,
  CurrentStateView,
  GameDataView,
  MissionSiteView,
  PlayerApi,
  Result,
} from '../../engine/player-api.ts';

export interface BasicAiThresholds {
  /** The greatest exhaustion of a Rested Agent. */
  readonly restedExhaustion: number;
  /** The greatest exhaustion of an Agent ordered to Contracting for urgent income. */
  readonly urgentExhaustion: number;
  /** The Agent reserve, as a Percent value of the roster. */
  readonly reservePct: number;
  /** The Expected income to keep, as a Percent value of projected upkeep. */
  readonly incomeTargetPct: number;
  /** The Savings floor, in turns of half the projected upkeep. */
  readonly savingsFloorTurns: number;
  /** The Combat rating a team needs, as a Percent value of the Enemies' Combat rating. */
  readonly combatMarginPct: number;
  /** How many Enemies one Agent of a team answers for. */
  readonly enemiesPerAgent: number;
  /** Agents investigating Leads: this many, plus one for each `investigatorsPerRoster` Agents. */
  readonly baseInvestigators: number;
  readonly investigatorsPerRoster: number;
  /** The target roster size: this many, plus `rosterPerUpgrade` for each Upgrade bought. */
  readonly baseRoster: number;
  readonly rosterPerUpgrade: number;
  /** The Transport cap and Training cap to keep, as Percent values of the roster. */
  readonly transportCapPct: number;
  readonly trainingCapPct: number;
}

/** The thresholds of this Game build, tuned against Campaigns of many Campaign seeds; see DEC-021. */
export const BASIC_AI_THRESHOLDS: BasicAiThresholds = {
  restedExhaustion: 5,
  urgentExhaustion: 25,
  reservePct: 20,
  incomeTargetPct: 120,
  savingsFloorTurns: 5,
  combatMarginPct: 120,
  enemiesPerAgent: 3,
  baseInvestigators: 1,
  investigatorsPerRoster: 10,
  baseRoster: 8,
  rosterPerUpgrade: 4,
  transportCapPct: 50,
  trainingCapPct: 50,
};

/** Thrown inside a step when the Autopilot engagement has ended, so that the step makes no further call. */
class EngagementOver extends Error {}

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

class Turn {
  private readonly player: PlayerApi;
  private readonly t: BasicAiThresholds;
  private readonly data: GameDataView;
  /** Player actions that were rejected this turn; they are not retried. */
  private readonly rejected = new Set<string>();

  constructor(player: PlayerApi, thresholds: BasicAiThresholds) {
    this.player = player;
    this.t = thresholds;
    this.data = this.unwrap(player.queries.getGameData());
  }

  private unwrap<T>(result: Result<T>): T {
    if (!result.ok) {
      if (result.error.code === 'engagement_ended') {
        throw new EngagementOver();
      }
      throw new Error(result.error.message);
    }
    return result.value;
  }

  private state(): CurrentStateView {
    return this.unwrap(this.player.queries.getCurrentState());
  }

  /** Commits an action unless the same action was rejected earlier this turn. Returns whether it committed. */
  private async act(key: string, action: () => Promise<Result<{ committed: boolean }>>): Promise<boolean> {
    if (this.rejected.has(key)) {
      return false;
    }
    const result = await action();
    if (result.ok) {
      return result.value.committed;
    }
    if (result.error.code === 'engagement_ended') {
      throw new EngagementOver();
    }
    this.rejected.add(key);
    return false;
  }

  // ---- What the goals measure ---------------------------------------------------------------------

  private isRested(agent: AgentView, limit = this.t.restedExhaustion): boolean {
    return (
      agent.canBeOrdered &&
      (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training') &&
      agent.exhaustion <= limit
    );
  }

  /** Most rested first, Standby before Training, then the more capable, then the order of the roster. */
  private byPreference(agents: readonly AgentView[]): AgentView[] {
    const standbyFirst = (agent: AgentView) => (agent.assignment?.kind === 'Standby' ? 0 : 1);
    return [...agents]
      .map((agent, index) => ({ agent, index }))
      .sort(
        (a, b) =>
          a.agent.exhaustion - b.agent.exhaustion ||
          standbyFirst(a.agent) - standbyFirst(b.agent) ||
          b.agent.effectiveSkill - a.agent.effectiveSkill ||
          a.index - b.index,
      )
      .map((item) => item.agent);
  }

  /** Expected income: funding plus the contracting income of every Agent whose Current assignment is Contracting. */
  private expectedIncome(state: CurrentStateView): number {
    const contracting = state.agents.filter((agent) => agent.assignment?.kind === 'Contracting').length;
    return state.agency.funding + (this.data.economy['contractingIncomePerAgent'] ?? 0) * contracting;
  }

  private incomeTarget(state: CurrentStateView): number {
    return ceilDiv(state.agency.projectedUpkeep * this.t.incomeTargetPct, 100);
  }

  private reserve(state: CurrentStateView): number {
    return Math.floor((state.agency.servingAgents * this.t.reservePct) / 100);
  }

  private savingsFloor(state: CurrentStateView): number {
    return ceilDiv(state.agency.projectedUpkeep * this.t.savingsFloorTurns, 2);
  }

  /** The Rested Agents on Standby beyond the Agent reserve, in order of preference. */
  private freeStandby(state: CurrentStateView): AgentView[] {
    const standby = this.byPreference(
      state.agents.filter((agent) => this.isRested(agent) && agent.assignment?.kind === 'Standby'),
    );
    return standby.slice(0, Math.max(0, standby.length - this.reserve(state)));
  }

  /**
   * A team of Rested Agents whose Combat rating exceeds the Enemies' Combat rating by the safety margin and that
   * has enough Agents for the number of Enemies; none when no such team fits within the Transport cap. Agents are
   * taken in the order of preference; when that order gives no winning team, the most capable are taken first,
   * because a winning team can then still be formed.
   */
  private winningTeam(
    state: CurrentStateView,
    enemiesRating: number,
    enemyCount: number,
    rested: readonly AgentView[],
  ): string[] | null {
    const places = state.agency.transportCap - state.agency.deployedAgents;
    const needed = Math.max(1, ceilDiv(enemyCount, this.t.enemiesPerAgent));
    const strongestFirst = [...rested]
      .map((agent, index) => ({ agent, index }))
      .sort((x, y) => y.agent.effectiveSkill - x.agent.effectiveSkill || x.index - y.index)
      .map((item) => item.agent);
    for (const candidates of [rested, strongestFirst]) {
      const team: string[] = [];
      for (const agent of candidates) {
        if (team.length >= places) {
          break;
        }
        if (!agent.ableToFight) {
          continue;
        }
        team.push(agent.id);
        if (team.length < needed) {
          continue;
        }
        const preview = this.unwrap(this.player.queries.previewDeployment(null, team));
        if (preview.teamCombatRating * 100 > enemiesRating * this.t.combatMarginPct) {
          return team;
        }
      }
    }
    return null;
  }

  // ---- Turn routine -------------------------------------------------------------------------------
  //
  // Each step makes at most one Player action and reports whether it made one. After every Player action the
  // routine starts again from its first step, so each Player action is decided from the current Player-visible
  // information alone, and the Basic Autopilot AI plays the same way whatever its Autopilot limit is.

  private restedOnTraining(state: CurrentStateView): AgentView[] {
    return this.byPreference(
      state.agents.filter((agent) => this.isRested(agent) && agent.assignment?.kind === 'Training'),
    );
  }

  /** Step 1: recall an Agent on Contracting or Training whose exhaustion is too high for a Rested Agent. */
  private async recallTired(state: CurrentStateView): Promise<boolean> {
    const rate = this.data.economy['contractingIncomePerAgent'] ?? 0;
    for (const agent of state.agents) {
      const kind = agent.assignment?.kind;
      if (!agent.canBeOrdered || agent.exhaustion <= this.t.restedExhaustion) {
        continue;
      }
      const recall =
        kind === 'Training' ||
        (kind === 'Contracting' && this.expectedIncome(state) - rate >= this.incomeTarget(state));
      if (
        recall &&
        (await this.act(`recall ${agent.id}`, () => this.player.actions.assignAgents([agent.id], 'Standby')))
      ) {
        return true;
      }
    }
    return false;
  }

  /** Steps 2 and 4: order one more Agent to Contracting while Expected income is below the target. */
  private async restoreIncome(state: CurrentStateView, urgent: boolean): Promise<boolean> {
    const target = urgent ? state.agency.projectedUpkeep : this.incomeTarget(state);
    if (this.expectedIncome(state) >= target) {
      return false;
    }
    const candidates = urgent
      ? this.byPreference(
          state.agents.filter(
            (agent) =>
              agent.canBeOrdered &&
              (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training') &&
              agent.exhaustion <= this.t.urgentExhaustion,
          ),
        )
      : [...this.freeStandby(state), ...this.restedOnTraining(state)];
    for (const agent of candidates) {
      if (
        await this.act(`contract ${agent.id}`, () =>
          this.player.actions.assignAgents([agent.id], 'Contracting'),
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /** Step 3: deploy to the most urgent Mission site for which a winning team can be formed. */
  private async deploy(state: CurrentStateView): Promise<boolean> {
    const urgency = (site: MissionSiteView) => (site.kind === 'Response' ? 0 : 1);
    const sites = state.missionSites
      .filter((site) => site.lifecycle === 'Active')
      .map((site, index) => ({ site, index }))
      .sort(
        (a, b) =>
          urgency(a.site) - urgency(b.site) ||
          a.site.turnsUntilExpiry - b.site.turnsUntilExpiry ||
          a.index - b.index,
      );
    const rested = this.byPreference(state.agents.filter((agent) => this.isRested(agent)));
    for (const { site } of sites) {
      const team = this.winningTeam(state, site.enemiesCombatRating, site.enemies.length, rested);
      if (
        team !== null &&
        (await this.act(`deploy ${site.id}`, () => this.player.actions.deployAgents(site.id, team)))
      ) {
        return true;
      }
    }
    return false;
  }

  /** Step 5: bring the number of Agents investigating Leads up to its target share. */
  private async investigate(state: CurrentStateView): Promise<boolean> {
    const investigating = state.agents.filter((agent) => agent.assignment?.kind === 'Investigation').length;
    const target =
      this.t.baseInvestigators + Math.floor(state.agency.servingAgents / this.t.investigatorsPerRoster);
    const candidates = [...this.freeStandby(state), ...this.restedOnTraining(state)];
    const count = Math.min(target - investigating, candidates.length);
    if (count <= 0) {
      return false;
    }
    const team = candidates.slice(0, count).map((agent) => agent.id);
    const rested = this.byPreference(state.agents.filter((agent) => this.isRested(agent)));
    // A Lead is investigated only if a winning team for the Mission site it creates could be formed now.
    const winnable = (leadId: string): boolean => {
      const lead = state.leads.find((item) => item.id === leadId);
      const archetype = this.data.missionSiteArchetypes.find((item) => item.id === lead?.createsMissionSite);
      if (archetype === undefined) {
        return false;
      }
      const enemyCount = archetype.enemies.reduce((sum, entry) => sum + entry.count, 0);
      return this.winningTeam(state, archetype.enemiesCombatRating, enemyCount, rested) !== null;
    };
    // Effort is concentrated: an Active Investigation receives Agents before another Lead is started.
    const [active] = state.investigations;
    if (active !== undefined) {
      if (!winnable(active.lead)) {
        return false;
      }
      return this.act(`join ${active.id}`, () =>
        this.player.actions.assignAgentsToInvestigation(active.id, team),
      );
    }
    // A Lead whose Won Mission site makes further Leads available or makes a Faction Defeated comes first.
    const opensMore = (leadId: string, site: string): boolean =>
      state.leads.some((other) => other.requires.some((required) => required.lead === leadId)) ||
      this.data.missionSiteArchetypes.find((item) => item.id === site)?.onWin?.defeatsTargetFaction === true;
    const leads = [
      ...state.leads.filter((lead) => opensMore(lead.id, lead.createsMissionSite)),
      ...state.leads.filter((lead) => !opensMore(lead.id, lead.createsMissionSite)),
    ];
    for (const lead of leads) {
      if (!lead.canBeInvestigatedNow || !winnable(lead.id)) {
        continue;
      }
      if (await this.act(`start ${lead.id}`, () => this.player.actions.startInvestigation(lead.id, team))) {
        return true;
      }
    }
    return false;
  }

  /** Step 6: order the remaining Rested Agents on Standby to Training, then to Contracting. */
  private async employIdle(state: CurrentStateView): Promise<boolean> {
    const idle = this.freeStandby(state);
    const places = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
    const toTraining = idle.slice(0, places).map((agent) => agent.id);
    const toContracting = idle.slice(places).map((agent) => agent.id);
    if (
      toTraining.length > 0 &&
      (await this.act('train idle', () => this.player.actions.assignAgents(toTraining, 'Training')))
    ) {
      return true;
    }
    return (
      toContracting.length > 0 &&
      (await this.act('contract idle', () => this.player.actions.assignAgents(toContracting, 'Contracting')))
    );
  }

  /** Step 7: while money stays above the Savings floor, make the most needed purchase. */
  private async purchase(state: CurrentStateView): Promise<boolean> {
    const agency = state.agency;
    // Stay solvent: while Expected income does not cover projected upkeep, nothing is bought.
    if (this.expectedIncome(state) < agency.projectedUpkeep) {
      return false;
    }
    const budget = agency.money - this.savingsFloor(state);
    // The roster target grows with the Upgrades that make every Agent more effective. Counting the cap Upgrades
    // too would let each Agent cap purchase call for the next one.
    const bought = agency.upgrades
      .filter((upgrade) => !upgrade.effect.endsWith('_cap'))
      .reduce((sum, upgrade) => sum + upgrade.acquisitions, 0);
    const targetRoster = this.t.baseRoster + this.t.rosterPerUpgrade * bought;
    const buy = (effect: string): Promise<boolean> => {
      // Among several Upgrades with one effect, the one bought least often comes first.
      const upgrade = [...agency.upgrades]
        .filter((item) => item.effect === effect && item.increment > 0)
        .sort((a, b) => a.acquisitions - b.acquisitions || a.price - b.price)[0];
      if (upgrade === undefined || upgrade.price > budget) {
        return Promise.resolve(false);
      }
      return this.act(`buy ${upgrade.id}`, () => this.player.actions.purchaseUpgrade(upgrade.id));
    };
    if (agency.servingAgents < targetRoster && agency.servingAgents < agency.agentCap) {
      return agency.hireCost <= budget && (await this.act('hire', () => this.player.actions.hireAgent()));
    }
    if (agency.servingAgents < targetRoster) {
      return buy('agent_cap');
    }
    if (agency.transportCap * 100 < agency.servingAgents * this.t.transportCapPct) {
      return buy('transport_cap');
    }
    if (agency.trainingCap * 100 < agency.servingAgents * this.t.trainingCapPct) {
      return buy('training_cap');
    }
    return buy('agent_weapon_damage');
  }

  /** Makes the next Player action of the Turn routine. Returns false once it has advanced the turn. */
  private async next(): Promise<boolean> {
    const state = this.state();
    if (
      (await this.recallTired(state)) ||
      (await this.restoreIncome(state, true)) ||
      (await this.deploy(state)) ||
      (await this.restoreIncome(state, false)) ||
      (await this.investigate(state)) ||
      (await this.employIdle(state)) ||
      (await this.purchase(state))
    ) {
      return true;
    }
    await this.act('advance turn', () => this.player.actions.advanceTurn());
    return false;
  }

  async run(): Promise<void> {
    // The bound only guards against a defect; every order puts its Agent In transit, so a Turn has few actions.
    for (let actions = 0; actions < 10_000; actions += 1) {
      if (!(await this.next())) {
        return;
      }
    }
  }
}

/** The Basic Autopilot AI, with the given thresholds. */
export function createBasicAutopilotAi(thresholds: BasicAiThresholds = BASIC_AI_THRESHOLDS): AutopilotAi {
  return {
    id: 'basic',
    name: 'Basic Autopilot AI',
    async step({ player }) {
      try {
        await new Turn(player, thresholds).run();
      } catch (error) {
        if (!(error instanceof EngagementOver)) {
          throw error;
        }
      }
    },
  };
}
