/**
 * AVIEW, Equip table: what each Agent wears and every number behind how well it fights, one press away from the Agents
 * View, over the whole screen. It lists the Agents the Agent table shows, sorted on its own, without selection
 * checkboxes, because the Player equips one Agent at a time; a Weapon or Armor cell opens the Equipment picker. Until
 * it is fitted it may scroll sideways in the Reference window (AVIEW, TODOs).
 */
import type {
  AgentView,
  CurrentLiveWorldStateView,
  CurrentRetiredWorldStateView,
} from '../../engine/index.ts';
import { assignmentText } from '../assignment.ts';
import { AssignmentCell } from '../assignment-cell.tsx';
import { Exhaustion, Health, type ExhaustionLevels } from '../condition.tsx';
import { wholeText } from '../format.ts';
import { usePlaceState } from '../place.tsx';
import { rankOf, type RankThreshold } from '../rank.ts';
import { RankText } from '../rank-insignia.tsx';
import { compareValues, pressHeader, sortRows, type SortTier } from '../table-sort.ts';
import { Grid, SortMark, ariaSort } from '../ui.tsx';
import { EquipmentPicker } from './EquipmentPicker.tsx';
import type { ReportTarget } from './TurnReportView.tsx';

type EquipKey =
  | 'id'
  | 'combatRating'
  | 'equipmentCombatRating'
  | 'rank'
  | 'effectiveSkill'
  | 'baseSkill'
  | 'experience'
  | 'health'
  | 'exhaustion'
  | 'weapon'
  | 'armor'
  | 'assignment';

/**
 * VIS, Tables: the fixed widths of the Equip table. The Instance ID holds 30 characters, as in the Agent table; CR and
 * Skill and Base hold four digits, Equip. four after its sign, Exp. three; Weapon and Armor hold the longest Item `name`
 * of the GDRs with its number and icon.
 */
const EQUIP_WIDTHS = [
  '274px',
  '64px',
  '80px',
  '116px',
  '80px',
  '80px',
  '64px',
  '84px',
  '72px',
  '200px',
  '220px',
  '176px',
];

/** VIS, Tables: the columns that sort descending first, because they sort by a number. */
const DESCENDING_FIRST: ReadonlySet<EquipKey> = new Set([
  'combatRating',
  'equipmentCombatRating',
  'rank',
  'effectiveSkill',
  'baseSkill',
  'experience',
  'health',
  'exhaustion',
  'weapon',
  'armor',
]);
/** VIS, Tables: the columns that hold numbers are right-aligned. */
const NUMERIC: ReadonlySet<EquipKey> = new Set([
  'combatRating',
  'equipmentCombatRating',
  'effectiveSkill',
  'baseSkill',
  'experience',
  'health',
  'exhaustion',
]);

/** AVIEW, Equip table: the Equipment Combat rating with its sign, in Positive above 0, Danger below, Text muted at 0. */
function EquipmentCombatRatingCell({ agent }: { agent: AgentView }) {
  const equipment = agent.equipmentCombatRating ?? 0;
  const tone = equipment > 0 ? 'tone-good' : equipment < 0 ? 'tone-bad' : 'muted';
  return (
    <span className={tone} data-testid={`equipment-cr-${agent.id}`}>
      {equipment > 0 ? `+${equipment}` : equipment < 0 ? `−${-equipment}` : '0'}
    </span>
  );
}

export function EquipTable(props: {
  agents: readonly AgentView[];
  state: CurrentLiveWorldStateView;
  retired: CurrentRetiredWorldStateView | null;
  ranks: readonly RankThreshold[];
  levels: ExhaustionLevels;
  locked: string | null;
  onOpenDetails: (id: string) => void;
  onShow: (target: ReportTarget) => void;
}) {
  const { state, retired, ranks, levels, locked } = props;
  // VIS, Tables: up to four sort tiers over the default order by Instance ID.
  const [tiers, setTiers] = usePlaceState<SortTier<EquipKey>[]>('equipTiers', []);
  const value = (agent: AgentView, key: EquipKey): number | string => {
    switch (key) {
      case 'id':
        return agent.id;
      case 'combatRating':
        return agent.combatRating ?? 0;
      case 'equipmentCombatRating':
        return agent.equipmentCombatRating ?? 0;
      case 'rank':
      case 'baseSkill':
        return agent.skillHundredths;
      case 'effectiveSkill':
        return agent.effectiveSkill;
      case 'experience':
        return agent.experience;
      case 'health':
        return agent.currentHealthHundredths;
      case 'exhaustion':
        return agent.exhaustion;
      case 'weapon':
        return agent.baseWeaponDamage;
      case 'armor':
        return agent.baseArmor;
      case 'assignment':
        return assignmentText(agent, state, retired);
    }
  };
  const rows = sortRows(
    [...props.agents].sort((a, b) => compareValues(a.id, b.id)),
    tiers,
    value,
  );
  const header = (key: EquipKey, label: string, title?: string) => (
    <th
      className={NUMERIC.has(key) ? 'sortable num' : 'sortable'}
      title={title}
      aria-sort={ariaSort(tiers, key)}
      data-testid={`equip-sort-${key}`}
      onClick={() => {
        setTiers(pressHeader(tiers, key, DESCENDING_FIRST.has(key)));
      }}
    >
      {label}
      <SortMark tiers={tiers} column={key} />
    </th>
  );
  return (
    <div className="equip-scroll">
      <Grid widths={EQUIP_WIDTHS} className="equip-grid" testId="equip-grid" scroll={false}>
        <thead>
          <tr>
            {header('id', 'Agent')}
            {header('combatRating', 'CR', 'Combat rating')}
            {header(
              'equipmentCombatRating',
              'Equip.',
              "Equipment Combat rating: the part of CR that the Agent's Weapon and Armor add over the issued kit. It is already counted in CR, not added to it.",
            )}
            {header('rank', 'Rank')}
            {header('effectiveSkill', 'Skill', 'Effective skill')}
            {header('baseSkill', 'Base', 'Base skill')}
            {header('experience', 'Exp.', 'Experience')}
            {header('health', 'Health')}
            {header('exhaustion', 'Exh.', 'Exhaustion')}
            {header('weapon', 'Weapon')}
            {header('armor', 'Armor')}
            {header('assignment', 'Assignment')}
          </tr>
        </thead>
        <tbody>
          {rows.map((agent) => {
            const rank = rankOf(agent.skillHundredths, ranks);
            return (
              <tr key={agent.id} data-testid={`equip-${agent.id}`}>
                <td>
                  {/* AVIEW, Equip table: an Instance ID closes the Equip table and opens the Agent details. */}
                  <button
                    type="button"
                    className="id-link"
                    data-testid={`equip-details-${agent.id}`}
                    onClick={() => {
                      props.onOpenDetails(agent.id);
                    }}
                  >
                    {agent.id}
                  </button>
                </td>
                <td className="num">{agent.combatRating ?? 0}</td>
                <td className="num">
                  <EquipmentCombatRatingCell agent={agent} />
                </td>
                <td>{rank === null ? null : <RankText rank={rank} abbreviated />}</td>
                <td className="num">{agent.effectiveSkill}</td>
                <td className="num">{wholeText(agent.skillHundredths)}</td>
                <td className="num">{agent.experience}</td>
                <td className="num">
                  <Health currentHundredths={agent.currentHealthHundredths} base={agent.effectiveMaxHealth} />
                </td>
                <td className="num">
                  <Exhaustion value={agent.exhaustion} levels={levels} />
                </td>
                {/* AVIEW, Weapon and Armor cells: each opens the Equipment picker. */}
                <td>
                  <EquipmentPicker
                    agent={agent}
                    kind="weapon"
                    state={state}
                    locked={locked}
                    testId={`weapon-${agent.id}`}
                  />
                </td>
                <td>
                  <EquipmentPicker
                    agent={agent}
                    kind="armor"
                    state={state}
                    locked={locked}
                    testId={`armor-${agent.id}`}
                  />
                </td>
                <td>
                  <AssignmentCell agent={agent} state={state} retired={retired} onShow={props.onShow} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </Grid>
      {rows.length === 0 ? <p className="muted pad">No Agents to show.</p> : null}
    </div>
  );
}
