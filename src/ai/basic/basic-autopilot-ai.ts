/**
 * BASICAI (Basic Autopilot AI): a sound, cautious player. It reaches the game only through Player API, decides each
 * Player action from the current Player-visible information alone, and keeps no plan across turns. When no step of
 * its Turn routine has a Player action left to make, it requests Advance turn, which the engine withholds under the
 * Autopilot limits `singleAction` and `turnActions`. Its thresholds are the Implementer's choice; see DEC-021.
 */
import type {
  AgentView,
  AutopilotAi,
  CurrentLiveWorldStateView,
  GameDataView,
  LeadView,
  MissionSiteView,
  PlayerApi,
  Result,
} from '../../engine/player-api.ts';

export interface BasicAiThresholds {
  /**
   * Max assignment exhaustion allowed: step 1 recalls an Agent on Training or Contracting with more exhaustion to
   * Standby. A value of exhaustion_work_limit or more has the effect of exhaustion_work_limit, because Forced return
   * sends the Agent to Standby first; that is the neutral value, with which step 1 recalls no Agent.
   */
  readonly maxAssignmentExhaustionAllowed: number;
  /** The target size of the Agent reserve, as a Percent value of the roster. */
  readonly reservePct: number;
  /** The Expected income to keep, as a Percent value of projected upkeep. */
  readonly incomeTargetPct: number;
  /** The Savings floor, in Turns of projected upkeep. */
  readonly savingsFloorTurns: number;
  /** The Muster horizon: the most Advance turns within which the last Agent of a Muster must become Deployable. */
  readonly musterHorizonTurns: number;
  /** The Muster income floor: the least Expected income a recall for a Muster may leave, as a Percent value of upkeep. */
  readonly musterIncomeFloorPct: number;
  /**
   * The Combat margin: the Combat rating a team needs while no Mission of the same MissionSiteArchetype is Lost, as a
   * Percent value of the Enemies' Combat rating.
   */
  readonly combatMarginPct: number;
  /**
   * The Loss margin step: how many percentage points each Lost Mission at a Mission site of one MissionSiteArchetype
   * adds to the Combat rating a team needs for later Mission sites of that MissionSiteArchetype.
   */
  readonly lossMarginStepPct: number;
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
  /**
   * The most Agents step 7 puts on Training, as a Percent value of the roster; 100 leaves only the Training cap as the
   * limit.
   */
  readonly trainingSharePct: number;
  /**
   * The Agents step 5 keeps on Contracting even once Expected income meets its target, as a Percent value of the
   * roster; 0 leaves only the Expected income target.
   */
  readonly contractingSharePct: number;
  /**
   * The weight of each Upgrade other than the Cap Upgrades in the rotation, by Upgrade ID; an Upgrade it does not name
   * has weight 1, and one with weight 0 is never bought. The rotation buys the Upgrade with the fewest acquisitions per
   * unit of weight, so an Upgrade of weight 2 is bought about twice as often as one of weight 1.
   */
  readonly upgradeWeights: Readonly<Record<string, number>>;
}

/**
 * BASICAI, Glossary, Required rating share: the Combat margin plus the Loss margin step for each Lost Mission at a
 * Mission site of the MissionSiteArchetype, as a Percent value. Every Lost Mission counts, whoever deployed its team,
 * because the Player-visible Missions do not say who did.
 */
export function requiredRatingSharePct(
  thresholds: Pick<BasicAiThresholds, 'combatMarginPct' | 'lossMarginStepPct'>,
  missionSites: readonly { readonly id: string; readonly archetype: string }[],
  missions: readonly { readonly missionSite: string; readonly lifecycle: string }[],
  archetype: string,
): number {
  const archetypeOf = new Map(missionSites.map((site) => [site.id, site.archetype] as const));
  const lost = missions.filter(
    (mission) => mission.lifecycle === 'Lost' && archetypeOf.get(mission.missionSite) === archetype,
  ).length;
  return thresholds.combatMarginPct + thresholds.lossMarginStepPct * lost;
}

/** BASICAI, Deploy only to win: a team qualifies when its Combat rating is at least the share of the Enemies'. */
export function meetsRequiredShare(teamRating: number, enemiesRating: number, requiredPct: number): boolean {
  return teamRating * 100 >= enemiesRating * requiredPct;
}

/** The thresholds of this Game build, tuned against Campaigns of many Campaign seeds; see DEC-021. */
export const BASIC_AI_THRESHOLDS: BasicAiThresholds = {
  // The neutral value: exhaustion_work_limit of the Bootstrap GDRs.
  maxAssignmentExhaustionAllowed: 70,
  reservePct: 20,
  incomeTargetPct: 120,
  // BASICAI, Game designer values: the Savings floor is 3 Turns of projected upkeep.
  savingsFloorTurns: 3,
  // BASICAI, Game designer values: Muster horizon 2 Advance turns and Muster income floor 60% of projected upkeep.
  musterHorizonTurns: 2,
  musterIncomeFloorPct: 60,
  // BASICAI, Game designer values: Combat margin 100% and Loss margin step 5 percentage points.
  combatMarginPct: 100,
  lossMarginStepPct: 5,
  // BASICAI, Game designer values: Enemies per Agent 2.5, a Target roster of 20 plus 20 for each Upgrade other than
  // a Cap Upgrade bought, and Upgrade weights of 2 for armor, training_skill_gain, exhaustion_recovery, and
  // health_recovery.
  enemiesPerAgent: 2.5,
  baseInvestigators: 1,
  investigatorsPerRoster: 10,
  baseRoster: 20,
  rosterPerUpgrade: 20,
  transportCapPct: 40,
  trainingCapPct: 30,
  trainingSharePct: 100,
  contractingSharePct: 0,
  upgradeWeights: { armor: 2, training_skill_gain: 2, exhaustion_recovery: 2, health_recovery: 2 },
};

/** Thrown inside a step when the Autopilot engagement has ended, so that the step makes no further call. */
class EngagementOver extends Error {}

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/** BASICAI, Glossary, Muster: the Mustered Agents and the Agents on Contracting among them that step 3 recalls. */
type Muster = { readonly agents: ReadonlySet<string>; readonly recall: readonly string[] } | null;

/** Whether an Agent is a Mustered Agent, which keeps the Assignment it has. */
const mustered = (muster: Muster, agent: AgentView): boolean => muster?.agents.has(agent.id) ?? false;

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

  private state(): CurrentLiveWorldStateView {
    return this.unwrap(this.player.queries.getCurrentLiveWorldState());
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

  private onStandbyOrTraining(agent: AgentView): boolean {
    return agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training';
  }

  /**
   * A Deployable Agent: one `deployAgents` accepts. It is In base and can take orders, so it is At assignment on
   * Standby or Training; it is Fit to start work; and it does not meet the incapacitation condition with its current
   * values.
   */
  private isDeployable(agent: AgentView): boolean {
    return (
      agent.canBeAssigned &&
      agent.inBase &&
      this.onStandbyOrTraining(agent) &&
      agent.fitForWork &&
      agent.ableToFight
    );
  }

  /**
   * A Fully rested Deployable Agent: a Deployable Agent with no health lost and exhaustion 0. Only such Agents
   * receive routine work.
   */
  private isFullyRested(agent: AgentView): boolean {
    return this.isDeployable(agent) && agent.healthLostHundredths === 0 && agent.exhaustion === 0;
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

  /**
   * Expected income: funding plus the contributions of every Agent whose Current assignment is Contracting, each
   * from its current effective skill, rounded down once in total as ECON, Agency income computes them.
   * `without` leaves one Agent out.
   */
  private expectedIncome(state: CurrentLiveWorldStateView, without: string | null = null): number {
    return this.incomeOf(
      state,
      state.agents.filter((agent) => agent.assignment?.kind === 'Contracting' && agent.id !== without),
    );
  }

  /**
   * Funding plus the contributions of `contractors`, rounded down once in total. A contribution is
   * rate × (1 + (effective skill − 100) / scale), so scale times it is the whole number
   * rate × (scale − 100 + effective skill).
   */
  private incomeOf(
    state: CurrentLiveWorldStateView,
    contractors: readonly { effectiveSkill: number }[],
  ): number {
    const rate = this.data.economy['contractingIncomePerAgent'] ?? 0;
    const scale = this.data.economy['contractingSkillScale'] ?? 1;
    const timesScale = contractors.reduce(
      (sum, agent) => sum + rate * (scale - 100 + agent.effectiveSkill),
      0,
    );
    return state.agency.funding + Math.floor(timesScale / scale);
  }

  private incomeTarget(state: CurrentLiveWorldStateView): number {
    return ceilDiv(state.agency.projectedUpkeep * this.t.incomeTargetPct, 100);
  }

  /** The target size of the Agent reserve. */
  private reserveTarget(state: CurrentLiveWorldStateView): number {
    return Math.floor((state.agency.servingAgents * this.t.reservePct) / 100);
  }

  /**
   * The Expected reserve: the Deployable Agents, plus every other Agent whose Current assignment is Standby or Recovery,
   * In transit or not.
   */
  private expectedReserve(state: CurrentLiveWorldStateView): number {
    return state.agents.filter(
      (agent) =>
        this.isDeployable(agent) ||
        agent.assignment?.kind === 'Standby' ||
        agent.assignment?.kind === 'Recovery',
    ).length;
  }

  /** How many Deployable Agents there are beyond the target size of the Agent reserve. */
  private beyondReserve(state: CurrentLiveWorldStateView): number {
    const deployable = state.agents.filter((agent) => this.isDeployable(agent)).length;
    return Math.max(0, deployable - this.reserveTarget(state));
  }

  /**
   * The Fully rested Deployable Agents beyond the Agent reserve, in order of preference. The most rested are taken for
   * work first, so the Deployable Agents left over form the Agent reserve.
   */
  private fullyRestedBeyondReserve(state: CurrentLiveWorldStateView, standbyOnly = false): AgentView[] {
    const fullyRested = this.byPreference(
      state.agents.filter(
        (agent) => this.isFullyRested(agent) && (!standbyOnly || agent.assignment?.kind === 'Standby'),
      ),
    );
    return fullyRested.slice(0, this.beyondReserve(state));
  }

  /** BASICAI, Game designer values: the Savings floor, a number of Turns of projected upkeep. */
  private savingsFloor(state: CurrentLiveWorldStateView): number {
    return state.agency.projectedUpkeep * this.t.savingsFloorTurns;
  }

  /** The Muster income floor: the least Expected income a recall for the Muster may leave. */
  private musterIncomeFloor(state: CurrentLiveWorldStateView): number {
    return ceilDiv(state.agency.projectedUpkeep * this.t.musterIncomeFloorPct, 100);
  }

  /**
   * In how many Advance turns an Agent that is not a Deployable Agent becomes one, if left where it is, or null when it
   * does not within the Muster horizon or is not a Mustered Agent. An Agent on Contracting that is Fit to start work
   * becomes one when its recall arrives, after one Advance turn, because exhaustion does not change In transit. An
   * Agent on Standby or Recovery becomes one once its exhaustion has recovered to exhaustion_work_start_max and its
   * health lost to 0 at the Agency's current rates; one In transit to Standby first arrives, which costs an Advance
   * turn without recovery.
   */
  private turnsUntilDeployable(state: CurrentLiveWorldStateView, agent: AgentView): number | null {
    const kind = agent.assignment?.kind;
    if (kind === 'Contracting') {
      return agent.canBeAssigned && agent.fitForWork && agent.ableToFight ? 1 : null;
    }
    if (kind !== 'Standby' && kind !== 'Recovery') {
      return null;
    }
    const startMaxHundredths = (this.data.agentParameters['exhaustionWorkStartMax'] ?? 0) * 100;
    const rate = state.agency.exhaustionRecoveryHundredths;
    const over = agent.exactExhaustionHundredths - startMaxHundredths;
    const exhaustionTurns = over <= 0 ? 0 : rate > 0 ? ceilDiv(over, rate) : Infinity;
    const healthTurns = agent.healthLostHundredths <= 0 ? 0 : (agent.recoveryTurnsRemaining ?? Infinity);
    const turns = (agent.inBase ? 0 : 1) + Math.max(exhaustionTurns, healthTurns);
    return turns >= 1 && turns <= this.t.musterHorizonTurns ? turns : null;
  }

  /**
   * BASICAI, Turn routine, step 3: the Muster, for the most urgent Active Initiative Mission site that Deployable Agents
   * alone cannot win and for which a winning team can be gathered: Deployable Agents first, then the Mustered Agents
   * that become Deployable Agents soonest, a resting Agent before an Agent on Contracting that becomes one as soon, and
   * the last of them within the Muster horizon and before the Mission site expires. None when the recalls it needs would
   * leave Expected income below the Muster income floor. It is derived anew from the current state for every Player
   * action, so the Basic Autopilot AI keeps no plan across Turns.
   */
  private muster(state: CurrentLiveWorldStateView): Muster {
    const deployable = this.byPreference(state.agents.filter((agent) => this.isDeployable(agent)));
    const pending = state.agents
      .map((agent, index) => ({
        agent,
        index,
        turns: this.isDeployable(agent) ? null : this.turnsUntilDeployable(state, agent),
      }))
      .filter((item): item is { agent: AgentView; index: number; turns: number } => item.turns !== null)
      .sort(
        (a, b) =>
          a.turns - b.turns ||
          Number(a.agent.assignment?.kind === 'Contracting') -
            Number(b.agent.assignment?.kind === 'Contracting') ||
          b.agent.effectiveSkill - a.agent.effectiveSkill ||
          a.index - b.index,
      );
    if (pending.length === 0) {
      return null;
    }
    const sites = state.missionSites
      .filter((site) => site.lifecycle === 'Active' && site.kind === 'Initiative')
      .map((site, index) => ({ site, index }))
      .sort((a, b) => a.site.turnsUntilExpiration - b.site.turnsUntilExpiration || a.index - b.index)
      .map((item) => item.site);
    const places = state.agency.transportCap - state.agency.deployedAgents;
    for (const site of sites) {
      const requiredPct = this.requiredPct(state, site.archetype);
      if (
        this.winningTeam(state, site.enemiesCombatRating, site.enemies.length, deployable, requiredPct) !==
        null
      ) {
        continue;
      }
      const needed = Math.max(1, Math.ceil(site.enemies.length / this.t.enemiesPerAgent - 1e-9));
      const latest = Math.min(this.t.musterHorizonTurns, site.turnsUntilExpiration - 1);
      const team: AgentView[] = [];
      for (const candidate of [
        ...deployable,
        ...pending.filter((item) => item.turns <= latest).map((item) => item.agent),
      ]) {
        if (team.length >= places) {
          break;
        }
        team.push(candidate);
        if (team.length < needed) {
          continue;
        }
        const preview = this.unwrap(
          this.player.queries.previewDeployment(
            null,
            team.map((agent) => agent.id),
          ),
        );
        if (!meetsRequiredShare(preview.teamCombatRating, site.enemiesCombatRating, requiredPct)) {
          continue;
        }
        const recall = team
          .filter((agent) => agent.assignment?.kind === 'Contracting')
          .map((agent) => agent.id);
        const left = new Set(recall);
        const incomeAfter = this.incomeOf(
          state,
          state.agents.filter((agent) => agent.assignment?.kind === 'Contracting' && !left.has(agent.id)),
        );
        if (incomeAfter < this.musterIncomeFloor(state)) {
          return null;
        }
        return { agents: new Set(team.map((agent) => agent.id)), recall };
      }
    }
    return null;
  }

  /** The Required rating share of a MissionSiteArchetype, from the Retired Missions, where every Lost one is. */
  private requiredPct(state: CurrentLiveWorldStateView, archetype: string): number {
    const retired = this.unwrap(this.player.queries.getCurrentRetiredWorldState());
    return requiredRatingSharePct(
      this.t,
      [...retired.missionSites, ...state.missionSites],
      retired.missions,
      archetype,
    );
  }

  /**
   * A team of Deployable Agents whose Combat rating is at least the Required rating share of the Enemies' Combat rating
   * and that has enough Agents for the number of Enemies; none when no such team fits within the Transport cap. Agents are
   * taken in the order of preference; when that order gives no winning team, the most capable are taken first,
   * because a winning team can then still be formed.
   */
  private winningTeam(
    state: CurrentLiveWorldStateView,
    enemiesRating: number,
    enemyCount: number,
    deployable: readonly AgentView[],
    requiredPct: number,
  ): string[] | null {
    const places = state.agency.transportCap - state.agency.deployedAgents;
    // One Agent may answer for a fractional number of Enemies, e.g. 1.5.
    const needed = Math.max(1, Math.ceil(enemyCount / this.t.enemiesPerAgent - 1e-9));
    const strongestFirst = [...deployable]
      .map((agent, index) => ({ agent, index }))
      .sort((x, y) => y.agent.effectiveSkill - x.agent.effectiveSkill || x.index - y.index)
      .map((item) => item.agent);
    for (const candidates of [deployable, strongestFirst]) {
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
        if (meetsRequiredShare(preview.teamCombatRating, enemiesRating, requiredPct)) {
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

  /**
   * Step 1: recall an Agent on Training or Contracting whose exhaustion is above Max assignment exhaustion allowed,
   * an Agent on Contracting only while Expected income still covers projected upkeep with the margin without it.
   */
  private async recallTired(state: CurrentLiveWorldStateView): Promise<boolean> {
    for (const agent of state.agents) {
      const kind = agent.assignment?.kind;
      if (!agent.canBeAssigned || agent.exhaustion <= this.t.maxAssignmentExhaustionAllowed) {
        continue;
      }
      const recall =
        kind === 'Training' ||
        (kind === 'Contracting' && this.expectedIncome(state, agent.id) >= this.incomeTarget(state));
      if (
        recall &&
        (await this.act(`recall ${agent.id}`, () => this.player.actions.assignAgents([agent.id], 'Standby')))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Steps 2 and 5: order one more Agent to Contracting while Expected income is below the target. For urgent income
   * (step 2) every Agent on Standby or Training that is Fit to start work may go, the Agent reserve too; otherwise
   * (step 5) only Fully rested Deployable Agents beyond the Agent reserve.
   */
  private async restoreIncome(
    state: CurrentLiveWorldStateView,
    urgent: boolean,
    muster: Muster,
  ): Promise<boolean> {
    const target = urgent ? state.agency.projectedUpkeep : this.incomeTarget(state);
    // An Agent In transit to Contracting has the Current assignment Contracting already.
    const contracting = state.agents.filter((agent) => agent.assignment?.kind === 'Contracting').length;
    const shareShort = !urgent && contracting * 100 < state.agency.servingAgents * this.t.contractingSharePct;
    if (this.expectedIncome(state) >= target && !shareShort) {
      return false;
    }
    // A Mustered Agent goes to Contracting only for urgent income, and only below the Muster income floor.
    const mayTake = (agent: AgentView) =>
      !mustered(muster, agent) || (urgent && this.expectedIncome(state) < this.musterIncomeFloor(state));
    const candidates = (
      urgent
        ? this.byPreference(
            state.agents.filter(
              (agent) => agent.canBeAssigned && agent.fitForWork && this.onStandbyOrTraining(agent),
            ),
          )
        : this.fullyRestedBeyondReserve(state)
    ).filter(mayTake);
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

  /**
   * Step 3: deploy to the most urgent Mission site for which a winning team can be formed; otherwise recall the next
   * Agent on Contracting of the Muster to Standby.
   */
  private async deploy(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    const urgency = (site: MissionSiteView) => (site.kind === 'Response' ? 0 : 1);
    const sites = state.missionSites
      .filter((site) => site.lifecycle === 'Active')
      .map((site, index) => ({ site, index }))
      .sort(
        (a, b) =>
          urgency(a.site) - urgency(b.site) ||
          a.site.turnsUntilExpiration - b.site.turnsUntilExpiration ||
          a.index - b.index,
      );
    const deployable = this.byPreference(state.agents.filter((agent) => this.isDeployable(agent)));
    for (const { site } of sites) {
      const team = this.winningTeam(
        state,
        site.enemiesCombatRating,
        site.enemies.length,
        deployable,
        this.requiredPct(state, site.archetype),
      );
      if (
        team !== null &&
        (await this.act(`deploy ${site.id}`, () => this.player.actions.deployAgents(site.id, team)))
      ) {
        return true;
      }
    }
    for (const id of muster?.recall ?? []) {
      if (await this.act(`muster ${id}`, () => this.player.actions.assignAgents([id], 'Standby'))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 4: while the Expected reserve is below its target size, recall one Agent at a time to Standby: the most
   * exhausted Agent that does not already count toward the Expected reserve, i.e. any Agent on Contracting and any
   * Agent on Training that is not a Deployable Agent; on equal exhaustion an Agent on Training before an Agent on
   * Contracting, then the order of the roster. An Agent on Contracting whose recall would leave Expected income short
   * of projected upkeep with the margin is passed over. A recalled Agent counts toward the Expected reserve at once,
   * so no more Agents are recalled than the shortfall.
   */
  private async refillReserve(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    if (this.expectedReserve(state) >= this.reserveTarget(state)) {
      return false;
    }
    const trainingFirst = (agent: AgentView) => (agent.assignment?.kind === 'Training' ? 0 : 1);
    const candidates = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(
        ({ agent }) =>
          agent.canBeAssigned &&
          !mustered(muster, agent) &&
          (agent.assignment?.kind === 'Contracting' ||
            (agent.assignment?.kind === 'Training' && !this.isDeployable(agent))),
      )
      .sort(
        (a, b) =>
          b.agent.exhaustion - a.agent.exhaustion ||
          trainingFirst(a.agent) - trainingFirst(b.agent) ||
          a.index - b.index,
      )
      .map((item) => item.agent);
    for (const agent of candidates) {
      if (
        (agent.assignment?.kind === 'Training' ||
          this.expectedIncome(state, agent.id) >= this.incomeTarget(state)) &&
        (await this.act(`recall ${agent.id}`, () => this.player.actions.assignAgents([agent.id], 'Standby')))
      ) {
        return true;
      }
    }
    return false;
  }

  /** Step 6: bring the number of Agents investigating Leads up to its target share. */
  private async investigate(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    const investigating = state.agents.filter((agent) => agent.assignment?.kind === 'Investigation').length;
    const target =
      this.t.baseInvestigators + Math.floor(state.agency.servingAgents / this.t.investigatorsPerRoster);
    const candidates = this.fullyRestedBeyondReserve(state).filter((agent) => !mustered(muster, agent));
    const count = Math.min(target - investigating, candidates.length);
    if (count <= 0) {
      return false;
    }
    const team = candidates.slice(0, count).map((agent) => agent.id);
    const deployable = this.byPreference(state.agents.filter((agent) => this.isDeployable(agent)));
    const retired = this.unwrap(this.player.queries.getCurrentRetiredWorldState());
    // A Lead that creates no Mission site advances progression by its completion alone, so it is always worth
    // investigating. One that creates a Mission site is worth it only if a winning team for that Mission site could be
    // formed now.
    const worthInvestigating = (leadId: string): boolean => {
      const lead = retired.leads.find((item) => item.id === leadId);
      if (lead === undefined) {
        return false;
      }
      if (lead.createsMissionSite === null) {
        return true;
      }
      const archetype = this.data.missionSiteArchetypes.find((item) => item.id === lead.createsMissionSite);
      if (archetype === undefined) {
        return false;
      }
      const enemyCount = archetype.enemies.reduce((sum, entry) => sum + entry.count, 0);
      return (
        this.winningTeam(
          state,
          archetype.enemiesCombatRating,
          enemyCount,
          deployable,
          this.requiredPct(state, archetype.id),
        ) !== null
      );
    };
    // Effort is concentrated: an Active Investigation receives Agents before another Lead is started.
    const [active] = state.investigations;
    if (active !== undefined) {
      if (!worthInvestigating(active.lead)) {
        return false;
      }
      return this.act(`join ${active.id}`, () =>
        this.player.actions.assignAgentsToInvestigation(active.id, team),
      );
    }
    // A Lead whose completion wins the Campaign comes first, then one whose completion makes a Faction Eliminated,
    // directly or through a Won Mission at the Mission site it creates, then the one furthest along its Faction's
    // chain. What discovers a Lead is not Player-visible, so how far along its chain a Lead is is read as its
    // Initiative operation level, which Player API returns with the Lead; a Lead with no level comes after every Lead
    // with one. Equal Leads keep the order Player API lists them in.
    const eliminates = (lead: LeadView): boolean =>
      lead.eliminatesFaction ||
      this.data.missionSiteArchetypes.find((item) => item.id === lead.createsMissionSite)?.onWin
        ?.eliminatesTargetFaction === true;
    // The Leads a Mission from which is Won, read from the Retired Mission sites and Missions.
    const wonSites = new Set(
      retired.missions.filter((mission) => mission.lifecycle === 'Won').map((mission) => mission.missionSite),
    );
    const missionWon = new Set(
      retired.missionSites
        .filter((site) => site.lead !== null && wonSites.has(site.id))
        .map((site) => site.lead),
    );
    const chainPosition = (lead: LeadView): number => lead.initiativeOperationLevel ?? -1;
    const rank = (lead: LeadView): number => (lead.winsCampaign ? 2 : eliminates(lead) ? 1 : 0);
    const leads = [...retired.leads].sort((a, b) => rank(b) - rank(a) || chainPosition(b) - chainPosition(a));
    // A Lead a Mission from which was already Won is investigated again only when no other Lead qualifies.
    const ordered = [
      ...leads.filter((lead) => !missionWon.has(lead.id)),
      ...leads.filter((lead) => missionWon.has(lead.id)),
    ];
    for (const lead of ordered) {
      if (!lead.canBeInvestigatedNow || !worthInvestigating(lead.id)) {
        continue;
      }
      if (await this.act(`start ${lead.id}`, () => this.player.actions.startInvestigation(lead.id, team))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 7: order the remaining Fully rested Deployable Agents on Standby to Training while the Training cap allows, the Agent reserve
   * too, then those beyond the Agent reserve to Contracting.
   */
  private async employIdle(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    const share = Math.floor((state.agency.servingAgents * this.t.trainingSharePct) / 100);
    const places = Math.max(0, Math.min(state.agency.trainingCap, share) - state.agency.trainingAgents);
    const toTraining = this.byPreference(
      state.agents.filter(
        (agent) =>
          this.isFullyRested(agent) && agent.assignment?.kind === 'Standby' && !mustered(muster, agent),
      ),
    )
      .slice(0, places)
      .map((agent) => agent.id);
    if (
      toTraining.length > 0 &&
      (await this.act('train idle', () => this.player.actions.assignAgents(toTraining, 'Training')))
    ) {
      return true;
    }
    const toContracting = this.fullyRestedBeyondReserve(state, true)
      .filter((agent) => !mustered(muster, agent))
      .map((agent) => agent.id);
    return (
      toContracting.length > 0 &&
      (await this.act('contract idle', () => this.player.actions.assignAgents(toContracting, 'Contracting')))
    );
  }

  /** Step 8: while money stays above the Savings floor, make the most needed purchase. */
  private async purchase(state: CurrentLiveWorldStateView): Promise<boolean> {
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
        .filter((item) => item.effect === effect && item.incrementHundredths > 0)
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
    // Otherwise rotate among the Upgrades that make every Agent more effective: the one bought least often for its
    // weight comes first, and the cheaper of two equal ones. With every weight 1 this is the one bought least often.
    const weight = (id: string): number => this.t.upgradeWeights[id] ?? 1;
    const effective = [...agency.upgrades]
      .filter((item) => !item.effect.endsWith('_cap') && item.incrementHundredths > 0 && weight(item.id) > 0)
      .map((item) => ({ item, due: (item.acquisitions + 1) / weight(item.id) }))
      .sort((a, b) => a.due - b.due || a.item.price - b.item.price)
      .map(({ item }) => item)[0];
    if (effective === undefined || effective.price > budget) {
      return false;
    }
    return this.act(`buy ${effective.id}`, () => this.player.actions.purchaseUpgrade(effective.id));
  }

  /** Makes the next Player action of the Turn routine. Returns false once it has advanced the turn. */
  private async next(): Promise<boolean> {
    const state = this.state();
    // Every step reads the Muster as step 3 forms it from the current state.
    const muster = this.muster(state);
    if (
      (await this.recallTired(state)) ||
      (await this.restoreIncome(state, true, muster)) ||
      (await this.deploy(state, muster)) ||
      (await this.refillReserve(state, muster)) ||
      (await this.restoreIncome(state, false, muster)) ||
      (await this.investigate(state, muster)) ||
      (await this.employIdle(state, muster)) ||
      (await this.purchase(state))
    ) {
      return true;
    }
    await this.act('advance turn', () => this.player.actions.advanceTurn());
    return false;
  }

  async run(): Promise<void> {
    // The bound only guards against a defect: every order either puts its Agent In transit or moves it within base,
    // and no step moves an Agent back to where an earlier step took it, so a Turn has few actions.
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
