/** The Turn report of the most recent Advance turn, with each Mission's Combat report. */
import type { CombatReport, ConsequenceRecord, TurnReport } from '../../engine/index.ts';
import type { Snapshot } from '../store.ts';
import { Badge, Section, percent, signed } from '../ui.tsx';

function consequenceText(c: ConsequenceRecord): string {
  const parts: string[] = [];
  if (c.money !== 0) {
    parts.push(`money ${signed(c.money)}`);
  }
  if (c.fundingChange !== 0) {
    parts.push(`funding ${signed(c.fundingChange)}`);
  }
  if (c.panicIncrease !== 0) {
    parts.push(`Panic +${c.panicIncrease}`);
  }
  if (c.panicReduction !== 0) {
    parts.push(`Panic −${c.panicReduction}`);
  }
  if (c.eliminatedFaction !== null) {
    parts.push(`eliminated ${c.eliminatedFaction}`);
  }
  return parts.join(', ') || 'no consequence';
}

const CONDITIONS = { ableToFight: 'able to fight', incapacitated: 'incapacitated', dead: 'dead' } as const;

function CombatDetails({ combat }: { combat: CombatReport }) {
  return (
    <details className="combat">
      <summary>
        Combat report: {combat.outcome} after {combat.rounds} {combat.rounds === 1 ? 'round' : 'rounds'}
      </summary>
      <table className="grid">
        <thead>
          <tr>
            <th>Combatant</th>
            <th className="num">Skill</th>
            <th className="num">Health</th>
            <th className="num">Exhaustion</th>
            <th className="num">Dealt</th>
            <th className="num">Taken</th>
            <th>End</th>
          </tr>
        </thead>
        <tbody>
          {combat.participants.map((who) => (
            <tr key={who.id} className={who.side === 'enemy' ? 'row-enemy' : ''}>
              <th scope="row">{who.id}</th>
              <td className="num">
                {who.start.effectiveSkill} → {who.final.effectiveSkill}
              </td>
              <td className="num">
                {who.start.currentHealth} → {who.final.currentHealth}
              </td>
              <td className="num">
                {who.start.exhaustion} → {who.final.exhaustion}
              </td>
              <td className="num">{who.damageDealt}</td>
              <td className="num">{who.damageTaken}</td>
              <td>{CONDITIONS[who.final.condition]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>Combat rating by round</summary>
        <table className="grid">
          <thead>
            <tr>
              <th className="num">Round</th>
              <th className="num">Agents</th>
              <th className="num">Enemies</th>
            </tr>
          </thead>
          <tbody>
            {combat.ratings.map((rating) => (
              <tr key={rating.round}>
                <td className="num">{rating.round === 0 ? 'start' : rating.round}</td>
                <td className="num">{rating.agents}</td>
                <td className="num">{rating.enemies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details>
        <summary>Combat log ({combat.log.length} attacks)</summary>
        <table className="grid log">
          <thead>
            <tr>
              <th className="num">Round</th>
              <th>Attacker</th>
              <th>Defender</th>
              <th className="num">Hit chance</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {combat.log.map((attack, index) => (
              <tr key={index}>
                <td className="num">{attack.round}</td>
                <td>{attack.attacker}</td>
                <td>{attack.defender}</td>
                <td className="num">
                  {percent(attack.hitProbability)} ({attack.a} vs {attack.d})
                </td>
                <td>
                  {attack.hit
                    ? `hit for ${attack.damage ?? 0}, health ${attack.defenderAfter.currentHealth}` +
                      (attack.defenderDead ? ', dead' : attack.defenderIncapacitated ? ', incapacitated' : '')
                    : 'miss'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </details>
  );
}

function Lines({ report }: { report: TurnReport }) {
  const lines: string[] = [];
  if (report.transit.arrived.length > 0) {
    lines.push(`Arrived at their assignment: ${report.transit.arrived.join(', ')}.`);
  }
  for (const training of report.training) {
    lines.push(`${training.agent} trained to skill ${training.skillAfter}.`);
  }
  for (const item of report.investigations) {
    lines.push(
      `Investigation ${item.investigation} of ${item.lead}: progress +${item.progressGain} to ${item.progressAfter}` +
        (item.completed ? `; completed and created Mission site ${item.createdMissionSite ?? ''}.` : '.'),
    );
  }
  for (const site of report.cancelledMissionSites) {
    lines.push(`Mission site ${site} was cancelled.`);
  }
  for (const site of report.expiredMissionSites) {
    lines.push(`Mission site ${site.missionSite} expired: ${consequenceText(site.consequence)}.`);
  }
  for (const activity of report.factionActivity) {
    if (activity.escalatedTo !== null) {
      lines.push(`Faction ${activity.faction} escalated to ${activity.escalatedTo}.`);
    }
    if (activity.createdMissionSite !== null) {
      lines.push(
        `Faction ${activity.faction} began an operation: Mission site ${activity.createdMissionSite}.`,
      );
    }
  }
  for (const item of report.recovery) {
    if (item.recovered) {
      lines.push(`${item.agent} recovered and returned to Standby.`);
    }
  }
  return lines.length === 0 ? (
    <p className="muted">Nothing else happened.</p>
  ) : (
    <ul className="lines">
      {lines.map((line, index) => (
        <li key={`${index}:${line}`}>{line}</li>
      ))}
    </ul>
  );
}

export function TurnReportPanel({ snapshot }: { snapshot: Snapshot }) {
  const report = snapshot.report;
  if (report === null) {
    return <p className="muted pad">No Turn report yet. Advance the turn to get the first one.</p>;
  }
  return (
    <div className="stack" data-testid="turn-report">
      <Section title={`What happened when Turn ${report.turn} ended`}>
        <table className="grid">
          <tbody>
            <tr>
              <th scope="row">Income</th>
              <td>
                +{report.income.income} (funding {report.income.funding}, {report.income.contractingAgents}{' '}
                Agents contracting)
              </td>
            </tr>
            <tr>
              <th scope="row">Upkeep</th>
              <td>
                −{report.upkeep.upkeep} ({report.upkeep.servingAgents} Agents)
              </td>
            </tr>
            <tr>
              <th scope="row">Money</th>
              <td>
                {report.money.turnEnd} → {report.money.after}
              </td>
            </tr>
            <tr>
              <th scope="row">Funding</th>
              <td>
                {report.funding.before} → {report.funding.after}
              </td>
            </tr>
            <tr>
              <th scope="row">Panic</th>
              <td>
                {report.panic.before}% → {report.panic.after}%
              </td>
            </tr>
          </tbody>
        </table>
        {report.ending === null ? null : (
          <p>
            <Badge tone={report.ending.ending === 'Victory' ? 'good' : 'bad'}>
              Campaign ending: {report.ending.ending}
            </Badge>
          </p>
        )}
      </Section>

      {report.missions.length === 0 ? null : (
        <Section title="Missions">
          {report.missions.map((mission) => {
            const combat = report.combatReports.find((item) => item.mission === mission.mission);
            return (
              <article key={mission.mission} className="card">
                <header className="card-head">
                  <h4>
                    {mission.mission} at {mission.missionSite}
                  </h4>
                  <Badge tone={mission.result === 'Won' ? 'good' : 'bad'}>{mission.result}</Badge>
                </header>
                <dl className="pairs">
                  <dt>Consequence</dt>
                  <dd>{consequenceText(mission.consequence)}</dd>
                  <dt>Killed</dt>
                  <dd>{mission.killed.join(', ') || 'nobody'}</dd>
                  <dt>To Recovery</dt>
                  <dd>{mission.toRecovery.join(', ') || 'nobody'}</dd>
                  <dt>To Standby</dt>
                  <dd>{mission.toStandby.join(', ') || 'nobody'}</dd>
                </dl>
                {combat === undefined ? null : <CombatDetails combat={combat} />}
              </article>
            );
          })}
        </Section>
      )}

      <Section title="Other events">
        <Lines report={report} />
      </Section>
    </div>
  );
}
