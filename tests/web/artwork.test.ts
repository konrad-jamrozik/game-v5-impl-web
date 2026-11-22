/** VIS, Background artwork and Artwork tuning; PLACE, Artwork in an Implementation. */
import { describe, expect, it } from 'vite-plus/test';
import { gameDataView } from '../../src/engine/views/views.ts';
import { buildGdrCatalog } from '../../src/gdr/catalog.ts';
import { RAW_GDR_FILES } from '../../src/gdr/generated/raw-gdrs.ts';
import { detailViewName, fileName } from '../../src/web/artwork-names.ts';
import { gdrs } from '../helpers/game.ts';

const artworkFile = (gdrsOfFile: unknown[]) => [
  ...RAW_GDR_FILES.filter((file) => file.path !== 'visual-design/background_artworks.yaml'),
  { path: 'visual-design/background_artworks.yaml', gdrs: gdrsOfFile },
];
const artwork = (detailView: string, opacity = 12) => ({
  id: `${detailView}_artwork`,
  type: 'BackgroundArtwork',
  detail_view: detailView,
  image: 'assets/images/chatgpt-agents-i2.png',
  opacity_pct: opacity,
});

describe('VIS: Background artwork', () => {
  it('comes from the BackgroundArtwork GDRs, with the image path and opacity of each', () => {
    // Fixture values: one BackgroundArtwork GDR for each of two Detail views, in their authored order.
    const fixture = [artwork('leads', 25), { ...artwork('missions', 40), image: 'assets/images/x.jpg' }];
    expect(gameDataView(buildGdrCatalog(artworkFile(fixture))).backgroundArtworks).toEqual([
      {
        id: 'leads_artwork',
        detailView: 'leads',
        image: 'assets/images/chatgpt-agents-i2.png',
        opacityPct: 25,
      },
      { id: 'missions_artwork', detailView: 'missions', image: 'assets/images/x.jpg', opacityPct: 40 },
    ]);
    // The Game build shows each BackgroundArtwork GDR it holds.
    const authored = RAW_GDR_FILES.flatMap((file) => file.gdrs as readonly Record<string, unknown>[]).filter(
      (gdr) => gdr['type'] === 'BackgroundArtwork',
    );
    expect(gameDataView(gdrs).backgroundArtworks).toEqual(
      authored.map((gdr) => ({
        id: gdr['id'],
        detailView: gdr['detail_view'],
        image: gdr['image'],
        opacityPct: gdr['opacity_pct'],
      })),
    );
  });

  it('rejects a GDR that names no Detail view, a second GDR for one Detail view, or an opacity beyond 100', () => {
    expect(() => buildGdrCatalog(artworkFile([artwork('globe')]))).toThrow(/is not a Detail view/);
    expect(() =>
      buildGdrCatalog(artworkFile([artwork('agents'), { ...artwork('agents'), id: 'other' }])),
    ).toThrow(/a second BackgroundArtwork/);
    expect(() => buildGdrCatalog(artworkFile([artwork('agents', 101)]))).toThrow(/opacity_pct/);
    expect(() =>
      buildGdrCatalog(artworkFile([{ ...artwork('agents'), alternative_images: ['assets/images/x.png'] }])),
    ).toThrow(/alternative_images/);
  });

  it('names Detail views and images as the GDRs and Artwork tuning do', () => {
    expect(detailViewName('report')).toBe('turn_report');
    expect(detailViewName('missions')).toBe('missions');
    expect(fileName('assets/images/v03ai-nano21-command-center.jpg')).toBe('v03ai-nano21-command-center.jpg');
  });
});
