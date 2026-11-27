/**
 * HVIEW, Turn by Turn table and Player actions list: the Expenditures of a Turn and the lines that list its Player
 * actions, from the Action record of its History entry. Pure presentation; no gameplay rule.
 */
import type { ActionRecordItem } from '../engine/index.ts';
import { groupDigits } from './format.ts';

/** HVIEW, Expenditures: the sum of the money changes below 0, as a positive amount. */
export function expenditures(actions: readonly ActionRecordItem[]): number {
  return actions.reduce((sum, item) => (item.moneyChange < 0 ? sum - item.moneyChange : sum), 0);
}

/** The names a line uses, resolved through the Live and Retired world state queries. */
export interface ActionNames {
  lead(id: string): string;
  /** The `name` of the Lead of an Investigation. */
  investigationLead(id: string): string;
  /** The MissionSiteArchetype `name` of a Mission site. */
  missionSite(id: string): string;
  upgrade(id: string): string;
  /** The `name` of a Weapon, an Armor, or an AmmoType. */
  item(id: string): string;
  /** GUI, Agent shown by name: the Agent name of an Agent. */
  agent(id: string): string;
}

/** HVIEW, `buyItems` and `sellItems`: each entry's count and `name`, joined by ", ", e.g. "2 Rifles, 100 Pistol ammo". */
function entriesText(item: ActionRecordItem, names: ActionNames): string {
  const items = arg(item, 'items');
  if (!Array.isArray(items)) {
    return '';
  }
  return items
    .map((entry: { id?: unknown; count?: unknown }) => {
      const count = typeof entry.count === 'number' ? entry.count : 0;
      const name = names.item(typeof entry.id === 'string' ? entry.id : '');
      return `${groupDigits(count)} ${name}`;
    })
    .join(', ');
}

/** One line of the Player actions list. */
export interface ActionLine {
  /** The number of the Player action in the Turn, from 1, or of the first and last of the grouped ones, e.g. "1–4". */
  readonly numbers: string;
  readonly text: string;
  readonly moneyChange: number;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${groupDigits(count)} ${count === 1 ? one : many}`;
}

function arg(item: ActionRecordItem, key: string): unknown {
  const args = item.args;
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>)[key] : undefined;
}

function text(item: ActionRecordItem, key: string): string {
  const value = arg(item, key);
  return typeof value === 'string' ? value : String(value);
}

/** The Agents a hiring item hired; an item written before hiring took a count hired one. */
function hiredCount(item: ActionRecordItem): number {
  const count = arg(item, 'count');
  return item.operation === 'hireAgent' ? 1 : typeof count === 'number' ? count : 0;
}

/** HVIEW, Player actions list: whether two consecutive items are one line. */
function sameLine(a: ActionRecordItem, b: ActionRecordItem): boolean {
  const hires = (item: ActionRecordItem) => item.operation === 'hireAgents' || item.operation === 'hireAgent';
  if (hires(a) || hires(b)) {
    return hires(a) && hires(b);
  }
  return a.operation === b.operation && JSON.stringify(a.args) === JSON.stringify(b.args);
}

function agentCount(item: ActionRecordItem): number {
  const agents = arg(item, 'agents');
  return Array.isArray(agents) ? agents.length : 0;
}

/** HVIEW, Player actions list: what one line says, for a group of `count` equal consecutive items. */
function lineText(
  item: ActionRecordItem,
  group: readonly ActionRecordItem[],
  money: number,
  names: ActionNames,
): string {
  const count = group.length;
  const agents = plural(agentCount(item), 'Agent');
  switch (item.operation) {
    case 'hireAgents':
    case 'hireAgent':
      return `Hired ${plural(
        group.reduce((sum, each) => sum + hiredCount(each), 0),
        'Agent',
      )}`;
    case 'dismissAgents':
      return `Dismissed ${agents}`;
    case 'purchaseUpgrade':
      return `Bought ${groupDigits(count)} ${names.upgrade(text(item, 'upgrade'))} ${count === 1 ? 'Upgrade' : 'Upgrades'}`;
    case 'equipAgent':
      return `Equipped ${names.agent(text(item, 'agent'))} with ${names.item(text(item, 'equipment'))}`;
    case 'equipAgents': {
      // HVIEW, `equipAgents`: N is the number of distinct Agents its entries name.
      const changes = arg(item, 'changes');
      const ids = Array.isArray(changes)
        ? changes.map((entry: { agent?: unknown }) => entry.agent).filter((id) => typeof id === 'string')
        : [];
      return `Equipped ${plural(new Set(ids).size, 'Agent')}`;
    }
    case 'buyItems':
      return `Bought ${entriesText(item, names)}`;
    case 'sellItems':
      return `Sold ${entriesText(item, names)}`;
    case 'assignAgents':
      return `Assigned ${agents} to ${text(item, 'assignment')}`;
    case 'startInvestigation':
      return `Started Investigation of ${names.lead(text(item, 'lead'))} with ${agents}`;
    case 'assignAgentsToInvestigation':
      return `Assigned ${agents} to Investigation of ${names.investigationLead(text(item, 'investigation'))}`;
    case 'deployAgents':
      return `Deployed ${agents} to ${names.missionSite(text(item, 'missionSite'))}`;
    case 'addMoney':
      return money < 0
        ? `Removed ${groupDigits(-money)} money (cheat)`
        : `Added ${groupDigits(money)} money (cheat)`;
    case 'addAgents': {
      const each = arg(item, 'count');
      return `Added ${plural((typeof each === 'number' ? each : 0) * count, 'Agent')} (cheat)`;
    }
    default:
      return item.operation;
  }
}

/**
 * HVIEW, Player actions list: one line per item of the Action record, in its order, with consecutive items that name
 * the same operation with the same arguments as one line, and so consecutive `hireAgents` items whatever their
 * `count`, whose count and money change are their totals.
 */
export function actionLines(actions: readonly ActionRecordItem[], names: ActionNames): ActionLine[] {
  const lines: ActionLine[] = [];
  let start = 0;
  while (start < actions.length) {
    const first = actions[start] as ActionRecordItem;
    let end = start + 1;
    while (end < actions.length && sameLine(first, actions[end] as ActionRecordItem)) {
      end += 1;
    }
    const group = actions.slice(start, end);
    const money = group.reduce((sum, item) => sum + item.moneyChange, 0);
    lines.push({
      numbers: end - start === 1 ? groupDigits(start + 1) : `${groupDigits(start + 1)}–${groupDigits(end)}`,
      text: lineText(first, group, money, names),
      moneyChange: money,
    });
    start = end;
  }
  return lines;
}
