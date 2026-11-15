/** The Agency panel: money and caps, Upgrades, Factions, and the game data the player may know. */
import type { CurrentStateView } from '../../engine/index.ts';
import { act, theEngine, type Snapshot } from '../store.ts';
import { Badge, Button, Fact, Section } from '../ui.tsx';

const EFFECTS: Record<string, string> = {
  agent_cap: 'Agent cap',
  transport_cap: 'Transport cap',
  training_cap: 'Training cap',
};

export function AgencyPanel(props: { snapshot: Snapshot; state: CurrentStateView; locked: string | null }) {
  const { player } = theEngine();
  const { state, locked } = props;
  const agency = state.agency;
  const purchases = props.snapshot.actions?.purchaseUpgrade ?? [];
  const gameData = props.snapshot.gameData;

  return (
    <div className="stack">
      <Section title={agency.name}>
        <div className="facts">
          <Fact label="Money">{agency.money}</Fact>
          <Fact label="Funding">{agency.funding}</Fact>
          <Fact label="Projected income">+{agency.projectedIncome}</Fact>
          <Fact label="Projected upkeep">−{agency.projectedUpkeep}</Fact>
          <Fact label="Agents / Agent cap">
            {agency.servingAgents} / {agency.agentCap}
          </Fact>
          <Fact label="Deployed / Transport cap">
            {agency.deployedAgents} / {agency.transportCap}
          </Fact>
          <Fact label="Training / Training cap">
            {agency.trainingAgents} / {agency.trainingCap}
          </Fact>
          <Fact label="Hire cost">{agency.hireCost}</Fact>
        </div>
      </Section>

      <Section title="Upgrades">
        <table className="grid" data-testid="upgrades">
          <thead>
            <tr>
              <th>Upgrade</th>
              <th>Each purchase</th>
              <th className="num">Bought</th>
              <th className="num">Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {agency.upgrades.map((upgrade) => {
              const purchase = purchases.find((item) => item.upgrade === upgrade.id);
              return (
                <tr key={upgrade.id}>
                  <th scope="row">{upgrade.name}</th>
                  <td>
                    +{upgrade.increment} {EFFECTS[upgrade.effect] ?? upgrade.effect.replaceAll('_', ' ')}
                  </td>
                  <td className="num">{upgrade.acquisitions}</td>
                  <td className="num">{upgrade.price}</td>
                  <td>
                    <Button
                      testId={`buy-${upgrade.id}`}
                      disabledReason={
                        locked ??
                        (purchase?.available === true ? null : (purchase?.message ?? 'Unavailable.'))
                      }
                      onClick={() => {
                        act(() => player.actions.purchaseUpgrade(upgrade.id));
                      }}
                    >
                      Buy
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Factions">
        <table className="grid">
          <thead>
            <tr>
              <th>Faction</th>
              <th>Activity level</th>
              <th>Lasts (turns)</th>
              <th>Operation every (turns)</th>
              <th>Then</th>
            </tr>
          </thead>
          <tbody>
            {state.factions.map((faction) => (
              <tr key={faction.id}>
                <th scope="row">{faction.name}</th>
                <td>
                  {faction.defeated ? (
                    <Badge tone="good">Defeated in Turn {faction.defeatedTurn}</Badge>
                  ) : (
                    faction.activityLevel.name
                  )}
                </td>
                <td>
                  {faction.activityLevel.lastsTurns === null
                    ? 'until defeated'
                    : faction.activityLevel.lastsTurns.join(' to ')}
                </td>
                <td>{faction.activityLevel.operationEveryTurns.join(' to ')}</td>
                <td>{faction.activityLevel.next ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {gameData === null ? null : (
        <Section title="Field manual">
          <details>
            <summary>Enemies and weapons</summary>
            <table className="grid">
              <thead>
                <tr>
                  <th>Enemy</th>
                  <th className="num">Skill</th>
                  <th className="num">Health</th>
                  <th>Weapon</th>
                </tr>
              </thead>
              <tbody>
                {gameData.enemyArchetypes.map((enemy) => {
                  const weapon = gameData.weapons.find((item) => item.id === enemy.weapon);
                  return (
                    <tr key={enemy.id}>
                      <th scope="row">{enemy.name}</th>
                      <td className="num">{enemy.skill}</td>
                      <td className="num">{enemy.baseHealth}</td>
                      <td>
                        {weapon?.name ?? enemy.weapon} (damage {weapon?.damage ?? '-'})
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Mission site kinds</summary>
            <table className="grid">
              <thead>
                <tr>
                  <th>Mission site</th>
                  <th>Kind</th>
                  <th className="num">Expires in</th>
                  <th className="num">Enemies rating</th>
                </tr>
              </thead>
              <tbody>
                {gameData.missionSiteArchetypes.map((site) => (
                  <tr key={site.id}>
                    <th scope="row">{site.name}</th>
                    <td>{site.kind}</td>
                    <td className="num">{site.expiresInTurns}</td>
                    <td className="num">{site.enemiesCombatRating}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Faction operation levels</summary>
            <table className="grid">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>If won</th>
                  <th>If ignored or lost</th>
                </tr>
              </thead>
              <tbody>
                {gameData.factionOperationLevels.map((level) => (
                  <tr key={level.id}>
                    <th scope="row">
                      {level.level}. {level.name}
                    </th>
                    <td>
                      money +{level.onWin.money}, funding +{level.onWin.funding}
                    </td>
                    <td>
                      Panic +{level.onIgnoredOrLost.panicIncreasePct}, funding {level.onIgnoredOrLost.funding}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <details>
            <summary>Rules in numbers</summary>
            <dl className="pairs">
              {[
                gameData.economy,
                gameData.agentParameters,
                gameData.recoveryParameters,
                gameData.combatParameters,
              ].flatMap((group) =>
                Object.entries(group).map(([key, value]) => (
                  <div key={key} className="pair">
                    <dt>{key.replaceAll('_', ' ')}</dt>
                    <dd>{value}</dd>
                  </div>
                )),
              )}
            </dl>
          </details>
        </Section>
      )}
    </div>
  );
}
