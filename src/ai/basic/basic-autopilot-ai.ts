/**
 * BASICAI (Basic Autopilot AI): a sound, cautious player. It reaches the game only through Player API, decides each
 * Player action from the current Player-visible information alone, and keeps no plan across turns. It splits the roster
 * into the Agent reserve, the Investigators, and the Contractors, deploys and musters teams, and buys in a fixed cycle.
 * When no step of its Turn routine has a Player action left to make, it requests Advance turn, which the engine
 * withholds under the Autopilot limits `singleAction` and `turnActions`.
 */
import type {
  AgentView,
  AutopilotAi,
  CommitOutcome,
  CurrentLiveWorldStateView,
  GameDataView,
  LeadView,
  MissionSiteView,
  PlayerApi,
  Result,
  WorldStateChanges,
} from '../../engine/player-api.ts';
import { applyWorldStateChanges, type WorldStateViews } from '../world-state-changes.ts';

/** BASICAI, Tuning parameters. */
export interface BasicAiThresholds {
  /** Reserve share: the Reserve quota, as a Percent value of the Roster size, rounded down. */
  readonly reserveSharePct: number;
  /** Investigator share: the Investigator quota, as a Percent value of the Roster size, rounded down. */
  readonly investigatorSharePct: number;
  /** Cap share: the least Transport cap and Training cap, each as a Percent value of the Agent cap. */
  readonly capSharePct: number;
  /** Savings floor: Turns of the projected upkeep the Agency would have after a purchase. */
  readonly savingsFloorTurns: number;
  /**
   * Combat margin: the Combat rating a Winning team needs while no Mission of the same MissionSiteArchetype is Lost,
   * as a Percent value of the Enemies' Combat rating.
   */
  readonly combatMarginPct: number;
  /** Loss margin step: percentage points each Lost Mission of a MissionSiteArchetype adds for later Mission sites. */
  readonly lossMarginStepPct: number;
  /** Enemies per Agent: how many Enemies one Agent of a team answers for. */
  readonly enemiesPerAgent: number;
  /** Recovery lookahead: Advance turns of recovery over which an Agent of the Agent reserve is projected. */
  readonly recoveryLookaheadTurns: number;
  /**
   * Upgrade weights: the weight of each Other Upgrade in the rotation, by Upgrade ID; an Upgrade it does not name has
   * weight 1, and one with weight 0 is never bought.
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

/** BASICAI, Glossary, Winning team: its Combat rating is at least the share of the Enemies'. */
export function meetsRequiredShare(teamRating: number, enemiesRating: number, requiredPct: number): boolean {
  return teamRating * 100 >= enemiesRating * requiredPct;
}

/** BASICAI, Game designer values. */
export const BASIC_AI_THRESHOLDS: BasicAiThresholds = {
  reserveSharePct: 35,
  investigatorSharePct: 5,
  capSharePct: 25,
  savingsFloorTurns: 5,
  combatMarginPct: 110,
  lossMarginStepPct: 5,
  enemiesPerAgent: 2.5,
  recoveryLookaheadTurns: 2,
  upgradeWeights: { training_skill_gain: 2, exhaustion_recovery: 2, health_recovery: 2 },
};

/** Thrown inside a step when the Autopilot engagement has ended, so that the step makes no further call. */
class EngagementOver extends Error {}

const ceilDiv = (a: number, b: number): number => Math.floor((a + b - 1) / b);

/** A decimal text of GameDataView, e.g. "0.85", as a number. */
const decimal = (text: string | undefined, fallback: number): number => {
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
};

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
  /** 0 for a Deployable Agent now, 1 for an Agent of the Agent reserve that becomes one later, 2 for a Contractor. */
  readonly group: number;
}

/** BASICAI, Choosing Agents: the lowest exhaustion first, then the highest effective skill, then roster order. */
const byDeployPreference = (a: Candidate, b: Candidate): number =>
  a.group - b.group ||
  a.exhaustion - b.exhaustion ||
  b.effectiveSkill - a.effectiveSkill ||
  a.index - b.index;

/** BASICAI, Glossary, Muster: its members and the Contractors among them that are recalled now. */
type Muster = { readonly agents: ReadonlySet<string>; readonly recall: readonly string[] } | null;

const isCapEffect = (effect: string): boolean => effect.endsWith('_cap');

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

  /**
   * BASICAI, Information: both World state query results, read at the start of each step of the Turn routine and
   * kept current within it from the changes each Player action returns; none until the next read.
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

  // ---- Agent groups -------------------------------------------------------------------------------

  /** BASICAI, Glossary, Agent reserve: Standby, Training, Recovery, or Deployed, In transit or not. */
  private inReserve(agent: AgentView): boolean {
    const kind = agent.assignment?.kind;
    return kind === 'Standby' || kind === 'Training' || kind === 'Recovery' || kind === 'Deployed';
  }

  private reserve(state: CurrentLiveWorldStateView): AgentView[] {
    return state.agents.filter((agent) => this.inReserve(agent));
  }

  private count(state: CurrentLiveWorldStateView, kind: string): number {
    return state.agents.filter((agent) => agent.assignment?.kind === kind).length;
  }

  /** BASICAI, Glossary, Reserve quota. */
  private reserveQuota(state: CurrentLiveWorldStateView): number {
    return Math.floor((state.agency.servingAgents * this.t.reserveSharePct) / 100);
  }

  /**
   * BASICAI, Glossary, Investigator quota: the Investigator share of the Roster size, rounded down, but at least 1 while
   * the Roster size is at least 1 and the share is above 0, so that a small roster still unlocks Contracting.
   */
  private investigatorQuota(state: CurrentLiveWorldStateView): number {
    const share = Math.floor((state.agency.servingAgents * this.t.investigatorSharePct) / 100);
    return this.t.investigatorSharePct > 0 && state.agency.servingAgents >= 1 ? Math.max(1, share) : share;
  }

  /**
   * BASICAI, Glossary, Spare Agent: as many Agents of the Agent reserve as it exceeds the Reserve quota, from those Fit
   * to start work, At assignment on Standby or Training, and not of the Muster; the lowest effective skill first, so
   * the strongest stay in the Agent reserve.
   */
  private spareAgents(state: CurrentLiveWorldStateView, muster: Muster): AgentView[] {
    const surplus = this.reserve(state).length - this.reserveQuota(state);
    if (surplus <= 0) {
      return [];
    }
    return state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(
        ({ agent }) =>
          agent.canBeAssigned &&
          agent.fitForWork &&
          (agent.assignment?.kind === 'Standby' || agent.assignment?.kind === 'Training') &&
          !(muster?.agents.has(agent.id) ?? false),
      )
      .sort((a, b) => a.agent.effectiveSkill - b.agent.effectiveSkill || a.index - b.index)
      .slice(0, surplus)
      .map((item) => item.agent);
  }

  // ---- Projection and Combat rating ---------------------------------------------------------------

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
   * BASICAI, Glossary, Projected Agent: an Agent of the Agent reserve, other than a Deployed one, after the Recovery
   * lookahead, recovering only in the Advance turns in which it is not In transit, at the Agency's current rates. Its
   * turns are the first Advance turn after which it is a Deployable Agent, none when that is beyond the lookahead.
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
        // AGENT RECOVERY: Standby and Recovery recover exhaustion; Recovery also recovers health, and once health
        // lost is 0 the Agent is on Standby.
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

  /** A Contractor as a Musterable Agent: Fit to start work, so its current values, after one Advance turn of transit. */
  private contractor(agent: AgentView, index: number): Candidate {
    // BASICAI, Choosing Agents: a Contractor counts with its own exhaustion, which its transit back leaves unchanged.
    return {
      agent,
      index,
      effectiveSkill: agent.effectiveSkill,
      exhaustion: agent.exhaustion,
      turns: 1,
      group: 2,
    };
  }

  /**
   * COMBAT, Combat rating: ⌊n ^ (rating_team_size_exponent − 1) × Σ effective skill × rating factor⌋, with each rating
   * factor half the sum of the attack, health, and armor terms. It rates projected values, which no Player API query
   * previews.
   */
  private ratingOf(members: readonly Candidate[]): number {
    if (members.length === 0) {
      return 0;
    }
    const c = this.data.combatParameters;
    const baseWeapon = decimal(c['ratingBaseWeaponDamage'], 1);
    const baseHealth = decimal(c['ratingBaseHealth'], 1);
    const baseArmor = decimal(c['ratingBaseArmor'], 1);
    const exponent = decimal(c['ratingTeamSizeExponent'], 1);
    const sum = members.reduce((total, member) => {
      const factor =
        (member.agent.effectiveWeaponDamage / baseWeapon +
          member.agent.effectiveMaxHealth / baseHealth +
          member.agent.effectiveArmor / baseArmor) /
        2;
      return total + member.effectiveSkill * factor;
    }, 0);
    return Math.floor(members.length ** (exponent - 1) * sum + 1e-9);
  }

  /** BASICAI, Glossary, Winning team: the least number of Agents for the Enemies. */
  private needed(enemyCount: number): number {
    return Math.max(1, Math.ceil(enemyCount / this.t.enemiesPerAgent - 1e-9));
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

  /**
   * A Winning team from `candidates`, taken in order until the team qualifies, or none when it does not within
   * `places` Agents. `rate` gives a team's Combat rating.
   */
  private formTeam(
    candidates: readonly Candidate[],
    places: number,
    enemyCount: number,
    enemiesRating: number,
    requiredPct: number,
    rate: (team: readonly Candidate[]) => number,
  ): Candidate[] | null {
    const needed = this.needed(enemyCount);
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

  /** The Deployable Agents now, in the order of BASICAI, Choosing Agents. */
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
   * A Winning team of Deployable Agents for a Mission site from their current values, within the free Transport cap.
   * The Agents are taken in the order of preference; when that order fits no Winning team within the Transport cap,
   * the strongest are taken first, because a Winning team can then still be formed.
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

  /** Active Mission sites to which no team is deployed, most urgent first. */
  private sitesByUrgency(state: CurrentLiveWorldStateView): MissionSiteView[] {
    const urgency = (site: MissionSiteView) => (site.kind === 'Response' ? 0 : 1);
    return state.missionSites
      .filter((site) => site.lifecycle === 'Active')
      .map((site, index) => ({ site, index }))
      .sort(
        (a, b) =>
          urgency(a.site) - urgency(b.site) ||
          a.site.turnsUntilExpiration - b.site.turnsUntilExpiration ||
          a.index - b.index,
      )
      .map((item) => item.site);
  }

  /**
   * BASICAI, Deploying and mustering, Muster: for the most urgent Initiative Mission site to which no team can be
   * deployed now, a Winning team of Musterable Agents whose last member becomes a Deployable Agent within the Recovery
   * lookahead and before the Mission site expires: the Deployable Agents first, then the Agents of the Agent reserve
   * that become Deployable Agents soonest, then Contractors. Its Contractors are recalled only when every other member
   * is a Deployable Agent within one Advance turn. It is derived anew from the current state for every Player action.
   */
  private muster(state: CurrentLiveWorldStateView): Muster {
    const places = state.agency.transportCap - state.agency.deployedAgents;
    const reserve = state.agents
      .map((agent, index) => this.projected(state, agent, index))
      .filter((item): item is Candidate => item !== null);
    const contractors = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.assignment?.kind === 'Contracting' && agent.canBeAssigned)
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
        (members) => this.ratingOf(members),
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

  // ---- Turn routine -------------------------------------------------------------------------------
  //
  // Each step makes at most one Player action and reports whether it made one. After every Player action the
  // routine starts again from its first step, so each Player action is decided from the current Player-visible
  // information alone, and the Basic Autopilot AI plays the same way whatever its Autopilot limit is.

  /** Step 1: deploy a Winning team of Deployable Agents, most urgent first; then recall the Muster's Contractors. */
  private async deployAndMuster(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    for (const site of this.sitesByUrgency(state)) {
      const team = this.deployTeam(state, site);
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

  /** Step 2: while the Agent reserve is below the Reserve quota, recall the most skilled Contractor. */
  private async refillReserve(state: CurrentLiveWorldStateView): Promise<boolean> {
    if (this.reserve(state).length >= this.reserveQuota(state)) {
      return false;
    }
    const candidates = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(({ agent }) => agent.assignment?.kind === 'Contracting' && agent.canBeAssigned)
      .sort((a, b) => b.agent.effectiveSkill - a.agent.effectiveSkill || a.index - b.index)
      .map((item) => item.agent);
    for (const agent of candidates) {
      if (
        await this.act(`recall ${agent.id}`, () => this.player.actions.assignAgents([agent.id], 'Standby'))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * BASICAI, Choosing Leads: a Lead that creates no Mission site is always worth investigating; one that creates a
   * Mission site only when a Winning team of Musterable Agents could be formed for it, with the whole Transport cap
   * and no regard to timing.
   */
  private worthInvestigating(state: CurrentLiveWorldStateView, lead: LeadView): boolean {
    if (lead.createsMissionSite === null) {
      return true;
    }
    const archetype = this.data.missionSiteArchetypes.find((item) => item.id === lead.createsMissionSite);
    if (archetype === undefined) {
      return false;
    }
    const musterable = [
      ...state.agents
        .map((agent, index) => this.projected(state, agent, index))
        .filter((item): item is Candidate => item !== null),
      ...state.agents
        .map((agent, index) => ({ agent, index }))
        .filter(({ agent }) => agent.assignment?.kind === 'Contracting')
        .map(({ agent, index }) => this.contractor(agent, index)),
    ].sort((a, b) => byDeployPreference({ ...a, group: 0 }, { ...b, group: 0 }));
    const enemyCount = archetype.enemies.reduce((sum, entry) => sum + entry.count, 0);
    return (
      this.formTeam(
        musterable,
        state.agency.transportCap,
        enemyCount,
        archetype.enemiesCombatRating,
        this.requiredPct(state, archetype.id),
        (members) => this.ratingOf(members),
      ) !== null
    );
  }

  /**
   * Step 3: while the Investigators are fewer than the Investigator quota, send Spare Agents to an Active
   * Investigation, or else start an Investigation of the best Lead worth investigating.
   */
  private async investigate(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    const short = this.investigatorQuota(state) - this.count(state, 'Investigation');
    const spares = this.spareAgents(state, muster);
    const count = Math.min(short, spares.length);
    if (count <= 0) {
      return false;
    }
    const team = spares.slice(0, count).map((agent) => agent.id);
    // Effort is concentrated: an Active Investigation receives Agents before another Lead is started. Whether its
    // Lead is worth investigating was judged when it started.
    const [active] = state.investigations;
    if (active !== undefined) {
      return this.act(`join ${active.id}`, () =>
        this.player.actions.assignAgentsToInvestigation(active.id, team),
      );
    }
    const retired = this.retiredState();
    // A Lead whose completion wins the Campaign comes first, then one whose completion makes a Faction Eliminated,
    // directly or through a Won Mission at the Mission site it creates, then the one furthest along its Faction's
    // chain, read as its Initiative operation level; a Lead with no level comes after every Lead with one.
    const eliminates = (lead: LeadView): boolean =>
      lead.eliminatesFaction ||
      this.data.missionSiteArchetypes.find((item) => item.id === lead.createsMissionSite)?.onWin
        ?.eliminatesTargetFaction === true;
    const wonSites = new Set(
      retired.missions.filter((mission) => mission.lifecycle === 'Won').map((mission) => mission.missionSite),
    );
    const missionWon = new Set(
      retired.missionSites
        .filter((site) => site.lead !== null && wonSites.has(site.id))
        .map((site) => site.lead),
    );
    const chainPosition = (lead: LeadView): number => lead.initiativeOperationLevel ?? -1;
    // BASICAI, Choosing Leads: after one that wins the Campaign comes one that unlocks Contracting.
    const rank = (lead: LeadView): number =>
      lead.winsCampaign ? 3 : lead.unlocksContracting ? 2 : eliminates(lead) ? 1 : 0;
    const leads = [...retired.leads].sort((a, b) => rank(b) - rank(a) || chainPosition(b) - chainPosition(a));
    // A Lead a Mission from which was already Won is investigated again only when no other Lead qualifies.
    const ordered = [
      ...leads.filter((lead) => !missionWon.has(lead.id)),
      ...leads.filter((lead) => missionWon.has(lead.id)),
    ];
    for (const lead of ordered) {
      if (!lead.canBeInvestigatedNow || !this.worthInvestigating(state, lead)) {
        continue;
      }
      if (await this.act(`start ${lead.id}`, () => this.player.actions.startInvestigation(lead.id, team))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Step 4: every remaining Spare Agent to Contracting; then the Agents of the Agent reserve that are Fit to start work
   * and At assignment on Standby to Training while the Training cap has a place, the lowest base skill first.
   */
  private async contractAndTrain(state: CurrentLiveWorldStateView, muster: Muster): Promise<boolean> {
    // BASICAI, Turn routine, step 4: only as many as the Contracting cap has places left.
    const contractingPlaces = Math.max(0, state.agency.contractingCap - state.agency.contractingAgents);
    const spares = this.spareAgents(state, muster)
      .slice(0, contractingPlaces)
      .map((agent) => agent.id);
    if (
      spares.length > 0 &&
      (await this.act(`contract ${spares.join(',')}`, () =>
        this.player.actions.assignAgents(spares, 'Contracting'),
      ))
    ) {
      return true;
    }
    const places = Math.max(0, state.agency.trainingCap - state.agency.trainingAgents);
    const toTraining = state.agents
      .map((agent, index) => ({ agent, index }))
      .filter(
        ({ agent }) =>
          agent.canBeAssigned &&
          agent.fitForWork &&
          agent.assignment?.kind === 'Standby' &&
          !(muster?.agents.has(agent.id) ?? false),
      )
      .sort((a, b) => a.agent.skillHundredths - b.agent.skillHundredths || a.index - b.index)
      .slice(0, places)
      .map((item) => item.agent.id);
    return (
      toTraining.length > 0 &&
      (await this.act(`train ${toTraining.join(',')}`, () =>
        this.player.actions.assignAgents(toTraining, 'Training'),
      ))
    );
  }

  /**
   * Step 5, BASICAI, Purchases: the first purchase due in the list Other Upgrades, supporting caps, hire, Agent cap,
   * made only when money stays at or above the Savings floor after it; when the first one due does not fit, nothing
   * more is bought this Turn.
   */
  private async purchase(state: CurrentLiveWorldStateView): Promise<boolean> {
    const agency = state.agency;
    const upkeepPerAgent = this.data.economy['upkeepPerAgent'] ?? 0;
    const affordable = (price: number, upkeepAfter: number): boolean =>
      agency.money - price >= this.t.savingsFloorTurns * upkeepAfter;
    const buy = async (id: string, price: number): Promise<boolean> =>
      affordable(price, agency.projectedUpkeep) &&
      (await this.act(`buy ${id}`, () => this.player.actions.purchaseUpgrade(id)));
    const ofEffect = (effect: string) =>
      [...agency.upgrades]
        .filter((item) => item.effect === effect && item.incrementHundredths > 0)
        .sort((a, b) => a.acquisitions - b.acquisitions || a.price - b.price)[0];

    // 1. Ammo: each AmmoType a Serving Agent's Weapon uses, brought up to twice what Ammo short asks for, in one
    // buyItems. An AmmoType that is not Unlocked cannot be bought.
    const ammo = agency.equipment.items
      .filter((item) => item.kind === 'ammo' && item.unlocked && item.ammoAgents > 0)
      .filter((item) => item.available < 2 * item.ammoNeeded)
      .map((item) => ({ id: item.id, count: 2 * item.ammoNeeded - item.available, price: item.price }));
    if (ammo.length > 0) {
      const cost = ammo.reduce((sum, item) => sum + item.price * item.count, 0);
      return (
        affordable(cost, agency.projectedUpkeep) &&
        (await this.act(`ammo ${ammo.map((item) => item.id).join(',')}`, () =>
          this.player.actions.buyItems(ammo.map(({ id, count }) => ({ id, count }))),
        ))
      );
    }

    // 2. Other Upgrades, up to the Upgrade budget.
    const agentCapUpgrade = ofEffect('agent_cap');
    const agentCapBought = agency.upgrades
      .filter((item) => item.effect === 'agent_cap')
      .reduce((sum, item) => sum + item.acquisitions, 0);
    const budget = (agentCapUpgrade?.price ?? 0) * agentCapBought;
    const others = agency.upgrades.filter((item) => !isCapEffect(item.effect));
    const spent = others.reduce((sum, item) => sum + item.price * item.acquisitions, 0);
    const weight = (id: string): number => this.t.upgradeWeights[id] ?? 1;
    const next = others
      .filter((item) => item.incrementHundredths > 0 && weight(item.id) > 0 && item.price <= budget - spent)
      .map((item) => ({ item, due: (item.acquisitions + 1) / weight(item.id) }))
      .sort((a, b) => a.due - b.due || a.item.price - b.item.price)
      .map(({ item }) => item)[0];
    if (next !== undefined) {
      return buy(next.id, next.price);
    }
    // 3. Supporting caps: the Transport cap first, then the Training cap.
    for (const [cap, effect] of [
      [agency.transportCap, 'transport_cap'],
      [agency.trainingCap, 'training_cap'],
    ] as const) {
      if (cap * 100 < agency.agentCap * this.t.capSharePct) {
        const upgrade = ofEffect(effect);
        return upgrade !== undefined && buy(upgrade.id, upgrade.price);
      }
    }
    // 4. Hire up to the Agent cap, in one hireAgents: as many as hiring one at a time would, each one judged against
    // the Savings floor with the upkeep of every Agent hired so far and itself.
    if (agency.servingAgents < agency.agentCap) {
      let count = 0;
      while (
        agency.servingAgents + count < agency.agentCap &&
        affordable((count + 1) * agency.hireCost, agency.projectedUpkeep + (count + 1) * upkeepPerAgent)
      ) {
        count += 1;
      }
      return count > 0 && (await this.act('hire', () => this.player.actions.hireAgents(count)));
    }
    // 5. Raise the Agent cap.
    return agentCapUpgrade !== undefined && buy(agentCapUpgrade.id, agentCapUpgrade.price);
  }

  /**
   * Step 5, BASICAI, Equipping: for Weapons and then Armors, every Item worn or in Storage, from the highest number
   * down, goes to the Serving Agents from the highest effective skill down, ties by the lower Instance ID; Agents
   * beyond the Items keep the fallback. It makes one equipAgent per call: the first Agent whose share differs gets it
   * from Storage, or, when another Agent wears it, that Agent first takes the fallback, which frees it.
   */
  private async equip(state: CurrentLiveWorldStateView): Promise<boolean> {
    const view = state.agency.equipment;
    const number = (id: string) => Number(id.slice(id.lastIndexOf('-') + 1));
    const serving = state.agents
      .filter((agent) => agent.agentStatus !== 'Killed' && agent.agentStatus !== 'Dismissed')
      .sort((x, y) => y.effectiveSkill - x.effectiveSkill || number(x.id) - number(y.id));
    for (const kind of ['weapon', 'armor'] as const) {
      const worn = (agent: (typeof serving)[number]) => (kind === 'weapon' ? agent.weapon : agent.armor);
      const fallback = kind === 'weapon' ? view.fallbackWeapon : view.fallbackArmor;
      const pool = view.items
        .filter((item) => item.kind === kind)
        .sort((x, y) => (y.stat ?? 0) - (x.stat ?? 0))
        .flatMap((item) => Array.from({ length: item.owned }, () => item.id));
      for (const [index, agent] of serving.entries()) {
        const share = pool[index] ?? fallback;
        if (worn(agent) === share) {
          continue;
        }
        const stored = view.items.find((item) => item.id === share)?.available ?? 0;
        if (share === fallback || stored > 0) {
          return this.act(`equip ${agent.id} ${share}`, () =>
            this.player.actions.equipAgent(agent.id, share),
          );
        }
        const wearer = serving.find(
          (other, at) => at !== index && worn(other) === share && pool[at] !== share,
        );
        if (wearer !== undefined) {
          return this.act(`equip ${wearer.id} ${fallback}`, () =>
            this.player.actions.equipAgent(wearer.id, fallback),
          );
        }
      }
    }
    return false;
  }

  /** Makes the next Player action of the Turn routine. Returns false once it has advanced the turn. */
  private async next(): Promise<boolean> {
    const steps: readonly ((state: CurrentLiveWorldStateView, muster: Muster) => Promise<boolean>)[] = [
      (state, muster) => this.deployAndMuster(state, muster),
      (state) => this.refillReserve(state),
      (state, muster) => this.investigate(state, muster),
      (state, muster) => this.contractAndTrain(state, muster),
      (state) => this.purchase(state),
      (state) => this.equip(state),
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
    // Every step reads the Muster as step 1 forms it from the current state.
    const muster = this.muster(enter(0));
    for (const [index, step] of steps.entries()) {
      if (await step(enter(index), muster)) {
        return true;
      }
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
