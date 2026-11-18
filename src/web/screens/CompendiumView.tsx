/**
 * COMPV: the Compendium View. Three panes narrow the Player-visible Encyclopedia articles from a category to one
 * article, and a search field filters them by title. The engine returns only the Player-visible articles (COMP).
 */
import { useState } from 'react';
import type { CurrentStateView, EncyclopediaArticleView, GameDataView } from '../../engine/index.ts';
import { rangeText } from '../situation.ts';
import type { Snapshot } from '../store.ts';
import { Grid } from '../ui.tsx';
import { DetailView } from './DetailView.tsx';

const GUIDE = 'Guide';

/** COMPV, Panes: each category is named after the Type of its articles' subjects, in plain words. */
const CATEGORY_NAMES: Record<string, string> = {
  AgentArchetype: 'Agents',
  EnemyArchetype: 'Enemies',
  Weapon: 'Weapons',
  Upgrade: 'Upgrades',
  FactionArchetype: 'Factions',
  Lead: 'Leads',
  MissionSiteArchetype: 'Mission sites',
};

export function categoryOf(article: EncyclopediaArticleView): string {
  if (article.subjectType === null) {
    return GUIDE;
  }
  return CATEGORY_NAMES[article.subjectType] ?? article.subjectType;
}

/** COMPV, Panes: the subject's Player-visible properties, as rows of property and value. */
function subjectProperties(
  article: EncyclopediaArticleView,
  gameData: GameDataView | null,
  state: CurrentStateView,
): [string, string][] {
  const subject = article.subject;
  if (subject === null) {
    return [];
  }
  const weaponName = (id: string) => {
    const weapon = gameData?.weapons.find((item) => item.id === id);
    return weapon === undefined ? id : `${weapon.name} (damage ${weapon.damage})`;
  };
  switch (article.subjectType) {
    case 'AgentArchetype': {
      const agent = gameData?.agentArchetype;
      return agent === undefined || agent.id !== subject
        ? []
        : [
            ['Base skill', String(agent.skill)],
            ['Base health', String(agent.baseHealth)],
            ['Weapon', weaponName(agent.weapon)],
          ];
    }
    case 'EnemyArchetype': {
      const enemy = gameData?.enemyArchetypes.find((item) => item.id === subject);
      return enemy === undefined
        ? []
        : [
            ['Base skill', String(enemy.skill)],
            ['Base health', String(enemy.baseHealth)],
            ['Weapon', weaponName(enemy.weapon)],
          ];
    }
    case 'Weapon': {
      const weapon = gameData?.weapons.find((item) => item.id === subject);
      return weapon === undefined ? [] : [['Damage', String(weapon.damage)]];
    }
    case 'Upgrade': {
      const upgrade = state.agency.upgrades.find((item) => item.id === subject);
      return upgrade === undefined
        ? []
        : [
            ['Price', String(upgrade.price)],
            ['Each purchase', `+${upgrade.increment} ${upgrade.effect.replaceAll('_', ' ')}`],
            ['Bought', `${upgrade.acquisitions}×`],
          ];
    }
    case 'FactionArchetype': {
      const faction = state.factions.find((item) => item.archetype === subject);
      return faction === undefined
        ? []
        : [
            ['Activity level', faction.eliminated ? 'Eliminated' : faction.activityLevel.name],
            ['Operation every', `${faction.activityLevel.operationEveryTurns.join('–')} Turns`],
          ];
    }
    case 'Lead': {
      const lead = state.leads.find((item) => item.id === subject);
      const site = gameData?.missionSiteArchetypes.find((item) => item.id === lead?.createsMissionSite);
      return lead === undefined
        ? []
        : [
            ['Status', lead.status],
            ['Required progress', rangeText(lead) ?? 'unknown'],
            ['Completion creates', site?.name ?? lead.createsMissionSite],
          ];
    }
    case 'MissionSiteArchetype': {
      const site = gameData?.missionSiteArchetypes.find((item) => item.id === subject);
      if (site === undefined) {
        return [];
      }
      const enemies = site.enemies
        .map((item) => {
          const name = gameData?.enemyArchetypes.find((enemy) => enemy.id === item.enemyArchetype)?.name;
          return `${item.count} × ${name ?? item.enemyArchetype}`;
        })
        .join(', ');
      return [
        ['Kind', site.kind],
        ['Expires in', `${site.expiresInTurns} Turns`],
        ['Enemies', enemies],
        ['Combat rating', String(site.enemiesCombatRating)],
      ];
    }
    default:
      return [];
  }
}

export function CompendiumView(props: { snapshot: Snapshot; state: CurrentStateView; onClose: () => void }) {
  const { snapshot, state } = props;
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(GUIDE);
  const [picked, setPicked] = useState<string | null>(null);

  const text = search.trim().toLowerCase();
  const articles = (snapshot.articles ?? []).filter(
    (article) => text === '' || article.title.toLowerCase().includes(text),
  );
  const counts = new Map<string, number>();
  for (const article of articles) {
    counts.set(categoryOf(article), (counts.get(categoryOf(article)) ?? 0) + 1);
  }
  const categories = [...counts.keys()].sort((a, b) =>
    a === GUIDE ? -1 : b === GUIDE ? 1 : a.localeCompare(b),
  );
  const shownCategory = counts.has(category) ? category : (categories[0] ?? GUIDE);
  const listed = articles
    .filter((article) => categoryOf(article) === shownCategory)
    .sort((a, b) => a.title.localeCompare(b.title));
  const article = listed.find((item) => item.id === picked) ?? listed[0] ?? null;
  const properties = article === null ? [] : subjectProperties(article, snapshot.gameData, state);

  return (
    <DetailView
      id="compendium"
      title="Compendium"
      actions={
        <input
          type="search"
          className="search"
          placeholder="Search titles"
          aria-label="Search the Compendium"
          data-testid="compendium-search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      }
      onClose={props.onClose}
    >
      <div className="panes panes-compendium">
        <div className="pane pane-list" data-testid="compendium-categories">
          {categories.length === 0 ? <p className="muted">No article matches.</p> : null}
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={`list-row${name === shownCategory ? ' list-row-on' : ''}`}
              data-testid={`compendium-category-${name}`}
              data-sound="main"
              onClick={() => {
                setCategory(name);
                setPicked(null);
              }}
            >
              <span className="list-name">{name}</span>
              <span className="list-value figure tone-accent">{counts.get(name)}</span>
            </button>
          ))}
        </div>
        <div className="pane pane-list" data-testid="compendium-articles">
          {listed.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`list-row${item.id === article?.id ? ' list-row-on' : ''}`}
              data-testid={`article-${item.id}`}
              data-sound="main"
              onClick={() => {
                setPicked(item.id);
              }}
            >
              <span className="list-name">{item.title}</span>
            </button>
          ))}
        </div>
        <article className="pane pane-article" data-testid="compendium-article">
          {article === null ? null : (
            <>
              <h4 className="pane-title">{article.title}</h4>
              {article.body.split(/\n\s*\n/).map((paragraph, index) => (
                <p key={index} className="article-body">
                  {paragraph}
                </p>
              ))}
              {properties.length === 0 ? null : (
                <Grid widths={['200px', '280px']} className="compact">
                  <tbody>
                    {properties.map(([name, value]) => (
                      <tr key={name}>
                        <th scope="row">{name}</th>
                        <td className="figure">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </Grid>
              )}
            </>
          )}
        </article>
      </div>
    </DetailView>
  );
}
