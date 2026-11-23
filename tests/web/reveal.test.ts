/**
 * DEV, Revealed presentation; GUI, Reveal hidden content; COMPV: the Session setting's lifecycle, and the Compendium
 * View under it.
 */
import { describe, expect, it } from 'vite-plus/test';
import { MemoryStorage } from '../../src/engine/index.ts';
import { visibleHistory, showArticle, openHistory, currentArticle } from '../../src/web/compendium.ts';
import { canReveal, revealInEffect, revealSettingAfter } from '../../src/web/reveal.ts';
import { boot, setRevealHiddenContent, snapshot, theEngine } from '../../src/web/store.ts';
import { ok } from '../helpers/engine.ts';

async function campaign(): Promise<void> {
  await boot(new MemoryStorage());
  ok(await theEngine().session.campaign.create({ seed: 'reveal' }));
}

describe('GUI: Reveal hidden content', () => {
  it('starts off, and can be checked only while Dev mode is enabled', async () => {
    await campaign();
    expect(snapshot().revealHiddenContent).toBe(false);
    setRevealHiddenContent(true);
    expect(snapshot().revealHiddenContent).toBe(false);
    expect(snapshot().revealed).toBe(false);

    ok(theEngine().session.developer.enable());
    setRevealHiddenContent(true);
    expect(snapshot().revealHiddenContent).toBe(true);
    expect(snapshot().revealed).toBe(true);
  });

  it('clears itself whenever Dev mode is disabled, including when a Campaign is created, loaded, or closed', async () => {
    await campaign();
    const engine = theEngine();
    ok(engine.session.developer.enable());
    setRevealHiddenContent(true);
    ok(engine.session.developer.disable());
    expect(snapshot().revealHiddenContent).toBe(false);
    // Enabling Dev mode again does not check it again.
    ok(engine.session.developer.enable());
    expect(snapshot().revealHiddenContent).toBe(false);

    setRevealHiddenContent(true);
    ok(await engine.session.campaign.create({ seed: 'another' }));
    expect(snapshot().status.devMode).toBe(false);
    expect(snapshot().revealHiddenContent).toBe(false);

    ok(engine.session.developer.enable());
    setRevealHiddenContent(true);
    ok(await engine.session.campaign.close());
    expect(snapshot().revealHiddenContent).toBe(false);
  });

  it('is presentation only: no Player action, no Timeline entry, no Campaign state', async () => {
    await campaign();
    const engine = theEngine();
    ok(engine.session.developer.enable());
    const timeline = ok(engine.session.timeline.getStatus());
    const state = ok(engine.developer.queries.getCampaignState());
    setRevealHiddenContent(true);
    setRevealHiddenContent(false);
    setRevealHiddenContent(true);
    expect(ok(engine.session.timeline.getStatus())).toEqual(timeline);
    expect(ok(engine.developer.queries.getCampaignState())).toEqual(state);
  });

  it('while Autopilot is engaged, the GUI presents only Player-visible information, and the checkbox is disabled', () => {
    const engaged = { devMode: true, autopilot: { engagementId: 'e' }, hasCurrentCampaign: true } as never;
    expect(canReveal(engaged)).toBe(false);
    expect(revealInEffect(true, engaged)).toBe(false);
    // Autopilot leaves the setting as it is, so revealed values return once it is disengaged.
    expect(revealSettingAfter(true, engaged)).toBe(true);
    expect(revealInEffect(true, { devMode: true, autopilot: null, hasCurrentCampaign: true })).toBe(true);
    expect(revealInEffect(true, { devMode: false, autopilot: null, hasCurrentCampaign: true })).toBe(false);
    expect(revealSettingAfter(true, { devMode: false })).toBe(false);
  });

  it('reveals the undiscovered Leads, read through developer.queries, with investigating them still impossible', async () => {
    await campaign();
    ok(theEngine().session.developer.enable());
    const shown = snapshot().retired!.leads.map((lead) => lead.id);
    setRevealHiddenContent(true);
    const revealed = snapshot().retired!.leads;
    expect(revealed.length).toBeGreaterThan(shown.length);
    const hidden = revealed.find((lead) => !shown.includes(lead.id))!;
    expect(hidden.canBeInvestigatedNow).toBe(false);
    expect(hidden.requiredProgress).not.toBe('unknown');
    expect(snapshot().actions!.startInvestigation).not.toContain(hidden.id);
  });
});

describe('COMPV: the Compendium View under Reveal hidden content', () => {
  it('shows the Revealed Compendium, and turning it off removes every article that is not Player-visible', async () => {
    await campaign();
    const engine = theEngine();
    ok(engine.session.developer.enable());
    const visible = snapshot().articles!.map((article) => article.id);
    setRevealHiddenContent(true);
    const all = snapshot().articles!;
    expect(all.length).toBeGreaterThan(visible.length);
    const hidden = all.find((article) => !visible.includes(article.id))!;
    // The Article term lookup of the Revealed Compendium finds articles that are not Player-visible.
    const terms = snapshot().revealedTerms!;
    expect(terms['raid safehouse']).toBe('raid_safehouse_article');
    expect(ok(engine.player.queries.getArticleForTerm('Raid safehouse'))).toBeNull();

    // The Player opened the hidden article while it was revealed.
    const history = showArticle(openHistory(visible[0]!), hidden.id);
    expect(currentArticle(visibleHistory(history, new Set(all.map((item) => item.id)), visible[0]!))).toBe(
      hidden.id,
    );
    setRevealHiddenContent(false);
    const after = snapshot().articles!.map((article) => article.id);
    expect(after).toEqual(visible);
    expect(snapshot().revealedTerms).toBeNull();
    // COMPV, Following links, No longer Player-visible: the article leaves the Article history.
    const pruned = visibleHistory(history, new Set(after), after[0]!);
    expect(pruned.articles).not.toContain(hidden.id);
  });
});
