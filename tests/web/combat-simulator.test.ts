/**
 * CSIM: the teams of the Combat simulator and the Detached Combat it has fought; COMBAT, Detached Combat without a
 * Current campaign: `session.combatSimulator`; COMBAT, DetachedCombatTeam.
 */
import { describe, expect, it } from 'vite-plus/test';
import type { CombatSimulatorContent } from '../../src/engine/index.ts';
import { buildReplay } from '../../src/web/combat-replay.ts';
import {
  FIRST_SEED,
  agentRowsOfTeam,
  enemyRow,
  enemyRowsOfSite,
  newAgentRow,
  replaySourceOf,
  reportOf,
  seedFrom,
  defaultSetup,
  encodeSetup,
  setupOf,
  storedSetup,
  withArmor,
  withWeapon,
} from '../../src/web/combat-simulator.ts';
import { SETTINGS } from '../../src/engine/session/global-configuration.ts';

describe('CSIM: Teams, the Combat simulator setup', () => {
  it('opens with the Game build default when nothing is stored', async () => {
    const built = await content();
    const setup = storedSetup(built, '');
    expect(setup.team).toBe(built.teams[0]?.id);
    expect(setup.site).toBe(built.missionSiteArchetypes[0]?.id);
    expect(setup.seed).toBe(FIRST_SEED);
    expect(setup.agents).toEqual(agentRowsOfTeam(built, setup.team));
  });

  it('opens with the stored setup as it was left', async () => {
    const built = await content();
    const start = defaultSetup(built);
    const left = {
      ...start,
      enemies: [enemyRow(built, built.enemyArchetypes[1]!.id)],
      seed: 'sim-abc123',
    };
    const encoded = encodeSetup(left);
    expect(SETTINGS.find((item) => item.setting === 'combatSimulatorSetup')!.isPermitted(encoded)).toBe(true);
    expect(storedSetup(built, encoded)).toEqual(left);
  });

  it('gives way to the Game build default when a row names what the Game build no longer has', async () => {
    const built = await content();
    const start = defaultSetup(built);
    const gone = { ...start, agents: [{ ...newAgentRow(built), weapon: 'no-such-weapon' }] };
    expect(storedSetup(built, encodeSetup(gone))).toEqual(start);
    expect(storedSetup(built, '{not json')).toEqual(start);
  });
});
import { errorCode, ok, startEngine } from '../helpers/engine.ts';

async function content(): Promise<CombatSimulatorContent> {
  const { engine } = await startEngine();
  return ok(engine.session.combatSimulator.getContent());
}

describe('COMBAT: Detached Combat without a Current campaign', () => {
  it('returns what a setup is built from, with no Current campaign and Dev mode disabled', async () => {
    const { engine } = await startEngine();
    expect(ok(engine.session.getStatus()).hasCurrentCampaign).toBe(false);
    const got = ok(engine.session.combatSimulator.getContent());
    expect(got.weapons.map((weapon) => weapon.id)).toContain('laser_rifle');
    expect(got.armors.map((armor) => armor.id)).toContain('battle_suit');
    expect(got.weapons.find((weapon) => weapon.id === 'laser_rifle')?.shot).toBe('laser_rifle');
    expect(got.weapons.find((weapon) => weapon.id === 'knife')?.shot).toBe('blade');
    expect(got.enemyArchetypes[0]?.id).toBe('initiate');
    expect(got.agentArchetype.weapon).toBe('combat_pistol');
    // MISSION, Enemy creation: the Enemies of a new Mission site, in their creation order.
    expect(got.missionSiteArchetypes[0]).toEqual({
      id: 'apprehend_member',
      name: 'Apprehend member',
      enemies: ['initiate', 'initiate', 'operative'],
    });
  });

  it('holds the DetachedCombatTeams in their authored order, each naming a Weapon and an Armor', async () => {
    const got = await content();
    expect(got.teams.length).toBeGreaterThanOrEqual(1);
    expect(got.teams[0]?.id).toBe('level_1_team');
    for (const team of got.teams) {
      for (const group of team.agents) {
        expect(group.count).toBeGreaterThanOrEqual(1);
        expect(got.weapons.some((weapon) => weapon.id === group.weapon)).toBe(true);
        expect(got.armors.some((armor) => armor.id === group.armor)).toBe(true);
      }
    }
  });

  it('fights the Detached Combat that developer.tools.fightCombat fights on the same setup', async () => {
    const { engine } = await startEngine();
    const setup = {
      agents: [
        {
          kind: 'explicit' as const,
          baseSkill: 150,
          currentHealth: 30,
          effectiveMaxHealth: 30,
          exhaustion: 0,
          effectiveWeaponDamage: 14,
          effectiveArmor: 20,
        },
      ],
      enemies: { missionSiteArchetype: 'apprehend_member' },
      seed: 'agreement',
    };
    const without = ok(engine.session.combatSimulator.fightCombat(setup));
    ok(await engine.session.campaign.create({ seed: 'any' }));
    ok(engine.session.developer.enable());
    expect(ok(engine.developer.tools.fightCombat(setup))).toEqual(without);
    // It stays available with a Current campaign, and reads none.
    expect(ok(engine.session.combatSimulator.fightCombat(setup))).toEqual(without);
  });

  it('rates both sides of a setup at Combat start without fighting it', async () => {
    const { engine } = await startEngine();
    const agent = (baseSkill: number, currentHealth: number) => ({
      kind: 'explicit' as const,
      baseSkill,
      currentHealth,
      effectiveMaxHealth: 30,
      exhaustion: 0,
      effectiveWeaponDamage: 10,
      effectiveArmor: 20,
    });
    const setup = {
      agents: [agent(100, 30), agent(200, 30), agent(100, 0)],
      enemies: { missionSiteArchetype: 'apprehend_member' },
      seed: 'ratings',
    };
    const ratings = ok(engine.session.combatSimulator.rateSides(setup));
    // The Combat report holds the same Combat ratings as of Combat round 0.
    const { combatReport } = ok(engine.session.combatSimulator.fightCombat(setup));
    expect(combatReport.ratings[0]).toEqual({ round: 0, ...ratings });
    expect(ratings.agents).toBeGreaterThan(0);
    expect(ratings.enemies).toBeGreaterThan(0);
    expect(errorCode(engine.session.combatSimulator.rateSides({ agents: [], enemies: [], seed: 's' }))).toBe(
      'rejected',
    );
  });

  it('rejects an entry that names an Agent or an Enemy by Instance ID', async () => {
    const { engine } = await startEngine();
    const one = {
      kind: 'explicit' as const,
      baseSkill: 100,
      currentHealth: 30,
      effectiveMaxHealth: 30,
      exhaustion: 0,
      effectiveWeaponDamage: 10,
    };
    const fight = (setup: Parameters<typeof engine.session.combatSimulator.fightCombat>[0]) =>
      engine.session.combatSimulator.fightCombat(setup);
    expect(errorCode(fight({ agents: [{ kind: 'agent', id: 'agent-1' }], enemies: [], seed: 's' }))).toBe(
      'rejected',
    );
    expect(errorCode(fight({ agents: [one], enemies: [{ kind: 'enemy', id: 'enemy-1' }], seed: 's' }))).toBe(
      'rejected',
    );
    expect(errorCode(fight({ agents: [], enemies: [], seed: 's' }))).toBe('rejected');
  });

  it('records the Combat rating of each participant at Combat start in the Combat report', async () => {
    const { engine } = await startEngine();
    const agent = (baseSkill: number, currentHealth: number) => ({
      kind: 'explicit' as const,
      baseSkill,
      currentHealth,
      effectiveMaxHealth: 30,
      exhaustion: 0,
      effectiveWeaponDamage: 10,
      effectiveArmor: 20,
    });
    const { combatReport } = ok(
      engine.session.combatSimulator.fightCombat({
        agents: [agent(100, 30), agent(200, 30), agent(100, 0)],
        enemies: [],
        seed: 'ratings',
      }),
    );
    // Effective skill × rating factor, which is (10/10 + 30/30 + 20/20) / 2 here; a dead Combatant rates 0.
    expect(combatReport.participants.map((who) => who.start.combatRating)).toEqual([150, 300, 0]);
  });
});

describe('CSIM: Teams', () => {
  it("fills the Agents' side from a DetachedCombatTeam, each Agent at full current health", async () => {
    const got = await content();
    const team = got.teams.find((item) => item.agents.length > 1) ?? got.teams[0];
    const rows = agentRowsOfTeam(got, team?.id ?? '');
    expect(rows).toHaveLength((team?.agents ?? []).reduce((sum, group) => sum + group.count, 0));
    const group = team?.agents[0];
    expect(rows[0]).toEqual({
      weapon: group?.weapon,
      armorItem: group?.armor,
      values: {
        baseSkill: String(group?.baseSkill),
        currentHealth: String(group?.maxHealth),
        maxHealth: String(group?.maxHealth),
        exhaustion: String(group?.exhaustion),
        weaponDamage: String(got.weapons.find((weapon) => weapon.id === group?.weapon)?.damage),
        armor: String(got.armors.find((armor) => armor.id === group?.armor)?.armor),
      },
    });
  });

  it("fills the Enemies' side with the Enemies a new Mission site would have, as newly created", async () => {
    const got = await content();
    const rows = enemyRowsOfSite(got, 'apprehend_member');
    expect(rows.map((row) => row.archetype)).toEqual(['initiate', 'initiate', 'operative']);
    expect(rows[2]?.values).toEqual({
      baseSkill: '60',
      currentHealth: '25',
      maxHealth: '25',
      exhaustion: '0',
      weaponDamage: '10',
      armor: '0',
    });
  });

  it('sets the weapon damage from a selected Weapon and the armor from a selected Armor, keeping the rest', async () => {
    const got = await content();
    const edited = { ...newAgentRow(got), values: { ...newAgentRow(got).values, baseSkill: '321' } };
    const armed = withArmor(got, withWeapon(got, edited, 'laser_rifle'), 'battle_suit');
    expect(armed.weapon).toBe('laser_rifle');
    expect(armed.armorItem).toBe('battle_suit');
    expect(armed.values).toEqual({ ...edited.values, weaponDamage: '28', armor: '50' });
    // An Agent as newly hired.
    expect(newAgentRow(got).values.baseSkill).toBe(String(got.agentArchetype.skill));
  });
});

describe('CSIM: Fighting the Combat', () => {
  it('gives each row as an explicit entry, and a field that holds no number as one the engine rejects', async () => {
    const got = await content();
    const { engine } = await startEngine();
    const agents = agentRowsOfTeam(got, 'level_1_team');
    const enemies = enemyRowsOfSite(got, 'apprehend_member');
    const setup = setupOf(agents, enemies, FIRST_SEED);
    expect(setup.agents).toHaveLength(agents.length);
    expect(setup.agents[0]).toEqual({
      kind: 'explicit',
      baseSkill: 100,
      currentHealth: 30,
      effectiveMaxHealth: 30,
      exhaustion: 0,
      effectiveWeaponDamage: 10,
      effectiveArmor: 0,
    });
    expect(setup.gdrValues).toBeUndefined();
    expect(setup.ammo).toBeUndefined();
    const result = ok(engine.session.combatSimulator.fightCombat(setup));
    expect(result.combatReport.agents).toHaveLength(agents.length);
    expect(result.combatReport.enemies).toHaveLength(enemies.length);

    const blank = [
      { ...enemyRow(got, 'initiate'), values: { ...enemyRow(got, 'initiate').values, armor: '' } },
    ];
    expect(errorCode(engine.session.combatSimulator.fightCombat(setupOf(agents, blank, FIRST_SEED)))).toBe(
      'rejected',
    );
  });

  it("draws an Agent by its row's Weapon and an Enemy by its row's EnemyArchetype", async () => {
    const got = await content();
    const { engine } = await startEngine();
    const agents = [
      withWeapon(got, newAgentRow(got), 'laser_rifle'),
      withWeapon(got, newAgentRow(got), 'machine_gun'),
      withWeapon(got, newAgentRow(got), 'knife'),
    ];
    const enemies = [enemyRow(got, 'soldier'), enemyRow(got, 'initiate'), enemyRow(got, 'soldier')];
    const source = replaySourceOf(got, agents, enemies, 'looks');
    expect(source.nameOf('agent#2')).toBe('agent-2');
    expect(source.nameOf('enemy#3')).toBe('sold-2');
    expect(source.enemyOrder('enemy#2')).toBe(0);
    expect(source.enemyOrder('enemy#1')).toBe(got.enemyArchetypes.findIndex((item) => item.id === 'soldier'));

    const fought = ok(engine.session.combatSimulator.fightCombat(setupOf(agents, enemies, 'looks')));
    const replay = buildReplay(reportOf(fought.combatReport), source);
    const shotsOf = (name: string) =>
      new Set(
        replay.attacks
          .filter((attack) => replay.figures[attack.attacker]?.name === name)
          .map((attack) => attack.shot),
      );
    // An Agent of explicit values spends no round, so its shot follows the Weapon of its row.
    expect([...shotsOf('agent-1')]).toEqual(['laser_rifle']);
    expect([...shotsOf('agent-2')]).toEqual(['machine_gun']);
    expect([...shotsOf('agent-3')]).toEqual(['blade']);
    // An Enemy of an EnemyArchetype carries its Weapon, which the Combat report holds.
    expect([...shotsOf('sold-1')]).toEqual(['rifle']);
  });

  it('makes a seed the engine takes from any chance', async () => {
    const { engine } = await startEngine();
    const got = await content();
    for (const chance of [0, 0.5, 0.999999]) {
      const seed = seedFrom(chance);
      expect(seed).toMatch(/^sim-[0-9a-z]{6}$/);
      ok(
        engine.session.combatSimulator.fightCombat(
          setupOf([newAgentRow(got)], [enemyRow(got, 'initiate')], seed),
        ),
      );
    }
  });
});
