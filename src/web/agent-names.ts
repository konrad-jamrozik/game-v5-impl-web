/**
 * GUI, Agent shown by name: the GUI shows every Agent by its Agent name, and only beside a figure of the Combat replay
 * by its last name alone, or its first name when its last name is empty. Pure presentation; no gameplay rule.
 */
import type { AgentView } from '../engine/index.ts';

type Named = Pick<AgentView, 'id' | 'name' | 'firstName' | 'lastName'>;

/** The name an Agent shows beside a figure of the Combat replay: its last name, or its first name when it has none. */
export function agentShortName(agent: Pick<AgentView, 'firstName' | 'lastName'>): string {
  return agent.lastName === '' ? agent.firstName : agent.lastName;
}

/** The Agent name of every Agent of the given lists, Serving and Terminated alike, keyed by its Instance ID. */
export function agentNames(
  ...lists: readonly (readonly Named[] | null | undefined)[]
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const list of lists) {
    for (const agent of list ?? []) {
      names.set(agent.id, agent.name);
    }
  }
  return names;
}

/** The short name of every Agent of the given lists, for the Combat replay, keyed by its Instance ID. */
export function agentShortNames(
  ...lists: readonly (readonly Named[] | null | undefined)[]
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const list of lists) {
    for (const agent of list ?? []) {
      names.set(agent.id, agentShortName(agent));
    }
  }
  return names;
}

/** The Agent name of the Agent `id`, or the Instance ID when no list holds it. */
export function agentNameOf(names: ReadonlyMap<string, string>, id: string): string {
  return names.get(id) ?? id;
}
