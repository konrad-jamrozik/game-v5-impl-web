/** TSUM, Special events. */
import { describe, expect, it } from 'vite-plus/test';
import { gameDataView } from '../../src/engine/views/views.ts';
import { buildGdrCatalog } from '../../src/gdr/catalog.ts';
import { RAW_GDR_FILES } from '../../src/gdr/generated/raw-gdrs.ts';
import {
  clearCampaignStart,
  emphasized,
  noteCampaignCreation,
  pendingCampaignStart,
} from '../../src/web/special-events.ts';
import { gdrs } from '../helpers/game.ts';

const FILE = 'turn-summary/special_events.yaml';
const eventsFile = (gdrsOfFile: unknown[]) => [
  ...RAW_GDR_FILES.filter((file) => file.path !== FILE),
  { path: FILE, gdrs: gdrsOfFile },
];
const special = (id: string) => ({
  id,
  type: 'SpecialEvent',
  trigger: 'campaign_start',
  title: 'A title',
  text: 'A text.',
});

describe('TSUM: Special events', () => {
  it('come from the SpecialEvent GDRs, and no two share a trigger', () => {
    expect(gameDataView(buildGdrCatalog(eventsFile([special('first')]))).specialEvents).toEqual([
      { id: 'first', trigger: 'campaign_start', title: 'A title', text: 'A text.' },
    ]);
    expect(() => buildGdrCatalog(eventsFile([special('first'), special('second')]))).toThrow(
      /a second SpecialEvent has trigger campaign_start/,
    );
    expect(() => buildGdrCatalog(eventsFile([{ ...special('first'), trigger: 'turn_150' }]))).toThrow();
  });

  it('the Game build welcomes a new Campaign with a Situation Report, the name of Continuity drawn in Special', () => {
    const welcome = gameDataView(gdrs).specialEvents.find((event) => event.trigger === 'campaign_start');
    expect(welcome?.title).toBe('Situation Report');
    expect(welcome?.text).toMatch(/^The year is 2030\. .* known as \*\*Continuity\*\*\. /);
  });

  it('draws each phrase between double asterisks in Special, without the asterisks', () => {
    expect(emphasized('known as **Continuity**. Go')).toEqual([
      { text: 'known as ', emphasis: false },
      { text: 'Continuity', emphasis: true },
      { text: '. Go', emphasis: false },
    ]);
    expect(emphasized('**A** and **B**')).toEqual([
      { text: 'A', emphasis: true },
      { text: ' and ', emphasis: false },
      { text: 'B', emphasis: true },
    ]);
    // An unpaired `**` stays as it is written.
    expect(emphasized('plain ** text')).toEqual([{ text: 'plain ** text', emphasis: false }]);
  });

  it('shows the Special event of campaign_start only for a Campaign just created, and only once', () => {
    const data = gameDataView(gdrs);
    expect(pendingCampaignStart(data)).toBeNull();
    noteCampaignCreation();
    expect(pendingCampaignStart(data)?.trigger).toBe('campaign_start');
    // Reading it twice, as a render called twice does, reads the same.
    expect(pendingCampaignStart(data)?.trigger).toBe('campaign_start');
    clearCampaignStart();
    expect(pendingCampaignStart(data)).toBeNull();
    // A creation that fails shows nothing, so a Campaign loaded later is not welcomed.
    noteCampaignCreation().failed();
    expect(pendingCampaignStart(data)).toBeNull();
  });
});
