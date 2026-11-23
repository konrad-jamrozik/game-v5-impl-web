/**
 * TURN, Prologue: campaign creation that continues from the initial Campaign state. The engine takes Player actions and
 * advances Turns, each as a player could, through the same two functions every Player action goes through, and hands
 * the Campaign over at the start of the Turn it reached. It fixes some Random outcomes to reach what it must, inside
 * its own random source and never through a random outcome override, so the History shows only Player actions and no
 * override is left pending.
 *
 * The Prologue plays by a fixed policy that reads only the World state and the Game build, so equal Campaign seeds give
 * equal Prologues. Every Turn it keeps Agents on Training, on Contracting once it is unlocked, and on Investigations of
 * the available Leads in Game build order, buys the cheapest Upgrade once the money allows, and deploys Agents to every
 * Active Mission site. The Combats of its Missions are fixed: the first lone Agent is Killed, one Agent of the next team
 * is wounded so that it ends up Recovering, and every other team wins unharmed. The Investigations' Required progress
 * outcomes take their least value. It stops at the start of the first Turn, from FIRST_TURN on, whose World state holds
 * everything that TURN, Prologue guarantees.
 */
import { byInstanceId, EngineDefect, must } from '../../kernel/index.ts';
import type { GdrCatalog, UpgradeGdr } from '../../gdr/index.ts';
import { effectiveSkill, isFitForWork } from '../mechanics/agents/agents.ts';
import {
  agentCombatantState,
  damageBounds,
  enemyCombatantState,
  isAbleToFight,
  meetsIncapacitationCondition,
  type CombatantState,
} from '../mechanics/combat/combat.ts';
import { agentUpgradeBonus } from '../mechanics/economy/economy.ts';
import { activeInvestigationOf, currentContractingCap, leadAvailability } from '../mechanics/leads/leads.ts';
import { advanceTurnOf, applyActionTo } from '../play.ts';
import type { Random } from '../random.ts';
import { isRejection } from '../result.ts';
import type { Agent, CampaignState, CurrentWorldState, MissionSite } from '../state/types.ts';

/** The earliest Turn at whose start the Prologue hands the Campaign over, so that the Turn series have a history. */
export const FIRST_TURN = 20;
/** The Turn at whose start a Prologue that has not reached its guarantees is a defect. */
const LAST_TURN = 60;
/** The Agents the Prologue hires on its first Turn, so that every kind of work has hands. */
const HIRES = 4;
/** The Agents it keeps on Training. */
const TRAINING = 2;
/** The most Agents it keeps on Contracting. */
const CONTRACTING = 3;
/** The most Active Investigations it keeps, and the size of each Investigation's team. */
const INVESTIGATIONS = 2;
const INVESTIGATION_TEAM = 2;
/** The size of the team of a Mission in which an Agent is wounded, and of every other team that wins. */
const WOUND_TEAM = 2;
const WIN_TEAM = 3;
/** The Turns of upkeep the Prologue keeps in money after it buys an Upgrade. */
const RESERVE_TURNS = 2;

/** A Combatant's values as a fixed Combat changes them, followed attack by attack. */
interface Tracked {
  state: CombatantState;
  armor: number;
}

/**
 * How the Combat of one Mission is fixed. `kill`: the lone Agent misses, and the Enemies hit it, each keeping it able to
 * fight, until one hit kills it. `wound`: the Agents hit for their highest damage, the first Enemy attack hits
 * `wounded` for at most half its effective max health, and every other Enemy attack misses. `win`: the Agents hit for
 * their highest damage and the Enemies miss.
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
  | { readonly kind: 'win'; readonly agents: ReadonlySet<string>; readonly enemies: Bounds };

/** The damage bounds of each Enemy of a Mission site, by Instance ID. */
type Bounds = ReadonlyMap<string, { readonly lo: number; readonly hi: number }>;

const HIT = 'combat.hit.';
const DAMAGE = 'combat.damage.';
const TARGET = 'combat.target.';
const REQUIRED_PROGRESS = 'investigation.requiredProgress.';

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
  /** The target each Enemy of a `wound` drew for its current attack. */
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
    if (plan?.kind !== 'wound' || !plan.enemies.has(id) || plan.dealt) {
      return null;
    }
    return entries.some(([key, weight]) => key === plan.wounded && weight > 0) ? plan.wounded : null;
  }

  /** The random source of one action, which wraps the seeded source of the World state it changes. */
  readonly source = (seeded: Random): Random => ({
    uniform: (outcome, lo, hi) => this.uniform(outcome, lo, hi) ?? seeded.uniform(outcome, lo, hi),
    chance: (outcome, p) =>
      (outcome.startsWith(HIT) ? this.hit(outcome.slice(HIT.length)) : null) ?? seeded.chance(outcome, p),
    weighted: (outcome, entries) => {
      if (!outcome.startsWith(TARGET)) {
        return seeded.weighted(outcome, entries);
      }
      const id = outcome.slice(TARGET.length);
      const chosen = this.weighted(id, entries) ?? seeded.weighted(outcome, entries);
      if (this.planOf(id)?.kind === 'wound') {
        this.target.set(id, chosen);
      }
      return chosen;
    },
  });
}

/** TURN, Prologue: whether the World state holds everything a Campaign handed over after a Prologue must hold. */
function guaranteesHold(state: CampaignState): boolean {
  const world = state.world.current;
  const agents = Object.values(world.agents);
  const investigations = Object.values(world.investigations);
  return (
    world.ending === null &&
    agents.some((agent) => agent.state.status === 'Killed') &&
    agents.some((agent) => agent.state.status === 'Recovering') &&
    agents.some((agent) => agent.state.assignment?.kind === 'Training') &&
    agents.some((agent) => {
      const assignment = agent.state.assignment;
      return (
        assignment?.kind === 'Investigation' &&
        world.investigations[assignment.investigation]?.state.lifecycle === 'Active'
      );
    }) &&
    investigations.some((investigation) => investigation.state.lifecycle === 'Completed') &&
    Object.values(world.missionSites).some((site) => site.state.lifecycle === 'Active') &&
    Object.values(world.missions).some((mission) => mission.state.lifecycle === 'Won') &&
    Object.values(world.agency.state.acquisitions).some((count) => count > 0)
  );
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

  /** The Agents At assignment on Standby that are Fit to start work, in Instance ID order. */
  private onStandby(): Agent[] {
    return this.agents().filter(
      (agent) =>
        agent.state.status === 'AtAssignment' &&
        agent.state.assignment?.kind === 'Standby' &&
        isFitForWork(agent.state, this.gdrs.agentParameters),
    );
  }

  private count(kind: string): number {
    return this.agents().filter((agent) => agent.state.assignment?.kind === kind).length;
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

  /** Deploys Agents to every Active Mission site, with the Combat of each fixed by its plan. */
  private deployAll(): void {
    let killing = this.agents().some((agent) => agent.state.status === 'Killed');
    let wounding = this.agents().some((agent) => agent.state.assignment?.kind === 'Recovery');
    const sites = Object.values(this.world.missionSites)
      .filter((site) => site.state.lifecycle === 'Active')
      .sort(byInstanceId);
    for (const site of sites) {
      const bounds = this.bounds(site);
      const ready = this.onStandby();
      if (!killing) {
        const agent = ready.find((item) => this.canKill(item, site, bounds));
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
      if (!wounding && ready.length >= WOUND_TEAM) {
        const team = ready.slice(0, WOUND_TEAM);
        const wounded = must(team[0], 'the wounded Agent');
        if (this.deploy(site, team)) {
          this.forcing.add({
            kind: 'wound',
            agents: new Set(team.map((agent) => agent.id)),
            enemies: bounds,
            wounded: wounded.id,
            tracked: track(this.combatantOf(wounded)),
            dealt: false,
          });
          wounding = true;
          continue;
        }
      }
      const team = ready.slice(0, WIN_TEAM);
      if (team.length > 0 && this.deploy(site, team)) {
        this.forcing.add({ kind: 'win', agents: new Set(team.map((agent) => agent.id)), enemies: bounds });
      }
    }
  }

  /** Buys the cheapest Upgrade, the first of them in Game build order, once the money leaves a reserve of upkeep. */
  private buyUpgrade(): void {
    const agency = this.world.agency.state;
    if (Object.values(agency.acquisitions).some((count) => count > 0)) {
      return;
    }
    const cheapest = this.gdrs.upgrades.reduce<UpgradeGdr | null>(
      (best, upgrade) => (best === null || upgrade.price < best.price ? upgrade : best),
      null,
    );
    const serving = this.agents().filter((agent) => agent.state.assignment !== null).length;
    const reserve = RESERVE_TURNS * serving * this.gdrs.economy.upkeepPerAgent;
    if (cheapest !== null && agency.money >= cheapest.price + reserve) {
      this.act('purchaseUpgrade', { upgrade: cheapest.id });
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
    this.deployAll();
    this.investigate(INVESTIGATIONS);
    this.fill('Training', TRAINING);
    this.fill('Contracting', Math.min(CONTRACTING, currentContractingCap(this.world, this.gdrs)));
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
    if (world.turn >= FIRST_TURN && guaranteesHold(state)) {
      return state;
    }
    if (world.turn >= LAST_TURN) {
      throw new EngineDefect(`The Prologue did not reach what it guarantees by Turn ${LAST_TURN}`);
    }
    const turn = new PrologueTurn(state, gdrs, forcing);
    turn.play();
    state = turn.state;
  }
}
