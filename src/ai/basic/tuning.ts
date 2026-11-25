/** BASICAI, Tuning parameters and the Required rating share they set. */

/** BASICAI, Tuning parameters. Percent values are whole percentages, e.g. 110 for 110%. */
export interface BasicAiThresholds {
  /** Combat margin: the Required rating share before any Lost Mission of a MissionSiteArchetype, and of the Strike goal. */
  readonly combatMarginPct: number;
  /** Loss margin step: percentage points each Lost Mission of a MissionSiteArchetype adds for later Mission sites. */
  readonly lossMarginStepPct: number;
  /** Enemies per Agent: how many Enemies one Agent of a team answers for. */
  readonly enemiesPerAgent: number;
  /** Recovery lookahead: Advance turns of recovery over which a Projected Agent is projected. */
  readonly recoveryLookaheadTurns: number;
  /** Threat window: the Turns over which the Threat is read. */
  readonly threatWindowTurns: number;
  /** Research team size: the Agents each Investigation is given. */
  readonly researchTeamSize: number;
  /** Most Investigations: the most Investigations run at once. */
  readonly mostInvestigations: number;
  /** Farming Panic: the Panic, in percent, from which farming a Won rung qualifies even while a new rung does. */
  readonly farmingPanicPct: number;
  /** Ammo reserve: the rounds of each AmmoType bought, as a multiple of its Ammo need. */
  readonly ammoReserve: number;
  /** Sidearm price: the most a Weapon bought for an Agent with the Fallback Weapon may cost. */
  readonly sidearmPrice: number;
  /** Spare Items: the Items of each Weapon and Armor no Agent is to wear that are kept rather than sold. */
  readonly spareItems: number;
  /** Rest share: the share of the roster expected to be resting or on Recovery, in percent. */
  readonly restSharePct: number;
  /** Least net income: the least planned net income a hire may leave. */
  readonly leastNetIncome: number;
  /** Recovery share: the share of Serving Agents on Recovery, in percent, above which a health recovery Upgrade is due. */
  readonly recoverySharePct: number;
  /** Savings floor: Turns of the projected upkeep the Agency would have after a purchase. */
  readonly savingsFloorTurns: number;
}

/** BASICAI, Game designer values. */
export const BASIC_AI_THRESHOLDS: BasicAiThresholds = {
  combatMarginPct: 110,
  lossMarginStepPct: 5,
  enemiesPerAgent: 2.5,
  recoveryLookaheadTurns: 2,
  threatWindowTurns: 20,
  researchTeamSize: 3,
  mostInvestigations: 3,
  farmingPanicPct: 30,
  ammoReserve: 2,
  sidearmPrice: 10,
  spareItems: 4,
  restSharePct: 20,
  leastNetIncome: 25,
  recoverySharePct: 20,
  savingsFloorTurns: 5,
};

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

/** BASICAI, Glossary, Winning team: the least number of Agents for `enemyCount` Enemies. */
export function agentsNeeded(enemyCount: number, enemiesPerAgent: number): number {
  return Math.max(1, Math.ceil(enemyCount / enemiesPerAgent - 1e-9));
}
