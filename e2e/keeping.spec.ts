/**
 * Browser tests of what the game keeps so that it need not load it again: the files of the Game build, which the
 * service worker keeps across reloads of the page (src/web/service-worker.ts), and the globe, which the Session keeps
 * across visits to the Main menu (GLOBE, Shown only when seen).
 */
import { expect, test, type Page } from '@playwright/test';

const id = (page: Page, testId: string) => page.getByTestId(testId);

/** Opens the page and waits until the service worker controls it, which takes one reload after its installation. */
async function controlledPage(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
}

/** The paths of the build's files that the service worker keeps, as the build wrote them into it. */
async function buildFiles(page: Page): Promise<string[]> {
  const worker = await page.request.get('/sw.js');
  return [...(await worker.text()).matchAll(/"(assets\/[^"]+)"/g)].map((match) => match[1] ?? '');
}

test('the globe is kept, not built again, when the Player goes to the Main menu and back', async ({
  page,
}) => {
  await page.goto('/');
  await id(page, 'seed-input').fill('globe');
  await id(page, 'new-campaign').click();
  await expect(id(page, 'turn')).toHaveText('1');
  await id(page, 'special-event-continue').click();
  await expect(page.locator('.globe')).toHaveCount(1);
  await page.locator('.globe').evaluate((globe) => {
    globe.setAttribute('data-kept', 'yes');
  });

  await id(page, 'to-menu').click();
  await expect(id(page, 'menu-close')).toBeVisible();
  await expect(page.locator('.globe')).toHaveCount(0);
  await id(page, 'menu-close').click();

  await expect(id(page, 'turn')).toHaveText('1');
  await expect(page.locator('.globe')).toHaveCount(1);
  await expect(page.locator('.globe')).toHaveAttribute('data-kept', 'yes');
  await expect(id(page, 'globe').locator('.globe')).toHaveCount(1);
  // TSUM, Special events: the welcome is not shown again for that Campaign.
  await expect(id(page, 'special-event')).toHaveCount(0);
});

test('a reload takes the files of the Game build from the service worker', async ({ page }) => {
  await controlledPage(page);
  const files = await buildFiles(page);
  const entry = files.find((file) => /^assets\/index-.*\.js$/.test(file));
  expect(entry).toBeDefined();

  const reloaded = page.waitForResponse((response) => response.url().endsWith(entry ?? ''));
  await page.reload();
  expect((await reloaded).fromServiceWorker()).toBe(true);
  const cached = await page.evaluate(async (path) => {
    const names = await caches.keys();
    const found = await caches.match(new URL(path, location.href).href);
    return { names, found: found !== undefined };
  }, entry ?? '');
  expect(cached.found).toBe(true);
  expect(cached.names.every((name) => name.startsWith('game-v5-impl-web-'))).toBe(true);
});

test('music asked for in parts is kept whole and answered in parts from the cache', async ({ page }) => {
  await controlledPage(page);
  const track = (await buildFiles(page)).find((file) => /\.(opus|mp3)$/.test(file));
  expect(track).toBeDefined();
  const address = await page.evaluate((path) => new URL(path, location.href).href, track ?? '');

  // The first part comes from the network and sends the whole file to the cache behind it.
  const first = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=0-99' } });
    return response.status;
  }, address);
  expect(first).toBe(206);
  await expect
    .poll(() => page.evaluate(async (url) => (await caches.match(url)) !== undefined, address))
    .toBe(true);

  const part = await page.evaluate(async (url) => {
    const response = await fetch(url, { headers: { Range: 'bytes=100-199' } });
    const whole = await (await caches.match(url))?.arrayBuffer();
    const bytes = [...new Uint8Array(await response.arrayBuffer())];
    const expected = whole === undefined ? [] : [...new Uint8Array(whole.slice(100, 200))];
    return {
      status: response.status,
      range: response.headers.get('Content-Range'),
      size: whole?.byteLength ?? 0,
      same: bytes.length === 100 && bytes.every((byte, index) => byte === expected[index]),
    };
  }, address);
  expect(part.status).toBe(206);
  expect(part.range).toBe(`bytes 100-199/${part.size}`);
  expect(part.same).toBe(true);
});
