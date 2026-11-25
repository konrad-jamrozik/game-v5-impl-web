/**
 * ARMV: the Armory View. One table of the Serving Agents with what each wears and what that is worth in a Combat, and
 * the Equipment picker in its Weapon and Armor cells. It shows the Agents of the Agents View (AVIEW), which assigns
 * them: the roster has one table for each of the two tasks, so that each fits its view (VIS, Tables).
 */
import type { AgentView, CurrentLiveWorldStateView } from '../../engine/index.ts';
import { assignmentText } from '../assignment.ts';
import { AssignmentCell } from '../assignment-cell.tsx';
import { Exhaustion, Health, exhaustionLevels } from '../condition.tsx';
import { usePlaceState } from '../place.tsx';
import type { Snapshot } from '../store.ts';
import { compareValues, pressHeader, sortRows, type SortTier } from '../table-sort.ts';
import { Grid, SortMark, ariaSort } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';
import { EquipmentPicker } from './EquipmentPicker.tsx';
import type { ReportTarget } from './TurnReportView.tsx';

type ArmoryKey =
  | 'id'
  | 'combatRating'
  | 'effectiveSkill'
  | 'health'
  | 'exhaustion'
  | 'weapon'
  | 'armor'
  | 'assignment';

/**
 * VIS, Tables: the fixed widths of the Armory table, 1068 px in all, the width a Detail view gives a table in the
 * Reference window. Weapon and Armor hold the longest Item `name` of the GDRs with its number and icon.
 */
const ARMORY_WIDTHS = ['104px', '112px', '84px', '96px', '76px', '200px', '220px', '176px'];

/** ARMV, Agent table: the columns whose header sorts descending first, because they hold numbers. */
const NUMERIC: ReadonlySet<ArmoryKey> = new Set([
  'combatRating',
  'effectiveSkill',
  'health',
  'exhaustion',
  'weapon',
  'armor',
]);

/** ARMV, Agent table: the CR cell, the Combat rating followed by the Equipment Combat rating with its sign. */
function CombatRatingCell({ agent }: { agent: AgentView }) {
  const equipment = agent.equipmentCombatRating ?? 0;
  const tone = equipment > 0 ? 'tone-good' : equipment < 0 ? 'tone-bad' : 'muted';
  return (
    <span data-testid={`cr-${agent.id}`}>
      {agent.combatRating ?? 0}{' '}
      <span className={tone}>
        ({equipment > 0 ? `+${equipment}` : equipment < 0 ? `−${-equipment}` : '0'})
      </span>
    </span>
  );
}

export function ArmoryView(props: {
  snapshot: Snapshot;
  state: CurrentLiveWorldStateView;
  locked: string | null;
  /** CSCR, View trail, Follow: opens another Detail view with an item selected. */
  onShow: (target: ReportTarget) => void;
  onClose: () => void;
}) {
  const { snapshot, state, locked } = props;
  const levels = exhaustionLevels(snapshot.gameData);
  // VIS, Tables: up to four sort tiers over the default order by Instance ID.
  const [tiers, setTiers] = usePlaceState<SortTier<ArmoryKey>[]>('armoryTiers', []);
  const assignment = (agent: AgentView) => assignmentText(agent, state, snapshot.retired);
  const value = (agent: AgentView, key: ArmoryKey): number | string => {
    switch (key) {
      case 'id':
        return agent.id;
      case 'combatRating':
        return agent.combatRating ?? 0;
      case 'effectiveSkill':
        return agent.effectiveSkill;
      case 'health':
        return agent.currentHealthHundredths;
      case 'exhaustion':
        return agent.exhaustion;
      case 'weapon':
        return agent.baseWeaponDamage;
      case 'armor':
        return agent.baseArmor;
      case 'assignment':
        return assignment(agent);
    }
  };
  const rows = sortRows(
    [...state.agents].sort((a, b) => compareValues(a.id, b.id)),
    tiers,
    value,
  );
  const header = (key: ArmoryKey, label: string, alignRight: boolean, title?: string) => (
    <th
      className={alignRight ? 'sortable num' : 'sortable'}
      title={title}
      aria-sort={ariaSort(tiers, key)}
      data-testid={`armory-sort-${key}`}
      onClick={() => {
        setTiers(pressHeader(tiers, key, NUMERIC.has(key)));
      }}
    >
      {label}
      <SortMark tiers={tiers} column={key} />
    </th>
  );
  return (
    <DetailView id="armory" title="Armory" onClose={props.onClose}>
      <div className="grid-scroll">
        <Grid widths={ARMORY_WIDTHS} className="armory-grid" testId="armory-grid" scroll={false}>
          <thead>
            <tr>
              {header('id', 'Agent', false)}
              {header('combatRating', 'CR', true, 'Combat rating, and what the equipment adds to it')}
              {header('effectiveSkill', 'Skill', true, 'Effective skill')}
              {header('health', 'Health', true)}
              {header('exhaustion', 'Exh.', true, 'Exhaustion')}
              {header('weapon', 'Weapon', false)}
              {header('armor', 'Armor', false)}
              {header('assignment', 'Assignment', false)}
            </tr>
          </thead>
          <tbody>
            {rows.map((agent) => (
              <tr key={agent.id} data-testid={`armory-${agent.id}`}>
                <td>
                  {/* ARMV, Agent table: the Instance ID opens the Agent details of the Agents View, as a Follow. */}
                  <button
                    type="button"
                    className="id-link"
                    data-testid={`armory-details-${agent.id}`}
                    onClick={() => {
                      props.onShow({ kind: 'agent', agent: agent.id });
                    }}
                  >
                    {agent.id}
                  </button>
                </td>
                <td className="num">
                  <CombatRatingCell agent={agent} />
                </td>
                <td className="num">{agent.effectiveSkill}</td>
                <td className="num">
                  <Health currentHundredths={agent.currentHealthHundredths} base={agent.effectiveMaxHealth} />
                </td>
                <td className="num">
                  <Exhaustion value={agent.exhaustion} levels={levels} />
                </td>
                {/* ARMV, Weapon and Armor cells: each opens the Equipment picker. */}
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
                <td data-testid={`armory-assignment-${agent.id}`}>
                  <AssignmentCell
                    agent={agent}
                    state={state}
                    retired={snapshot.retired}
                    onShow={props.onShow}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Grid>
      </div>
      {rows.length === 0 ? <p className="muted pad">No Agents to show.</p> : null}
    </DetailView>
  );
}
