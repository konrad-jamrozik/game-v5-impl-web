/**
 * TURN, Prologue: campaign creation that continues from the initial Campaign state. The engine takes Player actions and
 * advances Turns, each as a player could, through the same two functions every Player action goes through, and hands
 * the Campaign over at the start of the Turn it reached. It fixes some Random outcomes to reach what it must, inside
 * its own random source and never through a random outcome override, so the History shows only Player actions and no
 * override is left pending.
 *
 * The Prologue plays by a fixed policy that reads only the World state and the Game build, so equal Campaign seeds give
 * equal Prologues. Every Turn it keeps Agents on Training, on Contracting once it is unlocked, and on Investigations of
 * the available Leads in Game build order; it buys the cheapest Upgrade once the money allows, then hires one Agent a
 * Turn until STAFF serve; it has Agents in Training wear the cheapest Weapon other than the issued one, the cheapest
 * Unlocked Armor, and the Fallback Weapon, keeps those Items and the issued Weapon in Storage, and tops up the Ammo of
 * the issued Weapon; and it deploys Agents to the Active Mission sites.
 *
 * The Combats of its Missions are fixed, and it deploys a team only when the Combat, fought ahead with the same fixed
 * outcomes, ends as its plan wants. The first lone Agent that the Enemies can kill in the first Combat round is
 * Killed, so its team is Wiped. One Agent of a team is wounded so that it ends up Recovering, until two Agents are
 * wounded. Every other team wins unharmed within LONG Combat rounds, while fewer than enough Missions are Won or the
 * Armor is not worn, and on every Response Mission site; the Initiative Mission sites it no longer needs Expire. Once
 * everything else that TURN, Prologue guarantees has built up, it tires two Agents out through the deaths of their
 * teams, each a survivor deployed with one or two doomed Agents to an Initiative Mission site: the Enemies kill the
 * doomed Agents and wound the survivor, the weakened team retreats, and the survivor's Mission exhaustion lifts its
 * exhaustion above exhaustion_work_limit, and then that of another survivor above exhaustion_incapacitation.
 *
 * The Investigations' Required progress outcomes take their least value. It stops at the start of the first Turn, from
 * FIRST_TURN on, whose World state holds everything that TURN, Prologue guarantees.
 */
import { byInstanceId, EngineDefect, must } from '../../kernel/index.ts';
import type { ArmorGdr, GdrCatalog, UpgradeGdr, WeaponGdr } from '../../gdr/index.ts';
import { effectiveSkill, exhaustionOf, isBaseAssignment, isFitForWork } from '../mechanics/agents/agents.ts';
import {
  agentCombatantState,
  damageBounds,
  enemyCombatantState,
  fightCombat,
  isAbleToFight,
  meetsIncapacitationCondition,
  type Combatant,
  type CombatantState,
  type CombatOutputs,
} from '../mechanics/combat/combat.ts';
import { agencyCaps, agentUpgradeBonus } from '../mechanics/economy/economy.ts';
import { fallbacks, isItem, storageCount, unlockedEquipment } from '../mechanics/equipment/equipment.ts';
import { activeInvestigationOf, currentContractingCap, leadAvailability } from '../mechanics/leads/leads.ts';
import { missionExhaustion } from '../mechanics/missions/missions.ts';
import { advanceTurnOf, applyActionTo } from '../play.ts';
import type { Random } from '../random.ts';
import { isRejection } from '../result.ts';
import {
  isServing,
  type Agent,
  type CampaignState,
  type CurrentWorldState,
  type MissionSite,
} from '../state/types.ts';

/** The earliest Turn at whose start the Prologue hands the Campaign over, so that the Turn series have a history. */
export const FIRST_TURN = 20;
/** The Turn at whose start a Prologue that has not reached its guarantees is a defect. */
const LAST_TURN = 120;
/** The Agents the Prologue hires on its first Turn, so that every kind of work has hands. */
const HIRES = 4;
/** The Serving Agents it hires up to, one a Turn, once it has bought an Upgrade. */
const STAFF = 16;
/** The Agents it keeps on Training. */
const TRAINING = 3;
/** The most Agents it keeps on Contracting. */
const CONTRACTING = 3;
/** The most Active Investigations it keeps, and the size of each Investigation's team. */
const INVESTIGATIONS = 2;
const INVESTIGATION_TEAM = 2;
/** The size of the team of a Mission in which an Agent is wounded, and of every other team that wins. */
const WOUND_TEAM = 2;
const WIN_TEAM = 3;
/** The Turns of upkeep the Prologue keeps in money after it buys an Upgrade, an Agent, or an Item. */
const RESERVE_TURNS = 2;
/**
 * How far above exhaustion_work_limit a tired Agent's exhaustion is, so that it is still above that limit at the start
 * of the next Turn, after one exhaustion recovery.
 */
const TIRED_MARGIN = 5;
/** The most Combat rounds of a `sacrifice`, so that its survivor's combat experience stays small. */
const SHORT = 3;
/** The most Combat rounds of a `win`, so that its team's combat experience stays modest. */
const LONG = 10;

/** TURN, Prologue: the least numbers of what a Campaign handed over after a Prologue holds. */
const AT_LEAST = {
  serving: 12,
  ranks: 3,
  weapons: 3,
  armors: 2,
  wounded: 2,
  finalSites: 15,
  won: 8,
  lost: 3,
  expired: 3,
} as const;

/** A Combatant's values as a fixed Combat changes them, followed attack by attack. */
interface Tracked {
  state: CombatantState;
  armor: number;
}

/**
 * How the Combat of one Mission is fixed. `kill`: the lone Agent misses, and the Enemies hit it, each keeping it able to
 * fight, until one hit kills it. `wound`: the Agents hit for their highest damage, the first Enemy attack hits
 * `wounded` for at most half its effective max health, and every other Enemy attack misses. `win`: the Agents hit for
 * their highest damage and the Enemies miss. `sacrifice`: the Agents miss, the Enemies target the `doomed` Agents
 * first and hit each, keeping it able to fight, until a hit kills it, then hit the `survivor` once for at most half
 * its effective max health, and otherwise miss, so that the team, weakened, retreats.
 */
type Plan =
  | { readonly kind: 'kill'; readonly agent: string; readonly enemies: Bounds; readonly tracked: Tracked }
  | {
      readonly kind: 'wound';
      readonly agents: ReadonlySet<string>;
      readonly enemies: Bounds;
      readonly wounded: string;
      readonly tracked: Tracked;
      dealt: boolean;
    }
  | {
      readonly kind: 'sacrifice';
      readonly agents: ReadonlySet<string>;
      readonly enemies: Bounds;
      readonly doomed: readonly string[];
      readonly survivor: string;
      readonly tracked: ReadonlyMap<string, Tracked>;
      dealt: boolean;
    }
  | { readonly kind: 'win'; readonly agents: ReadonlySet<string>; readonly enemies: Bounds };

/** The damage bounds of each Enemy of a Mission site, by Instance ID. */
type Bounds = ReadonlyMap<string, { readonly lo: number; readonly hi: number }>;

const HIT = 'combat.hit.';
const DAMAGE = 'combat.damage.';
const TARGET = 'combat.target.';
const REQUIRED_PROGRESS = 'investigation.requiredProgress.';

/**
 * The stand-in for the seeded source when the Prologue fights a Combat ahead. Every fixed Combat decides its hit and
 * damage outcomes itself, so only the Agents' target outcomes reach it, which change little in how a fixed Combat ends.
 */
const AHEAD: Random = {
  uniform: (_outcome, lo) => lo,
  chance: () => false,
  weighted: (_outcome, entries) =>
    must(
      entries.find(([, weight]) => weight > 0),
      'a candidate',
    )[0],
};

function track(state: CombatantState): Tracked {
  return { state: { ...state }, armor: state.armor };
}

/** COMBAT, Effects of an attack, steps 3 and 4: the health a damage outcome removes from the tracked defender. */
function healthLoss(tracked: Tracked, damage: number): number {
  return Math.min((damage - Math.min(damage, tracked.armor)) * 100, tracked.state.currentHealthHundredths);
}

/** Applies one attack on the tracked defender: the damage of a hit, if any, and the exhaustion of the defense. */
function defend(tracked: Tracked, damage: number | null, gdrs: GdrCatalog): void {
  if (damage !== null) {
    const loss = healthLoss(tracked, damage);
    tracked.armor -= Math.min(damage, tracked.armor);
    tracked.state.currentHealthHundredths -= loss;
  }
  tracked.state.exactExhaustionHundredths += gdrs.agentParameters.exhaustionPerDefense * 100;
}

/** Whether the tracked defender, after a hit for `damage`, would be alive and able to fight. */
function staysAble(tracked: Tracked, damage: number, gdrs: GdrCatalog): boolean {
  const after = {
    ...tracked.state,
    currentHealthHundredths: tracked.state.currentHealthHundredths - healthLoss(tracked, damage),
    exactExhaustionHundredths:
      tracked.state.exactExhaustionHundredths + gdrs.agentParameters.exhaustionPerDefense * 100,
  };
  return (
    after.currentHealthHundredths > 0 &&
    !meetsIncapacitationCondition(after, gdrs.combatParameters, gdrs.agentParameters)
  );
}

/**
 * The damage of the next Enemy attack on the lone Agent of a `kill`: the highest damage when it kills, otherwise the
 * highest that keeps the Agent able to fight, or null for a miss when every hit would leave it Incapacitated.
 */
function killingDamage(tracked: Tracked, lo: number, hi: number, gdrs: GdrCatalog): number | null {
  if (healthLoss(tracked, hi) >= tracked.state.currentHealthHundredths) {
    return hi;
  }
  for (let damage = hi; damage >= lo; damage -= 1) {
    if (staysAble(tracked, damage, gdrs)) {
      return damage;
    }
  }
  return null;
}

/** The damage of the wounding hit: the highest that removes health and leaves at least half the effective max health. */
function woundingDamage(tracked: Tracked, lo: number, hi: number, gdrs: GdrCatalog): number | null {
  for (let damage = hi; damage >= lo; damage -= 1) {
    const loss = healthLoss(tracked, damage);
    const left = tracked.state.currentHealthHundredths - loss;
    if (loss > 0 && left * 2 >= tracked.state.maxHealth * 100 && staysAble(tracked, damage, gdrs)) {
      return damage;
    }
  }
  return null;
}

/**
 * The random source of the Prologue: the Campaign seed, except for the outcomes of the Combats it fixed and the
 * Required progress outcomes, which take their least value.
 */
class Forcing {
  private plans: Plan[] = [];
  /** The damage each Enemy's hit, decided with the hit outcome, takes. */
  private readonly damage = new Map<string, number>();
  /** The target each Enemy of a `wound` or a `sacrifice` drew for its current attack. */
  private readonly target = new Map<string, string>();

  private readonly gdrs: GdrCatalog;

  constructor(gdrs: GdrCatalog) {
    this.gdrs = gdrs;
  }

  add(plan: Plan): void {
    this.plans.push(plan);
  }

  /** Forgets the plans of an Advance turn. */
  clear(): void {
    this.plans = [];
    this.damage.clear();
    this.target.clear();
  }

  private planOf(id: string): Plan | undefined {
    return this.plans.find(
      (plan) => plan.enemies.has(id) || (plan.kind === 'kill' ? plan.agent === id : plan.agents.has(id)),
    );
  }

  private hit(id: string): boolean | null {
    const plan = this.planOf(id);
    if (plan === undefined) {
      return null;
    }
    const perAttack = this.gdrs.agentParameters.exhaustionPerAttack * 100;
    const bounds = plan.enemies.get(id);
    if (plan.kind === 'sacrifice') {
      return this.sacrificeHit(plan, id, bounds);
    }
    if (plan.kind === 'kill') {
      if (bounds === undefined) {
        plan.tracked.state.exactExhaustionHundredths += perAttack;
        return false;
      }
      const damage = killingDamage(plan.tracked, bounds.lo, bounds.hi, this.gdrs);
      defend(plan.tracked, damage, this.gdrs);
      if (damage === null) {
        return false;
      }
      this.damage.set(id, damage);
      return true;
    }
    if (bounds === undefined) {
      if (plan.kind === 'wound' && id === plan.wounded) {
        plan.tracked.state.exactExhaustionHundredths += perAttack;
      }
      return true;
    }
    if (plan.kind === 'win') {
      return false;
    }
    const target = this.target.get(id);
    this.target.delete(id);
    if (target !== plan.wounded) {
      return false;
    }
    const damage = plan.dealt ? null : woundingDamage(plan.tracked, bounds.lo, bounds.hi, this.gdrs);
    defend(plan.tracked, damage, this.gdrs);
    if (damage === null) {
      return false;
    }
    plan.dealt = true;
    this.damage.set(id, damage);
    return true;
  }

  /**
   * The hit outcome of an attack in a `sacrifice`: an Agent misses; an Enemy hits a doomed Agent as a `kill` does, and
   * the survivor once as a `wound` does. An Enemy facing a single Agent able to fight draws no target outcome, so its
   * target is that Agent.
   */
  private sacrificeHit(
    plan: Extract<Plan, { kind: 'sacrifice' }>,
    id: string,
    bounds: { readonly lo: number; readonly hi: number } | undefined,
  ): boolean {
    if (bounds === undefined) {
      const attacker = plan.tracked.get(id);
      if (attacker !== undefined) {
        attacker.state.exactExhaustionHundredths += this.gdrs.agentParameters.exhaustionPerAttack * 100;
      }
      return false;
    }
    const able = [...plan.tracked].filter(([, tracked]) =>
      isAbleToFight(tracked.state, this.gdrs.combatParameters, this.gdrs.agentParameters),
    );
    const target = this.target.get(id) ?? (able.length === 1 ? able[0]?.[0] : undefined);
    this.target.delete(id);
    const tracked = target === undefined ? undefined : plan.tracked.get(target);
    if (target === undefined || tracked === undefined) {
      return false;
    }
    let damage: number | null = null;
    if (plan.doomed.includes(target)) {
      damage = killingDamage(tracked, bounds.lo, bounds.hi, this.gdrs);
    } else if (target === plan.survivor && !plan.dealt) {
      damage = woundingDamage(tracked, bounds.lo, bounds.hi, this.gdrs);
      plan.dealt = damage !== null;
    }
    defend(tracked, damage, this.gdrs);
    if (damage === null) {
      return false;
    }
    this.damage.set(id, damage);
    return true;
  }

  private uniform(outcome: string, lo: number, hi: number): number | null {
    if (outcome.startsWith(REQUIRED_PROGRESS)) {
      return lo;
    }
    if (!outcome.startsWith(DAMAGE)) {
      return null;
    }
    const id = outcome.slice(DAMAGE.length);
    const decided = this.damage.get(id);
    if (decided !== undefined) {
      this.damage.delete(id);
      return decided;
    }
    const plan = this.planOf(id);
    return plan !== undefined && plan.kind !== 'kill' && !plan.enemies.has(id) ? hi : null;
  }

  private weighted(id: string, entries: readonly (readonly [string, number])[]): string | null {
    const plan = this.planOf(id);
    const candidates = new Set(entries.filter(([, weight]) => weight > 0).map(([key]) => key));
    if (plan?.kind === 'sacrifice' && plan.enemies.has(id)) {
      const doomed = plan.doomed.find((agent) => candidates.has(agent));
      return doomed ?? (!plan.dealt && candidates.has(plan.survivor) ? plan.survivor : null);
    }
    if (plan?.kind !== 'wound' || !plan.enemies.has(id) || plan.dealt) {
      return null;
    }
    return candidates.has(plan.wounded) ? plan.wounded : null;
  }

  /** The random source of one action, which wraps the seeded source of the World state it changes. */
  readonly source = (seeded: Random): Random => ({
    uniform: (outcome, lo, hi) => this.uniform(outcome, lo, hi) ?? seeded.uniform(outcome, lo, hi),
    chance: (outcome, p) =>
      (outcome.startsWith(HIT) ? this.hit(outcome.slice(HIT.length)) : null) ?? seeded.chance(outcome, p),
    roll: (outcome, n, steps, taken) => seeded.roll?.(outcome, n, steps, taken) ?? (taken ? 0 : steps - 1),
    weighted: (outcome, entries) => {
      if (!outcome.startsWith(TARGET)) {
        return seeded.weighted(outcome, entries);
      }
      const id = outcome.slice(TARGET.length);
      const chosen = this.weighted(id, entries) ?? seeded.weighted(outcome, entries);
      const kind = this.planOf(id)?.kind;
      if (kind === 'wound' || kind === 'sacrifice') {
        this.target.set(id, chosen);
      }
      return chosen;
    },
  });
}

/** The Serving Agents of the World state, in Instance ID order. */
function servingAgents(world: CurrentWorldState): Agent[] {
  return Object.values(world.agents)
    .filter((agent) => isServing(agent.state))
    .sort(byInstanceId);
}

/** GUI, Ranks: the Rank an Agent's base skill, rounded down, reaches, by identifier; the GDRs list the highest first. */
function rankOf(agent: Agent, gdrs: GdrCatalog): string | null {
  const skill = Math.floor(agent.state.skillHundredths / 100);
  return gdrs.ranks.find((rank) => skill >= rank.minBaseSkill)?.id ?? null;
}

/** The number of Lost Missions in the History, by their Combat outcome. */
function lostOutcomes(state: CampaignState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of state.world.history.historyEntries) {
    for (const mission of entry.report.missions) {
      if (mission.result === 'Lost') {
        counts.set(mission.combatOutcome, (counts.get(mission.combatOutcome) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * The guarantees of TURN, Prologue that Turns of play build up, each a check of the World state, by name. The tired
 * Agents, the third Weapon, the Lost Missions, and the count of Mission sites in a final state are left out: the
 * Prologue's last Missions bring them about.
 */
function buildUp(state: CampaignState, gdrs: GdrCatalog): Record<string, boolean> {
  const world = state.world.current;
  const agents = Object.values(world.agents);
  const serving = servingAgents(world);
  const sites = Object.values(world.missionSites);
  const storage = Object.entries(world.agency.state.storage).filter(([, count]) => count > 0);
  return {
    'no Campaign ending': world.ending === null,
    'a Killed Agent': agents.some((agent) => agent.state.status === 'Killed'),
    'a Recovering Agent': agents.some((agent) => agent.state.status === 'Recovering'),
    'an Agent in Training': agents.some((agent) => agent.state.assignment?.kind === 'Training'),
    'an Agent on an Active Investigation': agents.some((agent) => {
      const assignment = agent.state.assignment;
      return (
        assignment?.kind === 'Investigation' &&
        world.investigations[assignment.investigation]?.state.lifecycle === 'Active'
      );
    }),
    'a Completed Investigation': Object.values(world.investigations).some(
      (item) => item.state.lifecycle === 'Completed',
    ),
    'a bought Upgrade': Object.values(world.agency.state.acquisitions).some((count) => count > 0),
    'Serving Agents': serving.length >= AT_LEAST.serving,
    Ranks: new Set(serving.map((agent) => rankOf(agent, gdrs))).size >= AT_LEAST.ranks,
    'Armors worn': new Set(serving.map((agent) => agent.state.armor)).size >= AT_LEAST.armors,
    'wounded Agents':
      serving.filter((agent) => agent.state.healthLostHundredths > 0).length >= AT_LEAST.wounded,
    'Weapons of two kinds in Storage': storage.filter(([id]) => gdrs.weapons.has(id)).length >= 2,
    'an Armor in Storage': storage.some(([id]) => gdrs.armors.has(id)),
    'Ammo in Storage': storage.some(([id]) => gdrs.ammoTypes.has(id)),
    'an Active Mission site': sites.some((site) => site.state.lifecycle === 'Active'),
    'Won Missions':
      Object.values(world.missions).filter((mission) => mission.state.lifecycle === 'Won').length >=
      AT_LEAST.won,
    'Expired Mission sites':
      sites.filter((site) => site.state.lifecycle === 'Expired').length >= AT_LEAST.expired,
  };
}

/**
 * TURN, Prologue: the guarantees a Campaign handed over after a Prologue holds, each a check of the World state, by
 * name. The tired Agents are three: one whose exhaustion is above exhaustion_work_start_max and at most
 * exhaustion_work_limit, one above that and at most exhaustion_incapacitation, and one above that.
 */
function guarantees(state: CampaignState, gdrs: GdrCatalog): Record<string, boolean> {
  const world = state.world.current;
  const serving = servingAgents(world);
  const lost = lostOutcomes(state);
  const { exhaustionWorkStartMax, exhaustionWorkLimit, exhaustionIncapacitation } = gdrs.agentParameters;
  const exhaustion = serving.map((agent) => exhaustionOf(agent.state));
  return {
    ...buildUp(state, gdrs),
    'Weapons worn': new Set(serving.map((agent) => agent.state.weapon)).size >= AT_LEAST.weapons,
    'an Agent above exhaustion_work_start_max': exhaustion.some(
      (value) => value > exhaustionWorkStartMax && value <= exhaustionWorkLimit,
    ),
    'an Agent above exhaustion_work_limit': exhaustion.some(
      (value) => value > exhaustionWorkLimit && value <= exhaustionIncapacitation,
    ),
    'an Agent above exhaustion_incapacitation': exhaustion.some((value) => value > exhaustionIncapacitation),
    'Mission sites in a final state':
      Object.values(world.missionSites).filter(
        (site) => site.state.lifecycle !== 'Active' && site.state.lifecycle !== 'Deployed',
      ).length >= AT_LEAST.finalSites,
    'Lost Missions': [...lost.values()].reduce((sum, n) => sum + n, 0) >= AT_LEAST.lost,
    'a Retreated Mission': (lost.get('Retreated') ?? 0) > 0,
    'a Wiped Mission': (lost.get('Wiped') ?? 0) > 0,
  };
}

/** The names of the guarantees of TURN, Prologue that the World state does not hold. */
function unmet(state: CampaignState, gdrs: GdrCatalog): string[] {
  return Object.entries(guarantees(state, gdrs))
    .filter(([, holds]) => !holds)
    .map(([name]) => name);
}

/** One Turn of the Prologue's Player actions, then its Advance turn. */
class PrologueTurn {
  state: CampaignState;
  private readonly gdrs: GdrCatalog;
  private readonly forcing: Forcing;

  constructor(state: CampaignState, gdrs: GdrCatalog, forcing: Forcing) {
    this.state = state;
    this.gdrs = gdrs;
    this.forcing = forcing;
  }

  private get world(): CurrentWorldState {
    return this.state.world.current;
  }

  /** Takes one Player action; returns whether it was accepted. */
  private act(name: string, args: unknown): boolean {
    const next = applyActionTo(this.state, { surface: 'player', name, args }, this.gdrs, this.forcing.source);
    if (isRejection(next)) {
      return false;
    }
    this.state = next;
    return true;
  }

  private agents(): Agent[] {
    return Object.values(this.world.agents).sort(byInstanceId);
  }

  /** The Agents At assignment on Standby, in Instance ID order. */
  private inBase(): Agent[] {
    return this.agents().filter(
      (agent) => agent.state.status === 'AtAssignment' && agent.state.assignment?.kind === 'Standby',
    );
  }

  /** The Agents At assignment on Standby that are Fit to start work, in Instance ID order. */
  private onStandby(): Agent[] {
    return this.inBase().filter((agent) => isFitForWork(agent.state, this.gdrs.agentParameters));
  }

  /** The Agents that wear only what the Agency issues or the fallbacks, so that a lost Mission costs no other Item. */
  private plain(agents: readonly Agent[]): Agent[] {
    const { weapon, armor } = fallbacks(this.gdrs);
    const weapons = [weapon.id, this.gdrs.agentArchetype.weapon];
    const armors = [armor.id, this.gdrs.agentArchetype.armor];
    return agents.filter(
      (agent) => weapons.includes(agent.state.weapon) && armors.includes(agent.state.armor),
    );
  }

  private count(kind: string): number {
    return this.agents().filter((agent) => agent.state.assignment?.kind === kind).length;
  }

  /** The money the Prologue keeps for upkeep before it spends any. */
  private reserve(): number {
    return RESERVE_TURNS * servingAgents(this.world).length * this.gdrs.economy.upkeepPerAgent;
  }

  private affords(cost: number): boolean {
    return this.world.agency.state.money >= cost + this.reserve();
  }

  private upgraded(): boolean {
    return Object.values(this.world.agency.state.acquisitions).some((count) => count > 0);
  }

  /** Orders Agents from Standby to a simple Assignment until `wanted` Agents have it. */
  private fill(assignment: 'Training' | 'Contracting', wanted: number): void {
    const missing = wanted - this.count(assignment);
    const picked = this.onStandby().slice(-Math.max(0, missing));
    if (missing > 0 && picked.length > 0) {
      this.act('assignAgents', { agents: picked.map((agent) => agent.id), assignment });
    }
  }

  private activeInvestigations(): number {
    return Object.values(this.world.investigations).filter((item) => item.state.lifecycle === 'Active')
      .length;
  }

  /** Starts Investigations of the available Leads, in Game build order, until `wanted` are Active. */
  private investigate(wanted: number): void {
    for (const lead of this.gdrs.leads) {
      if (this.activeInvestigations() >= wanted) {
        return;
      }
      const team = this.onStandby().slice(0, INVESTIGATION_TEAM);
      if (team.length === 0) {
        return;
      }
      if (
        leadAvailability(lead, this.world, this.gdrs.missionSiteArchetypes).available &&
        activeInvestigationOf(lead.id, this.world.investigations) === null
      ) {
        this.act('startInvestigation', { lead: lead.id, agents: team.map((agent) => agent.id) });
      }
    }
  }

  private bounds(site: MissionSite): Bounds {
    return new Map(
      site.state.enemies.map((id) => {
        const enemy = must(this.world.enemies[id], `Enemy ${id}`);
        return [id, damageBounds(enemy.state.baseWeaponDamage, this.gdrs.combatParameters)];
      }),
    );
  }

  private combatantOf(agent: Agent): CombatantState {
    return agentCombatantState(
      agent.state,
      agentUpgradeBonus(this.gdrs.upgrades, this.world.agency.state.acquisitions),
    );
  }

  /** An Agent as the Mission resolution step puts it into a Combat, or as it would be with `weapon` worn. */
  private fighter(agent: Agent, weapon?: WeaponGdr): Combatant {
    const worn = weapon ?? must(this.gdrs.weapons.get(agent.state.weapon), `Weapon of ${agent.id}`);
    return {
      id: agent.id,
      state: { ...this.combatantOf(agent), weaponDamage: worn.damage },
      ammoType: worn.ammoType,
      weapon: worn.id,
    };
  }

  /**
   * Fights ahead the Combat of the team at the Mission site with the plan's fixed outcomes and the Ammo in Storage, as
   * the Mission resolution step fights it when it is the first Mission of the Advance turn.
   */
  private ahead(team: readonly Combatant[], site: MissionSite, plan: Plan): CombatOutputs {
    const forcing = new Forcing(this.gdrs);
    forcing.add(plan);
    return fightCombat(
      {
        agents: [...team].sort(byInstanceId),
        enemies: site.state.enemies
          .map((id) => must(this.world.enemies[id], `Enemy ${id}`))
          .sort(byInstanceId)
          .map((enemy) => ({
            id: enemy.id,
            state: enemyCombatantState(enemy.state),
            weapon: enemy.state.weapon,
          })),
        combat: this.gdrs.combatParameters,
        agentParameters: this.gdrs.agentParameters,
        ammo: new Map([...this.gdrs.ammoTypes.keys()].map((id) => [id, storageCount(this.world, id)])),
        fallbackWeaponDamage: fallbacks(this.gdrs).weapon.damage,
      },
      forcing.source(AHEAD),
    );
  }

  /**
   * Whether the Enemies of the Mission site kill the lone Agent in the first Combat round of a `kill`: the Agent attacks
   * first, then the Enemies able to fight in Phase order, from the highest effective skill, ties in Instance ID order.
   */
  private canKill(agent: Agent, site: MissionSite, bounds: Bounds): boolean {
    const tracked = track(this.combatantOf(agent));
    tracked.state.exactExhaustionHundredths += this.gdrs.agentParameters.exhaustionPerAttack * 100;
    const enemies = site.state.enemies
      .map((id) => must(this.world.enemies[id], `Enemy ${id}`))
      .sort(byInstanceId)
      .map((enemy) => ({ id: enemy.id, state: enemyCombatantState(enemy.state) }))
      .filter((enemy) => isAbleToFight(enemy.state, this.gdrs.combatParameters, this.gdrs.agentParameters));
    const order = [...enemies].sort(
      (a, b) =>
        effectiveSkill(b.state, this.gdrs.agentParameters) -
        effectiveSkill(a.state, this.gdrs.agentParameters),
    );
    for (const enemy of order) {
      const { lo, hi } = must(bounds.get(enemy.id), `damage bounds of ${enemy.id}`);
      const damage = killingDamage(tracked, lo, hi, this.gdrs);
      defend(tracked, damage, this.gdrs);
      if (tracked.state.currentHealthHundredths === 0) {
        return true;
      }
    }
    return false;
  }

  private deploy(site: MissionSite, team: readonly Agent[]): boolean {
    return this.act('deployAgents', { missionSite: site.id, agents: team.map((agent) => agent.id) });
  }

  /** The number of Serving Agents whose exhaustion is above `low` and at most `high`. */
  private tired(low: number, high: number): number {
    return servingAgents(this.world).filter((agent) => {
      const exhaustion = exhaustionOf(agent.state);
      return exhaustion > low && exhaustion <= high;
    }).length;
  }

  /**
   * Tires an Agent out through the deaths of its team: a `sacrifice` of a survivor with one doomed Agent, or two when
   * one is not enough, whose Combat fought ahead ends Retreated within SHORT Combat rounds with the doomed Agents dead,
   * and leaves the survivor's exhaustion, with its Mission exhaustion, above `low` and at most `high`. The survivors
   * are tried among the Agents in base from the most tired, and the doomed Agents are the Agents on Standby that wear
   * no Item but the issued ones, from the lowest base skill.
   */
  private sacrifice(site: MissionSite, bounds: Bounds, low: number, high: number): boolean {
    const survivors = this.agents()
      .filter((agent) => agent.state.status === 'AtAssignment' && isBaseAssignment(agent.state.assignment))
      .sort(
        (a, b) => b.state.exactExhaustionHundredths - a.state.exactExhaustionHundredths || byInstanceId(a, b),
      );
    const pool = this.plain(this.onStandby()).sort(
      (a, b) => a.state.skillHundredths - b.state.skillHundredths || byInstanceId(a, b),
    );
    for (const count of [1, 2]) {
      const tiring = missionExhaustion(count, count + 1, this.gdrs.agentParameters) * 100;
      for (const survivor of survivors) {
        const doomed = pool.filter((agent) => agent.id !== survivor.id).slice(0, count);
        if (doomed.length < count) {
          continue;
        }
        const team = [survivor, ...doomed];
        const plan = (): Plan => ({
          kind: 'sacrifice',
          agents: new Set(team.map((agent) => agent.id)),
          enemies: bounds,
          doomed: doomed.map((agent) => agent.id),
          survivor: survivor.id,
          tracked: new Map(team.map((agent) => [agent.id, track(this.combatantOf(agent))])),
          dealt: false,
        });
        const fought = this.ahead(
          team.map((agent) => this.fighter(agent)),
          site,
          plan(),
        );
        const index = team
          .map((agent) => agent.id)
          .sort((a, b) => byInstanceId({ id: a }, { id: b }))
          .indexOf(survivor.id);
        const after = must(fought.agents[index], 'the survivor');
        const exhaustion = exhaustionOf({
          exactExhaustionHundredths: after.exactExhaustionHundredths + tiring,
        });
        if (
          fought.summary.outcome === 'Retreated' &&
          fought.summary.agentsDead === count &&
          after.currentHealthHundredths > 0 &&
          fought.report.rounds <= SHORT &&
          exhaustion > low &&
          exhaustion <= high &&
          this.deploy(site, team)
        ) {
          this.forcing.add(plan());
          return true;
        }
      }
    }
    return false;
  }

  /** Deploys a team that wins unharmed, when its Combat fought ahead is Won within LONG Combat rounds. */
  private win(site: MissionSite, bounds: Bounds, ready: readonly Agent[]): boolean {
    const team = ready.slice(0, WIN_TEAM);
    if (team.length === 0) {
      return false;
    }
    const plan: Plan = { kind: 'win', agents: new Set(team.map((agent) => agent.id)), enemies: bounds };
    const fought = this.ahead(
      team.map((agent) => this.fighter(agent)),
      site,
      plan,
    );
    if (fought.summary.outcome !== 'Won' || fought.report.rounds > LONG || !this.deploy(site, team)) {
      return false;
    }
    this.forcing.add(plan);
    return true;
  }

  /**
   * Deploys Agents to the Active Mission sites, with the Combat of each fixed by its plan: the kill, then the wounds,
   * then, once the build-up is done, the sacrifices on Initiative Mission sites, and otherwise wins while they are needed.
   */
  private deployAll(): void {
    const { exhaustionWorkLimit, exhaustionIncapacitation } = this.gdrs.agentParameters;
    const serving = servingAgents(this.world);
    let killing = this.agents().some((agent) => agent.state.status === 'Killed');
    let wounded = serving.filter((agent) => agent.state.healthLostHundredths > 0).length;
    const builtUp = Object.values(buildUp(this.state, this.gdrs)).every(Boolean);
    // The tired Agents: one above exhaustion_work_limit that stays so for a Turn more, and one above
    // exhaustion_incapacitation.
    let limit = this.tired(exhaustionWorkLimit + TIRED_MARGIN, exhaustionIncapacitation) > 0;
    let incapacitation = this.tired(exhaustionIncapacitation, Infinity) > 0;
    let won = Object.values(this.world.missions).filter(
      (mission) => mission.state.lifecycle === 'Won',
    ).length;
    const armored = new Set(serving.map((agent) => agent.state.armor)).size >= AT_LEAST.armors;
    const sites = Object.values(this.world.missionSites)
      .filter((site) => site.state.lifecycle === 'Active')
      .sort(byInstanceId);
    for (const site of sites) {
      const bounds = this.bounds(site);
      const ready = this.onStandby();
      const initiative = site.constants.kind === 'Initiative';
      if (!killing) {
        const agent = this.plain(ready).find((item) => this.canKill(item, site, bounds));
        if (agent !== undefined && this.deploy(site, [agent])) {
          this.forcing.add({
            kind: 'kill',
            agent: agent.id,
            enemies: bounds,
            tracked: track(this.combatantOf(agent)),
          });
          killing = true;
          continue;
        }
      }
      if (wounded < AT_LEAST.wounded && ready.length >= WOUND_TEAM) {
        const team = ready.slice(0, WOUND_TEAM);
        const victim = must(team[0], 'the wounded Agent');
        if (this.deploy(site, team)) {
          this.forcing.add({
            kind: 'wound',
            agents: new Set(team.map((agent) => agent.id)),
            enemies: bounds,
            wounded: victim.id,
            tracked: track(this.combatantOf(victim)),
            dealt: false,
          });
          wounded += 1;
          won += 1;
          continue;
        }
      }
      if (builtUp && initiative) {
        if (
          !limit &&
          this.sacrifice(site, bounds, exhaustionWorkLimit + TIRED_MARGIN, exhaustionIncapacitation)
        ) {
          limit = true;
          continue;
        }
        if (limit && !incapacitation && this.sacrifice(site, bounds, exhaustionIncapacitation, Infinity)) {
          incapacitation = true;
          continue;
        }
      }
      // An Initiative Mission site that is no longer needed is left to Expire; a Response Mission site never is.
      if ((!initiative || won < AT_LEAST.won || !armored) && this.win(site, bounds, ready)) {
        won += 1;
      }
    }
  }

  /** Buys the cheapest Upgrade, the first of them in Game build order, once the money leaves a reserve of upkeep. */
  private buyUpgrade(): void {
    if (this.upgraded()) {
      return;
    }
    const cheapest = this.gdrs.upgrades.reduce<UpgradeGdr | null>(
      (best, upgrade) => (best === null || upgrade.price < best.price ? upgrade : best),
      null,
    );
    if (cheapest !== null && this.affords(cheapest.price)) {
      this.act('purchaseUpgrade', { upgrade: cheapest.id });
    }
  }

  /** Hires one Agent a Turn once an Upgrade is bought, until STAFF Agents serve, within the Agent cap. */
  private hire(): void {
    const acquisitions = this.world.agency.state.acquisitions;
    const cap = agencyCaps(this.gdrs.economy, this.gdrs.upgrades, acquisitions).agentCap;
    if (
      this.upgraded() &&
      servingAgents(this.world).length < Math.min(STAFF, cap) &&
      this.affords(this.gdrs.economy.hireCost)
    ) {
      this.act('hireAgents', { count: 1 });
    }
  }

  /** The cheapest Unlocked Item among `items` other than `except`, the first of them in Game build order. */
  private cheapest<T extends WeaponGdr | ArmorGdr>(items: Iterable<T>, except: string): T | null {
    const unlocked = unlockedEquipment(this.world, this.gdrs);
    let best: T | null = null;
    for (const item of items) {
      if (
        item.id !== except &&
        isItem(item) &&
        unlocked.has(item.id) &&
        (best === null || (item.price ?? 0) < (best.price ?? 0))
      ) {
        best = item;
      }
    }
    return best;
  }

  /**
   * Keeps Weapons and Armors worn and Items in Storage, buying what is missing once the money leaves a reserve of
   * upkeep: the cheapest Weapon other than the issued one and the cheapest Armor are each worn by an Agent in Training
   * and kept in Storage, the issued Weapon is kept in Storage too, and the Fallback Weapon is worn by an Agent in
   * Training. The rounds of the issued Weapon's AmmoType are topped up to what keeps the Serving Agents from Ammo short.
   */
  private stock(): void {
    const archetype = this.gdrs.agentArchetype;
    const issued = must(this.gdrs.weapons.get(archetype.weapon), 'the issued Weapon');
    const items = [
      this.cheapest(this.gdrs.weapons.values(), issued.id),
      this.cheapest(this.gdrs.armors.values(), archetype.armor),
      issued,
      fallbacks(this.gdrs).weapon,
    ];
    for (const item of items) {
      if (item === null) {
        continue;
      }
      const serving = servingAgents(this.world);
      const worn = serving.some((agent) => agent.state.weapon === item.id || agent.state.armor === item.id);
      const wanted = (worn ? 1 : 2) - storageCount(this.world, item.id);
      if (item.price !== null && wanted > 0 && this.affords(item.price * wanted)) {
        this.act('buyItems', { items: [{ id: item.id, count: wanted }] });
      }
      const trainee = serving.find(
        (agent) =>
          agent.state.assignment?.kind === 'Training' &&
          agent.state.weapon === archetype.weapon &&
          agent.state.armor === archetype.armor,
      );
      if (!worn && trainee !== undefined && (item.price === null || storageCount(this.world, item.id) >= 2)) {
        this.act('equipAgent', { agent: trainee.id, equipment: item.id });
      }
    }
    const ammo = issued.ammoType === null ? undefined : this.gdrs.ammoTypes.get(issued.ammoType);
    if (ammo !== undefined) {
      const needed =
        this.gdrs.equipment.ammoShortRoundsPerAgent * servingAgents(this.world).length -
        storageCount(this.world, ammo.id);
      if (needed > 0 && this.affords(ammo.price * needed)) {
        this.act('buyItems', { items: [{ id: ammo.id, count: needed }] });
      }
    }
  }

  play(): void {
    if (this.world.turn === 1) {
      this.act('hireAgents', { count: HIRES });
    }
    // An Investigation first when none is Active, so that the Missions do not take every Agent. The Upgrade comes before
    // the deployments, whose fixed Combats read the effective values it may raise.
    this.investigate(1);
    this.buyUpgrade();
    this.hire();
    this.deployAll();
    this.investigate(INVESTIGATIONS);
    this.fill('Training', TRAINING);
    this.fill('Contracting', Math.min(CONTRACTING, currentContractingCap(this.world, this.gdrs)));
    this.stock();
    const next = advanceTurnOf(this.state, this.gdrs, this.forcing.source);
    this.forcing.clear();
    if (isRejection(next)) {
      throw new EngineDefect(`The Prologue could not advance Turn ${this.world.turn}: ${next.message}`);
    }
    this.state = next;
  }
}

/**
 * TURN, Prologue: plays the Prologue from the initial Campaign state and returns the Campaign at the start of the Turn
 * it reached, with an empty Action record and no pending random outcome override.
 */
export function playPrologue(initial: CampaignState, gdrs: GdrCatalog): CampaignState {
  const forcing = new Forcing(gdrs);
  let state = initial;
  for (;;) {
    const world = state.world.current;
    if (world.ending !== null) {
      throw new EngineDefect(
        `The Prologue reached a Campaign ending, ${world.ending}, in Turn ${world.turn - 1}`,
      );
    }
    const missing = unmet(state, gdrs);
    if (world.turn >= FIRST_TURN && missing.length === 0) {
      return state;
    }
    if (world.turn >= LAST_TURN) {
      throw new EngineDefect(
        `The Prologue did not reach what it guarantees by Turn ${LAST_TURN}; it lacks: ${missing.join(', ')}`,
      );
    }
    const turn = new PrologueTurn(state, gdrs, forcing);
    turn.play();
    state = turn.state;
  }
}
