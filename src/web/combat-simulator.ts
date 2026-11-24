/**
 * CSIM: the two teams of the Combat simulator as rows of fields, how a preset fills them, and how they become the setup
 * of a Detached Combat and what the Combat replay reads beside its Combat report. Pure presentation: it fights nothing.
 */
import type {
  CombatReport,
  CombatSimulatorContent,
  DetachedCombatSetup,
  FoughtCombatReport,
} from '../engine/index.ts';
import type { ReplaySource } from './combat-replay.ts';
import { enemyLabels } from './enemy-labels.ts';

/** CSIM, Teams: one field for each value of an explicit entry of a Detached Combat, as the text its field holds. */
export interface RowValues {
  readonly baseSkill: string;
  readonly currentHealth: string;
  readonly maxHealth: string;
  readonly exhaustion: string;
  readonly weaponDamage: string;
  readonly armor: string;
}

export const VALUE_FIELDS: readonly {
  readonly key: keyof RowValues;
  readonly label: string;
  readonly title: string;
}[] = [
  { key: 'baseSkill', label: 'Skill', title: 'Base skill' },
  { key: 'currentHealth', label: 'Health', title: 'Current health' },
  { key: 'maxHealth', label: 'Max', title: 'Effective max health' },
  { key: 'exhaustion', label: 'Exh.', title: 'Exhaustion' },
  { key: 'weaponDamage', label: 'Dmg', title: 'Effective weapon damage' },
  { key: 'armor', label: 'Armor', title: 'Effective armor' },
];

/** CSIM, Teams, Agent: its values, and the Weapon and the Armor they were filled from. */
export interface AgentRow {
  readonly weapon: string;
  readonly armorItem: string;
  readonly values: RowValues;
}

/** CSIM, Teams, Enemy: its values, and the EnemyArchetype they were filled from. */
export interface EnemyRow {
  readonly archetype: string;
  readonly values: RowValues;
}

const damageOf = (content: CombatSimulatorContent, weapon: string) =>
  content.weapons.find((item) => item.id === weapon)?.damage ?? 1;
const armorOf = (content: CombatSimulatorContent, armor: string) =>
  content.armors.find((item) => item.id === armor)?.armor ?? 0;

/** CSIM, Teams: an Agent as newly hired, i.e. with the values of the AgentArchetype. */
export function newAgentRow(content: CombatSimulatorContent): AgentRow {
  const archetype = content.agentArchetype;
  return {
    weapon: archetype.weapon,
    armorItem: archetype.armor,
    values: {
      baseSkill: String(archetype.skill),
      currentHealth: String(archetype.baseHealth),
      maxHealth: String(archetype.baseHealth),
      exhaustion: '0',
      weaponDamage: String(damageOf(content, archetype.weapon)),
      armor: String(armorOf(content, archetype.armor)),
    },
  };
}

/** CSIM, Teams, Agents' side: the Agents of the groups of a DetachedCombatTeam, each at full current health. */
export function agentRowsOfTeam(content: CombatSimulatorContent, teamId: string): AgentRow[] {
  const team = content.teams.find((item) => item.id === teamId);
  return (team?.agents ?? []).flatMap((group) =>
    Array.from({ length: group.count }, () => ({
      weapon: group.weapon,
      armorItem: group.armor,
      values: {
        baseSkill: String(group.baseSkill),
        currentHealth: String(group.maxHealth),
        maxHealth: String(group.maxHealth),
        exhaustion: String(group.exhaustion),
        weaponDamage: String(damageOf(content, group.weapon)),
        armor: String(armorOf(content, group.armor)),
      },
    })),
  );
}

/** CSIM, Teams, Enemy: every value of a newly created Enemy of the EnemyArchetype. */
export function enemyRow(content: CombatSimulatorContent, archetypeId: string): EnemyRow {
  const archetype = content.enemyArchetypes.find((item) => item.id === archetypeId);
  return {
    archetype: archetypeId,
    values: {
      baseSkill: String(archetype?.skill ?? 0),
      currentHealth: String(archetype?.baseHealth ?? 1),
      maxHealth: String(archetype?.baseHealth ?? 1),
      exhaustion: '0',
      weaponDamage: String(damageOf(content, archetype?.weapon ?? '')),
      armor: String(armorOf(content, archetype?.armor ?? '')),
    },
  };
}

/** CSIM, Teams, Enemies' side: the Enemies a new Mission site of the MissionSiteArchetype would have, in creation order. */
export function enemyRowsOfSite(content: CombatSimulatorContent, siteId: string): EnemyRow[] {
  const site = content.missionSiteArchetypes.find((item) => item.id === siteId);
  return (site?.enemies ?? []).map((archetype) => enemyRow(content, archetype));
}

/** CSIM, Teams, Agent: selecting a Weapon sets the row's effective weapon damage to its `base_weapon_damage`. */
export function withWeapon(content: CombatSimulatorContent, row: AgentRow, weapon: string): AgentRow {
  return { ...row, weapon, values: { ...row.values, weaponDamage: String(damageOf(content, weapon)) } };
}

/** CSIM, Teams, Agent: selecting an Armor sets the row's effective armor to its `base_armor`. */
export function withArmor(content: CombatSimulatorContent, row: AgentRow, armorItem: string): AgentRow {
  return { ...row, armorItem, values: { ...row.values, armor: String(armorOf(content, armorItem)) } };
}

/** A field as the number a setup takes: what is not a number stays one the engine rejects by its range. */
const numberOf = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));

const explicit = (values: RowValues) => ({
  kind: 'explicit' as const,
  baseSkill: numberOf(values.baseSkill),
  currentHealth: numberOf(values.currentHealth),
  effectiveMaxHealth: numberOf(values.maxHealth),
  exhaustion: numberOf(values.exhaustion),
  effectiveWeaponDamage: numberOf(values.weaponDamage),
  effectiveArmor: numberOf(values.armor),
});

/**
 * CSIM, Fighting the Combat: the setup of the Detached Combat between the two sides as the rows give them, each row as
 * an explicit entry, with no changed GDR value and no limit on any AmmoType.
 */
export function setupOf(
  agents: readonly AgentRow[],
  enemies: readonly EnemyRow[],
  seed: string,
): DetachedCombatSetup {
  return {
    agents: agents.map((row) => explicit(row.values)),
    enemies: enemies.map((row) => explicit(row.values)),
    seed,
  };
}

/** The position, from 1, that the identifier of a participant of a Detached Combat names, e.g. 3 for `agent#3`. */
const positionOf = (id: string) => Number(id.slice(id.indexOf('#') + 1));

/**
 * CSIM, Fighting the Combat, and Teams: what the Combat replay reads beside the Combat report of a Detached Combat. An
 * Agent is named by its place in its side and its shots follow its row's Weapon; an Enemy's figure, Enemy label, and
 * shots follow its row's EnemyArchetype; and the positions derive from the Detached seed.
 */
export function replaySourceOf(
  content: CombatSimulatorContent,
  agents: readonly AgentRow[],
  enemies: readonly EnemyRow[],
  seed: string,
): ReplaySource {
  const archetypeOf = (id: string) =>
    content.enemyArchetypes.find((item) => item.id === enemies[positionOf(id) - 1]?.archetype);
  const ammoTypeOf = (weapon: string | undefined) =>
    content.weapons.find((item) => item.id === weapon)?.ammoType ?? null;
  const labels = enemyLabels(
    enemies.map((row, index) => ({
      id: `enemy#${index + 1}`,
      archetype: row.archetype,
      archetypeName: content.enemyArchetypes.find((item) => item.id === row.archetype)?.name ?? row.archetype,
    })),
  );
  return {
    nameOf: (id) => (id.startsWith('agent#') ? `agent-${positionOf(id)}` : (labels.get(id) ?? id)),
    enemyOrder: (id) => content.enemyArchetypes.findIndex((item) => item.id === archetypeOf(id)?.id),
    enemyAmmoType: (id) => ammoTypeOf(archetypeOf(id)?.weapon),
    agentAmmoType: (id) => ammoTypeOf(agents[positionOf(id) - 1]?.weapon),
    shotOfAmmoType: (ammoType) => content.ammoTypes.find((item) => item.id === ammoType)?.shot,
    seed,
  };
}

/** The Combat report of a Detached Combat as the Combat replay takes one: it has no Mission. */
export function reportOf(report: FoughtCombatReport): CombatReport {
  return { ...report, mission: '' };
}

/** CSIM, Fighting the Combat, New seed: a seed from a number in [0, 1), e.g. of `Math.random()`. */
export function seedFrom(chance: number): string {
  return `sim-${Math.floor(chance * 36 ** 6)
    .toString(36)
    .padStart(6, '0')}`;
}

/** CSIM, Fighting the Combat, Seed: the Detached seed the field starts with. */
export const FIRST_SEED = 'combat-simulator';
