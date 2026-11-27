/**
 * BASICAI (Basic Autopilot AI): it races the Factions' clock. It reaches the game only through Player API, decides each
 * Player action from the current Player-visible information alone, and keeps no plan across Turns. Its Strike team, the
 * strongest Agents the Transport cap carries, stays in base sized to the Strike goal; while it falls short, money buys
 * it strength. Every other Agent researches or earns. When no step of its Turn routine has a Player action left to
 * make, it requests Advance turn, which the engine withholds under the Autopilot limits `singleAction` and
 * `turnActions`.
 */
import type {
  AgentView,
  AutopilotAi,
  CommitOutcome,
  CurrentLiveWorldStateView,
  GameDataView,
  ItemEntryView,
  MissionSiteView,
  PlayerApi,
  Result,
  WorldStateChanges,
} from '../../engine/player-api.ts';
import { applyWorldStateChanges, type WorldStateViews } from '../world-state-changes.ts';
import {
  decimal,
  memberWeight,
  ratingOf,
  ratingParameters,
  sideRating,
  type RatedMember,
  type RatingParameters,
} from './rating.ts';
import { leadsToInvestigate, makePlan, type Plan } from './strategy.ts';
import {
  agentsNeeded,
  BASIC_AI_THRESHOLDS,
  meetsRequiredShare,
  requiredRatingSharePct,
  type BasicAiThresholds,
} from './tuning.ts';

/** Thrown inside a step when the Autopilot engagement has ended, so that the step makes no further call. */
class EngagementOver extends Error {}

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/**
 * One Agent as a team member: the effective skill and exhaustion it is judged by, and in how many Advance turns it is
 * a Deployable Agent; 0 for one that is a Deployable Agent now.
 */
interface Candidate {
  readonly agent: AgentView;
  readonly index: number;
  readonly effectiveSkill: number;
  readonly exhaustion: number;
  readonly turns: number;
  /** 0 for a Deployable Agent now, 1 for a Projected Agent that becomes one later, 2 for a Contractor. */
  readonly group: number;
}

/** BASICAI, Deploying and mustering: the lowest exhaustion first, then the highest effective skill, then roster order. */
const byDeployPreference = (a: Candidate, b: Candidate): number =>
  a.group - b.group ||
  a.exhaustion - b.exhaustion ||
  b.effectiveSkill - a.effectiveSkill ||
  a.index - b.index;

/** BASICAI, Glossary, Muster: its members and the Contractors among them that are recalled now. */
type Muster = { readonly agents: ReadonlySet<string>; readonly recall: readonly string[] } | null;

const RATE_EFFECTS = ['training_skill_gain', 'exhaustion_recovery', 'health_recovery'];

/** BASICAI, Purchases: an Upgrade is bought only while its Acquisitions are below its `max_acquisitions`. */
function belowMax(upgrade: {
  readonly acquisitions: number;
  readonly maxAcquisitions: number | null;
}): boolean {
  return upgrade.maxAcquisitions === null || upgrade.acquisitions < upgrade.maxAcquisitions;
}

/** What one pass of the Turn routine reads: the World state, the plan derived from it, and the Muster. */
interface Pass {
  readonly plan: Plan;
  readonly muster: Muster;
}

class Turn {
  private readonly player: PlayerApi;
  private readonly t: BasicAiThresholds;
  private readonly data: GameDataView;
  /** Player actions that were rejected this turn; they are not retried. */
  private readonly rejected = new Set<string>();
  private readonly rating: RatingParameters;
  /** Whether a purchase due did not fit this Turn, so that nothing else is bought. */
  private saving = false;
  /** Whether a health recovery Upgrade was bought this Turn. */
  private healthBought = false;
  /** Whether a Rate Upgrade was bought this Turn (BASICAI, Purchases, item 6: at most one a Turn). */
  private rateBought = false;

  constructor(player: PlayerApi, thresholds: BasicAiThresholds) {
    this.player = player;
    this.t = thresholds;
    this.data = this.unwrap(player.queries.getGameData());
    this.rating = ratingParameters(this.data);
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

  /**
   * BASICAI, Information: both World state query results, read at the start of each step of the Turn routine and
   * kept current within it from the changes each Player action returns.
   */
  private views: WorldStateViews | null = null;
  /** The last step of the Turn routine whose start read the World state, so that each later step reads it again. */
  private readStep = -1;

  private read(): WorldStateViews {
    this.views ??= {
      live: this.unwrap(this.player.queries.getCurrentLiveWorldState()),
      retired: this.unwrap(this.player.queries.getCurrentRetiredWorldState()),
    };
    return this.views;
  }

  private state(): CurrentLiveWorldStateView {
    return this.read().live;
  }

  private retiredState(): WorldStateViews['retired'] {
    return this.read().retired;
  }

  /** Commits an action unless the same action was rejected earlier this turn. Returns whether it committed. */
  private async act(key: string, action: () => Promise<Result<CommitOutcome>>): Promise<boolean> {
    if (this.rejected.has(key)) {
      return false;
    }
    const result = await action();
    if (result.ok) {
      // PAPI, Action results: the changes keep the held views current; Advance turn returns none and needs a read.
      const changes = result.value.changes as WorldStateChanges | undefined;
      this.views =
        changes === undefined || this.views === null ? null : applyWorldStateChanges(this.views, changes);
      return result.value.committed;
    }
    if (result.error.code === 'engagement_ended') {
      throw new EngagementOver();
    }
    this.rejected.add(key);
    return false;
  }

  // ---- Step 1: equip ------------------------------------------------------------------------------

  /**
   * BASICAI, Equipping: one equipAgent for the first Agent whose plan differs from what it wears. When the Item it is to
   * wear is not in Storage, the Agent wearing it that is to wear something else first takes the fallback, which frees it.
   */
  private async equip(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    const view = state.agency.equipment;
    const serving = pass.plan.order
      .map((agent) => state.agents.find((item) => item.id === agent.id))
      .filter((agent): agent is AgentView => agent !== undefined);
    for (const kind of ['weapon', 'armor'] as const) {
      const worn = (agent: AgentView) => (kind === 'weapon' ? agent.weapon : agent.armor);
      const target = (agent: AgentView) => {
        const kit = pass.plan.storage.kit.get(agent.id);
        const fallback = kind === 'weapon' ? view.fallbackWeapon : view.fallbackArmor;
        return kit === undefined ? fallback : kind === 'weapon' ? kit.weapon : kit.armor;
      };
      const fallback = kind === 'weapon' ? view.fallbackWeapon : view.fallbackArmor;
      for (const agent of serving) {
        const share = target(agent);
        if (worn(agent) === share) {
          continue;
        }
        const stored = view.items.find((item) => item.id === share)?.available ?? 0;
        if (share === fallback || stored > 0) {
          if (
            await this.act(`equip ${agent.id} ${share}`, () =>
              this.player.actions.equipAgent(agent.id, share),
            )
          ) {
            return true;
          }
          continue;
        }
        const wearer = serving.find(
          (other) => other !== agent && worn(other) === share && target(other) !== share,
        );
        if (
          wearer !== undefined &&
          (await this.act(`equip ${wearer.id} ${fallback}`, () =>
            this.player.actions.equipAgent(wearer.id, fallback),
          ))
        ) {
          return true;
        }
      }
    }
    return false;
  }

  // ---- Step 2: deploy and muster ------------------------------------------------------------------

  /** AGENT, Effective skill, at full health: round down(skill × penalty factor / 100). */
  private effectiveSkillAt(agent: AgentView, exactExhaustionHundredths: number): number {
    const p = this.data.agentParameters;
    const exhaustion = Math.ceil(exactExhaustionHundredths / 100);
    const over = Math.max(0, exhaustion - (p['exhaustionFreePoints'] ?? 0));
    const penalty = Math.max(0, 100 - (p['skillPenaltyPctPerExhaustion'] ?? 0) * over);
    return Math.floor((agent.skillHundredths * penalty) / 10_000);
  }

  /** COMBAT, Incapacitation condition, at full health. */
  private ableToFightAt(agent: AgentView, exactExhaustionHundredths: number): boolean {
    const exhaustion = Math.ceil(exactExhaustionHundredths / 100);
    const fraction = decimal(this.data.combatParameters['incapacitationSkillFraction'], 0);
    return (
      exhaustion < (this.data.agentParameters['exhaustionIncapacitation'] ?? Infinity) &&
      this.effectiveSkillAt(agent, exactExhaustionHundredths) > (fraction * agent.skillHundredths) / 100
    );
  }

  /**
   * BASICAI, Glossary, Projected Agent: an Agent on Standby, Training, or Recovery after the Recovery lookahead,
   * recovering only in the Advance turns in which it is not In transit, at the Agency's current rates. Its turns are the
   * first Advance turn after which it is a Deployable Agent, none when that is beyond the lookahead.
   */
  private projected(state: CurrentLiveWorldStateView, agent: AgentView, index: number): Candidate | null {
    const kind = agent.assignment?.kind;
    if (kind !== 'Standby' && kind !== 'Training' && kind !== 'Recovery') {
      return null;
    }
    const lookahead = this.t.recoveryLookaheadTurns;
    if (agent.deployable) {
      // A Deployable Agent now rests on Standby and keeps its values on Training.
      const exact =
        kind === 'Standby'
          ? Math.max(
              0,
              agent.exactExhaustionHundredths - lookahead * state.agency.exhaustionRecoveryHundredths,
            )
          : agent.exactExhaustionHundredths;
      return {
        agent,
        index,
        effectiveSkill: this.effectiveSkillAt(agent, exact),
        exhaustion: Math.ceil(exact / 100),
        turns: 0,
        group: 0,
      };
    }
    const transit = agent.agentStatus === 'InTransit' ? 1 : 0;
    const healthRate =
      agent.healthRecoveryRateHundredths ??
      ceilDiv(state.agency.healthRecoveryPctHundredths * agent.effectiveMaxHealth, 100);
    let exact = agent.exactExhaustionHundredths;
    let healthLost = agent.healthLostHundredths;
    let turns: number | null = null;
    for (let h = 1; h <= lookahead; h += 1) {
      if (h > transit) {
        exact = Math.max(0, exact - state.agency.exhaustionRecoveryHundredths);
        if (healthLost > 0 && kind === 'Recovery') {
          healthLost = Math.max(0, healthLost - healthRate);
        }
      }
      if (turns === null && h >= transit && healthLost === 0 && this.ableToFightAt(agent, exact)) {
        turns = h;
      }
    }
    if (turns === null) {
      return null;
    }
    return {
      agent,
      index,
      effectiveSkill: this.effectiveSkillAt(agent, exact),
      exhaustion: Math.ceil(exact / 100),
      turns,
      group: 1,
    };
  }

  /** A Contractor as a member of a Muster: its current values, after one Advance turn of transit. */
  private contractor(agent: AgentView, index: number): Candidate {
    return {
      agent,
      index,
      effectiveSkill: agent.effectiveSkill,
      exhaustion: agent.exhaustion,
      turns: 1,
      group: 2,
    };
  }

  /** The Combat rating of Candidates with the values they are judged by, as worn now. */
  private candidateRating(members: readonly Candidate[]): number {
    const rated: RatedMember[] = members.map((member) => ({
      effectiveSkill: member.effectiveSkill,
      weaponDamage: member.agent.effectiveWeaponDamage,
      maxHealth: member.agent.effectiveMaxHealth,
      armor: member.agent.effectiveArmor,
      exhaustion: member.exhaustion,
    }));
    return ratingOf(rated, this.rating);
  }

  /** The Required rating share of a MissionSiteArchetype, from the Retired Missions, where every Lost one is. */
  private requiredPct(state: CurrentLiveWorldStateView, archetype: string): number {
    const retired = this.retiredState();
    return requiredRatingSharePct(
      this.t,
      [...retired.missionSites, ...state.missionSites],
      retired.missions,
      archetype,
    );
  }

  /** A Winning team from `candidates`, taken in order until the team qualifies within `places` Agents. */
  private formTeam(
    candidates: readonly Candidate[],
    places: number,
    enemyCount: number,
    enemiesRating: number,
    requiredPct: number,
    rate: (team: readonly Candidate[]) => number,
  ): Candidate[] | null {
    const needed = agentsNeeded(enemyCount, this.t.enemiesPerAgent);
    const team: Candidate[] = [];
    for (const candidate of candidates) {
      if (team.length >= places) {
        break;
      }
      team.push(candidate);
      if (team.length >= needed && meetsRequiredShare(rate(team), enemiesRating, requiredPct)) {
        return team;
      }
    }
    return null;
  }

  /** The Combat rating `previewDeployment` reports for Agents as they are now. */
  private previewRating(team: readonly Candidate[]): number {
    return this.unwrap(
      this.player.queries.previewDeployment(
        null,
        team.map((member) => member.agent.id),
      ),
    ).teamCombatRating;
  }

  /** The Deployable Agents now, in the order of BASICAI, Deploying and mustering. */
  private deployableNow(state: CurrentLiveWorldStateView): Candidate[] {
    return state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.deployable)
      .map(({ agent, index }) => ({
        agent,
        index,
        effectiveSkill: agent.effectiveSkill,
        exhaustion: agent.exhaustion,
        turns: 0,
        group: 0,
      }))
      .sort(byDeployPreference);
  }

  /**
   * A Winning team of Deployable Agents for a Mission site, within the free Transport cap: in the order of preference,
   * or, when that fits no Winning team, the strongest first.
   */
  private deployTeam(state: CurrentLiveWorldStateView, site: MissionSiteView): string[] | null {
    const places = state.agency.transportCap - state.agency.deployedAgents;
    const preferred = this.deployableNow(state);
    const strongest = [...preferred].sort((a, b) => b.effectiveSkill - a.effectiveSkill || a.index - b.index);
    const requiredPct = this.requiredPct(state, site.archetype);
    for (const candidates of [preferred, strongest]) {
      const team = this.formTeam(
        candidates,
        places,
        site.enemies.length,
        site.enemiesCombatRating,
        requiredPct,
        (members) => this.previewRating(members),
      );
      if (team !== null) {
        return team.map((member) => member.agent.id);
      }
    }
    return null;
  }

  /**
   * BASICAI, Deploying and mustering: Active Mission sites without a team, Response ones first, the one whose loss costs
   * most first, then Initiative ones; among equals the one that expires soonest.
   */
  private sitesByUrgency(state: CurrentLiveWorldStateView): MissionSiteView[] {
    const kind = (site: MissionSiteView) => (site.kind === 'Response' ? 0 : 1);
    return state.missionSites
      .filter((site) => site.lifecycle === 'Active')
      .map((site, index) => ({ site, index }))
      .sort(
        (a, b) =>
          kind(a.site) - kind(b.site) ||
          Number(b.site.penalties.defeat) - Number(a.site.penalties.defeat) ||
          b.site.penalties.panicIncreaseHundredths - a.site.penalties.panicIncreaseHundredths ||
          a.site.penalties.fundingChange - b.site.penalties.fundingChange ||
          a.site.turnsUntilExpiration - b.site.turnsUntilExpiration ||
          a.index - b.index,
      )
      .map((item) => item.site);
  }

  /**
   * BASICAI, Deploying and mustering, Muster: for the most urgent Initiative Mission site to which no team can be
   * deployed now, a Winning team of Projected Agents and Contractors whose last member becomes a Deployable Agent within
   * the Recovery lookahead and before the Mission site expires. Its Contractors are recalled only when every other
   * member is a Deployable Agent within one Advance turn.
   */
  private muster(state: CurrentLiveWorldStateView): Muster {
    const places = state.agency.transportCap - state.agency.deployedAgents;
    const reserve = state.agents
      .map((agent, index) => this.projected(state, agent, index))
      .filter((item): item is Candidate => item !== null);
    const contractors = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.assignment?.kind === 'Contracting' && agent.canTakeOrders)
      .map(({ agent, index }) => this.contractor(agent, index));
    for (const site of this.sitesByUrgency(state)) {
      if (site.kind !== 'Initiative' || this.deployTeam(state, site) !== null) {
        continue;
      }
      const latest = Math.min(this.t.recoveryLookaheadTurns, site.turnsUntilExpiration - 1);
      const candidates = [...reserve.filter((item) => item.turns <= latest), ...contractors].sort(
        (a, b) => a.group - b.group || a.turns - b.turns || byDeployPreference(a, b),
      );
      const team = this.formTeam(
        candidates,
        places,
        site.enemies.length,
        site.enemiesCombatRating,
        this.requiredPct(state, site.archetype),
        (members) => this.candidateRating(members),
      );
      if (team === null) {
        continue;
      }
      const readySoon = team.every((member) => member.group === 2 || member.turns <= 1);
      return {
        agents: new Set(team.map((member) => member.agent.id)),
        recall: readySoon ? team.filter((member) => member.group === 2).map((member) => member.agent.id) : [],
      };
    }
    return null;
  }

  /**
   * BASICAI, Deploying and mustering, Deploy now: once a Winning team exists for a Response Mission site whose loss
   * loses the Campaign, the strongest Deployable Agents the free Transport cap allows go in its place; every other
   * Mission site gets the Winning team.
   */
  private strongerTeam(state: CurrentLiveWorldStateView, site: MissionSiteView, team: string[]): string[] {
    if (site.kind !== 'Response' || !site.penalties.defeat) {
      return team;
    }
    const places = state.agency.transportCap - state.agency.deployedAgents;
    const strongest = this.deployableNow(state).sort(
      (a, b) => b.effectiveSkill - a.effectiveSkill || a.index - b.index,
    );
    return strongest.slice(0, Math.max(0, places)).map((member) => member.agent.id);
  }

  /** Step 2: deploy a Winning team of Deployable Agents, most urgent first. */
  private async deploy(state: CurrentLiveWorldStateView): Promise<boolean> {
    for (const site of this.sitesByUrgency(state)) {
      const winning = this.deployTeam(state, site);
      const team = winning === null ? null : this.strongerTeam(state, site, winning);
      if (
        team !== null &&
        (await this.act(`deploy ${site.id}`, () => this.player.actions.deployAgents(site.id, team)))
      ) {
        return true;
      }
    }
    return false;
  }

  // ---- Step 3: Strike team ------------------------------------------------------------------------

  /** Step 3: recall the Contractors of a Muster that is due, then those of the Strike team. */
  private async recall(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    const atWork = (id: string) => {
      const agent = state.agents.find((item) => item.id === id);
      return agent !== undefined && agent.canTakeOrders && agent.assignment?.kind === 'Contracting';
    };
    const muster = (pass.muster?.recall ?? []).filter(atWork);
    if (
      muster.length > 0 &&
      (await this.act(`muster ${muster.join(',')}`, () =>
        this.player.actions.assignAgents(muster, 'Standby'),
      ))
    ) {
      return true;
    }
    const strike = pass.plan.strike.map((agent) => agent.id).filter(atWork);
    return (
      strike.length > 0 &&
      (await this.act(`strike ${strike.join(',')}`, () =>
        this.player.actions.assignAgents(strike, 'Standby'),
      ))
    );
  }

  // ---- Steps 4 and 5: roles -----------------------------------------------------------------------

  /**
   * BASICAI, Glossary, Free Agent: Fit to start work, At assignment on Standby or Training, and neither of the Strike team
   * nor of the Muster; the highest effective skill first.
   */
  private freeAgents(state: CurrentLiveWorldStateView, pass: Pass): AgentView[] {
    return state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(
        ({ agent }) =>
          agent.canTakeOrders &&
          agent.fitForWork &&
          (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training') &&
          !pass.plan.strikeIds.has(agent.id) &&
          !(pass.muster?.agents.has(agent.id) ?? false),
      )
      .sort((a, b) => b.agent.effectiveSkill - a.agent.effectiveSkill || a.index - b.index)
      .map((item) => item.agent);
  }

  /**
   * Step 4, BASICAI, Roles and Choosing Leads: one Investigation team first; further teams only from the Free Agents
   * that Contracting leaves. An Active Investigation below the team size is reinforced before another starts. BASICAI,
   * Choosing Leads: the team size is the Research team size while the Strength gap is open, else the Late research team
   * size.
   */
  private async research(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    const size = pass.plan.gap ? this.t.researchTeamSize : this.t.lateResearchTeamSize;
    if (size <= 0) {
      return false;
    }
    const free = this.freeAgents(state, pass);
    const researchers = state.agents.filter((agent) => agent.assignment?.kind === 'Investigation').length;
    const contractingPlaces = Math.max(0, state.agency.contractingCap - state.agency.contractingAgents);
    const allowance = Math.min(
      free.length,
      researchers < size ? size - researchers : Math.max(0, free.length - contractingPlaces),
    );
    if (allowance <= 0) {
      return false;
    }
    for (const investigation of state.investigations) {
      const missing = size - investigation.currentTeam.length;
      if (missing > 0) {
        const team = free.slice(0, Math.min(allowance, missing)).map((agent) => agent.id);
        if (
          await this.act(`join ${investigation.id} ${team.join(',')}`, () =>
            this.player.actions.assignAgentsToInvestigation(investigation.id, team),
          )
        ) {
          return true;
        }
      }
    }
    if (state.investigations.length >= this.t.mostInvestigations) {
      return false;
    }
    const team = free.slice(0, Math.min(allowance, size)).map((agent) => agent.id);
    for (const lead of leadsToInvestigate(pass.plan, state, this.retiredState(), this.data, this.t)) {
      if (await this.act(`start ${lead.id}`, () => this.player.actions.startInvestigation(lead.id, team))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 5: Free Agents to Contracting while the Contracting cap has a place; then the Agents on Standby that are Fit to
   * start work to Training while the Training cap has a place, the Strike team first, then the lowest base skill.
   */
  private async contractAndTrain(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    const places = Math.max(0, state.agency.contractingCap - state.agency.contractingAgents);
    const contract = this.freeAgents(state, pass)
      .slice(0, places)
      .map((agent) => agent.id);
    if (
      contract.length > 0 &&
      (await this.act(`contract ${contract.join(',')}`, () =>
        this.player.actions.assignAgents(contract, 'Contracting'),
      ))
    ) {
      return true;
    }
    const trainingPlaces = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
    const strikeRank = new Map(pass.plan.strike.map((agent, index) => [agent.id, index]));
    const train = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(
        ({ agent }) =>
          agent.canTakeOrders &&
          agent.fitForWork &&
          agent.assignment?.kind === 'Standby' &&
          !(pass.muster?.agents.has(agent.id) ?? false),
      )
      .sort(
        (a, b) =>
          (strikeRank.get(a.agent.id) ?? Infinity) - (strikeRank.get(b.agent.id) ?? Infinity) ||
          a.agent.skillHundredths - b.agent.skillHundredths ||
          a.index - b.index,
      )
      .slice(0, trainingPlaces)
      .map((item) => item.agent.id);
    return (
      train.length > 0 &&
      (await this.act(`train ${train.join(',')}`, () => this.player.actions.assignAgents(train, 'Training')))
    );
  }

  // ---- Step 6: purchases --------------------------------------------------------------------------

  private affordable(state: CurrentLiveWorldStateView, cost: number, upkeepAfter: number): boolean {
    return state.agency.money - cost >= this.t.savingsFloorTurns * upkeepAfter;
  }

  /** Buys when money stays at or above the Savings floor; otherwise saves for it and buys nothing else this Turn. */
  private async buy(
    state: CurrentLiveWorldStateView,
    key: string,
    cost: number,
    upkeepAfter: number,
    action: () => Promise<Result<CommitOutcome>>,
  ): Promise<boolean> {
    if (!this.affordable(state, cost, upkeepAfter)) {
      this.saving = true;
      return false;
    }
    if (await this.act(key, action)) {
      return true;
    }
    // A rejected purchase is not retried; the next one due is read on the next pass.
    return false;
  }

  private upgradeOf(state: CurrentLiveWorldStateView, effect: string) {
    return [...state.agency.upgrades]
      .filter((item) => item.effect === effect && item.incrementHundredths > 0 && belowMax(item))
      .sort((a, b) => a.acquisitions - b.acquisitions || a.price - b.price)[0];
  }

  /** The best Unlocked Weapon whose `price` is at most the Sidearm price, or none. */
  private sidearm(state: CurrentLiveWorldStateView) {
    return state.agency.equipment.items
      .filter((item) => item.kind === 'weapon' && item.unlocked && item.price <= this.t.sidearmPrice)
      .sort((a, b) => (b.stat ?? 0) - (a.stat ?? 0) || a.price - b.price)[0];
  }

  /** Step 6, BASICAI, Purchases: the first purchase due. */
  private async purchase(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    if (this.saving) {
      return false;
    }
    const agency = state.agency;
    const equipment = agency.equipment;
    const upkeepPerAgent = this.data.economy['upkeepPerAgent'] ?? 0;
    const per = equipment.ammoShortRoundsPerAgent;
    const plan = pass.plan;

    // 1. Ammo: each Unlocked AmmoType up to the Ammo reserve times its Ammo need under the Buying plan.
    const ammo = equipment.items
      .filter((item) => item.kind === 'ammo' && item.unlocked)
      .map((item) => ({ item, want: this.t.ammoReserve * per * (plan.buying.carriers.get(item.id) ?? 0) }))
      .filter(({ item, want }) => item.available < want)
      .map(({ item, want }) => ({ id: item.id, count: want - item.available, price: item.price }));
    if (ammo.length > 0) {
      const cost = ammo.reduce((sum, item) => sum + item.price * item.count, 0);
      const entries: ItemEntryView[] = ammo.map(({ id, count }) => ({ id, count }));
      return this.buy(
        state,
        `ammo ${entries.map((e) => `${e.id}:${e.count}`).join(',')}`,
        cost,
        agency.projectedUpkeep,
        () => this.player.actions.buyItems(entries),
      );
    }

    // 2. Sidearms for every Agent the Buying plan leaves with the Fallback Weapon.
    const unarmed = plan.order.filter(
      (agent) => plan.buying.kit.get(agent.id)?.weapon === equipment.fallbackWeapon,
    ).length;
    const sidearm = this.sidearm(state);
    if (unarmed > 0 && sidearm !== undefined) {
      return this.buy(
        state,
        `sidearms ${sidearm.id}:${unarmed}`,
        sidearm.price * unarmed,
        agency.projectedUpkeep,
        () => this.player.actions.buyItems([{ id: sidearm.id, count: unarmed }]),
      );
    }

    // 3. Hires up to the wanted roster that the planned net income allows; the Agent cap when it alone stops them.
    const roster = agency.servingAgents;
    const size = this.t.researchTeamSize;
    const rest = Math.min(99, Math.max(0, this.t.restSharePct));
    const strike = plan.strike.length;
    const teams = Math.min(
      this.t.mostInvestigations,
      state.investigations.length +
        leadsToInvestigate(plan, state, this.retiredState(), this.data, this.t).length,
    );
    const wanted = Math.ceil(
      ((plan.strikeWanted + Math.max(size > 0 ? 1 : 0, teams) * size + agency.contractingCap) * 100) /
        (100 - rest),
    );
    const income = this.data.economy['contractingIncomePerAgent'] ?? 0;
    // The Strike team a roster of r Agents would have: what the Strike goal asks for, less what keeps the income.
    const strikeAt = (r: number) =>
      Math.min(plan.strikeWanted, Math.max(0, r - agency.contractingCap - size));
    const plannedNet = (r: number) =>
      agency.funding +
      income *
        Math.min(
          agency.contractingCap,
          Math.max(0, Math.floor((r * (100 - rest)) / 100) - strikeAt(r) - size),
        ) -
      upkeepPerAgent * r;
    const limit = Math.min(agency.agentCap, wanted);
    let best = 0;
    let due = false;
    for (let k = 1; roster + k <= limit; k += 1) {
      if (plannedNet(roster + k) >= this.t.leastNetIncome) {
        due = true;
        if (this.affordable(state, k * agency.hireCost, agency.projectedUpkeep + k * upkeepPerAgent)) {
          best = k;
        }
      }
    }
    if (best > 0) {
      return this.buy(
        state,
        `hire ${best}`,
        best * agency.hireCost,
        agency.projectedUpkeep + best * upkeepPerAgent,
        () => this.player.actions.hireAgents(best),
      );
    }
    if (due) {
      this.saving = true;
      return false;
    }
    const agentCap = this.upgradeOf(state, 'agent_cap');
    if (
      agentCap !== undefined &&
      roster >= agency.agentCap &&
      wanted > agency.agentCap &&
      plannedNet(agency.agentCap + 1) >= this.t.leastNetIncome
    ) {
      return this.buy(state, `buy ${agentCap.id}`, agentCap.price, agency.projectedUpkeep, () =>
        this.player.actions.purchaseUpgrade(agentCap.id),
      );
    }

    // 4. Health recovery while more than the Recovery share of the Serving Agents are on Recovery.
    const recovering = state.agents.filter((agent) => agent.assignment?.kind === 'Recovery').length;
    const health = this.upgradeOf(state, 'health_recovery');
    if (!this.healthBought && health !== undefined && recovering * 100 > roster * this.t.recoverySharePct) {
      // At most one a Turn: its effect shows only from the next Advance turn.
      const bought = await this.buy(state, `buy ${health.id}`, health.price, agency.projectedUpkeep, () =>
        this.player.actions.purchaseUpgrade(health.id),
      );
      this.healthBought ||= bought;
      return bought;
    }

    // 5. Strength while the Strength gap is open.
    if (plan.gap) {
      const choice = this.strengthPurchase(state, plan);
      if (choice !== null) {
        return this.buy(state, choice.key, choice.price, agency.projectedUpkeep, choice.action);
      }
    }

    // 6. The Training cap while the Strike team exceeds it, else the Rate Upgrade with the fewest acquisitions.
    const training = this.upgradeOf(state, 'training_cap');
    if (training !== undefined && strike > agency.trainingCap) {
      return this.buy(state, `buy ${training.id}`, training.price, agency.projectedUpkeep, () =>
        this.player.actions.purchaseUpgrade(training.id),
      );
    }
    const rate = [...agency.upgrades]
      .filter((item) => RATE_EFFECTS.includes(item.effect) && item.incrementHundredths > 0 && belowMax(item))
      .sort((a, b) => a.acquisitions - b.acquisitions || a.price - b.price || a.id.localeCompare(b.id))[0];
    if (rate !== undefined && !this.rateBought) {
      const bought = await this.buy(state, `buy ${rate.id}`, rate.price, agency.projectedUpkeep, () =>
        this.player.actions.purchaseUpgrade(rate.id),
      );
      this.rateBought ||= bought;
      return bought;
    }
    return false;
  }

  /**
   * BASICAI, Purchases, item 5: the purchase that adds most Rested rating to the Strike team for its money: a Weapon or an
   * Armor for the member that gains most, its Ammo reserve counted in a Weapon's cost; or a Transport cap Upgrade when
   * the Strike team fills the Transport cap, with the hires that fill it counted in its cost.
   */
  private strengthPurchase(
    state: CurrentLiveWorldStateView,
    plan: Plan,
  ): { key: string; price: number; action: () => Promise<Result<CommitOutcome>> } | null {
    const p = plan.rating;
    const equipment = state.agency.equipment;
    const per = equipment.ammoShortRoundsPerAgent;
    const size = plan.strike.length;
    const teamFactor = size === 0 ? 0 : size ** (p.exponent - 1);
    const members = plan.eligible.slice(0, size);
    let best: {
      ratio: number;
      key: string;
      price: number;
      action: () => Promise<Result<CommitOutcome>>;
    } | null = null;
    const consider = (
      gain: number,
      cost: number,
      key: string,
      price: number,
      action: () => Promise<Result<CommitOutcome>>,
    ) => {
      if (gain > 0 && cost > 0 && (best === null || gain / cost > best.ratio)) {
        best = { ratio: gain / cost, key, price, action };
      }
    };
    for (const item of equipment.items) {
      if ((item.kind !== 'weapon' && item.kind !== 'armor') || !item.unlocked || item.stat === null) {
        continue;
      }
      let gain = 0;
      for (const { member } of members) {
        const current = item.kind === 'weapon' ? member.weaponDamage : member.armor;
        if (item.stat > current) {
          const better: RatedMember =
            item.kind === 'weapon' ? { ...member, weaponDamage: item.stat } : { ...member, armor: item.stat };
          gain = Math.max(gain, teamFactor * (memberWeight(better, p) - memberWeight(member, p)));
        }
      }
      const ammoPrice =
        item.ammoType === null
          ? 0
          : (equipment.items.find((other) => other.id === item.ammoType)?.price ?? 0);
      const cost = item.price + this.t.ammoReserve * per * ammoPrice;
      const id = item.id;
      consider(gain, cost, `strength ${id}`, item.price, () =>
        this.player.actions.buyItems([{ id, count: 1 }]),
      );
    }
    const transport = this.upgradeOf(state, 'transport_cap');
    if (transport !== undefined && size === state.agency.transportCap) {
      const increment = Math.floor(transport.incrementHundredths / 100);
      const extra = plan.eligible.slice(size, size + increment).map((item) => item.member);
      const sidearm = this.sidearm(state);
      const rookie: RatedMember = {
        effectiveSkill: this.data.agentArchetype.skill,
        weaponDamage: sidearm?.stat ?? equipment.fallbackWeaponDamage,
        maxHealth: this.data.agentArchetype.baseHealth,
        armor: equipment.fallbackArmorValue,
      };
      const rookies = increment - extra.length;
      const grown = [
        ...members.map((item) => item.member),
        ...extra,
        ...Array.from({ length: rookies }, () => rookie),
      ];
      const gain =
        sideRating(
          grown.length,
          grown.reduce((sum, m) => sum + memberWeight(m, p), 0),
          p,
          grown.map((m) => m.effectiveSkill),
        ) - plan.strikeRating;
      const id = transport.id;
      consider(gain, transport.price + rookies * state.agency.hireCost, `buy ${id}`, transport.price, () =>
        this.player.actions.purchaseUpgrade(id),
      );
    }
    return best;
  }

  // ---- Step 7: sell -------------------------------------------------------------------------------

  /** Step 7: every Item no Agent is to wear under any plan, beyond Spare Items of each, in one sellItems. */
  private async sell(state: CurrentLiveWorldStateView, pass: Pass): Promise<boolean> {
    const plan = pass.plan;
    const entries: ItemEntryView[] = state.agency.equipment.items
      .filter((item) => item.kind === 'weapon' || item.kind === 'armor')
      .map((item) => {
        const kept =
          Math.max(
            plan.storage.wearers.get(item.id) ?? 0,
            plan.buying.wearers.get(item.id) ?? 0,
            plan.unlimited.wearers.get(item.id) ?? 0,
          ) + this.t.spareItems;
        return { id: item.id, count: Math.min(item.available, item.owned - kept) };
      })
      .filter((entry) => entry.count > 0);
    return (
      entries.length > 0 &&
      (await this.act(`sell ${entries.map((e) => `${e.id}:${e.count}`).join(',')}`, () =>
        this.player.actions.sellItems(entries, false),
      ))
    );
  }

  // ---- Turn routine -------------------------------------------------------------------------------
  //
  // Each step makes at most one Player action and reports whether it made one. After every Player action the routine
  // starts again from its first step, so each Player action is decided from the current Player-visible information.

  /** Makes the next Player action of the Turn routine. Returns false once it has advanced the turn. */
  private async next(): Promise<boolean> {
    const steps: readonly ((state: CurrentLiveWorldStateView, pass: Pass) => Promise<boolean>)[] = [
      (state, pass) => this.equip(state, pass),
      (state) => this.deploy(state),
      (state, pass) => this.recall(state, pass),
      (state, pass) => this.research(state, pass),
      (state, pass) => this.contractAndTrain(state, pass),
      (state, pass) => this.purchase(state, pass),
      (state, pass) => this.sell(state, pass),
    ];
    // BASICAI, Information: the World state is read at the start of each step; within a step, and for an earlier step
    // looked at again, the views held are current from the changes each Player action returned.
    const enter = (step: number) => {
      if (step > this.readStep) {
        this.readStep = step;
        this.views = null;
      }
      return this.state();
    };
    const first = enter(0);
    const pass: Pass = {
      plan: makePlan(first, this.retiredState(), this.data, this.t),
      muster: this.muster(first),
    };
    for (const [index, step] of steps.entries()) {
      if (await step(enter(index), pass)) {
        return true;
      }
    }
    await this.act('advance turn', () => this.player.actions.advanceTurn());
    return false;
  }

  async run(): Promise<void> {
    // The bound only guards against a defect: no step undoes what an earlier one did in the same Turn, so a Turn has
    // few actions.
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
