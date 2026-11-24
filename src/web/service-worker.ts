/**
 * The service worker of the Game build: it keeps the files of the build in the browser's Cache Storage, so that a
 * reload of the page shows the artwork and plays the music and Sounds at once instead of downloading them again.
 * GitHub Pages lets the browser keep a file for only 10 minutes, and after that every use asks the server again.
 *
 * - A file of this build, whose name carries a hash of its content, never changes, so it is answered from the cache
 *   and fetched only the first time it is used. A deploy that changes a file gives it a new name, which is fetched
 *   in turn; a deploy also changes this worker, whose activation deletes the files the new build no longer has.
 * - The globe's maps keep their names across deploys, so they are answered from the cache and fetched again behind
 *   it, and a changed map shows from the next load on.
 * - Everything else, e.g. the page itself, goes to the network as without a worker, so a deploy reaches the Player
 *   on the next load.
 *
 * Music asks for parts of a file, which a cache cannot hold. The first part asked for sends the whole file to the
 * cache behind the music, and from then on every part is cut from the cached file.
 *
 * The build replaces `__GAME_BUILD_FILES__` with the paths of its files, e.g. `assets/index-B1x2c3.js`, relative to
 * the directory of the page. The worker imports nothing, so the build emits it as one plain script, `sw.js`.
 */

declare const __GAME_BUILD_FILES__: readonly string[];

interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(response: Promise<Response>): void;
}

interface ServiceWorkerScope {
  readonly registration: ServiceWorkerRegistration;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
}

const worker = self as unknown as ServiceWorkerScope;

/** Every cache of the game starts with this prefix, so that the worker never touches another site's caches. */
const PREFIX = 'game-v5-impl-web-';
const BUILD_CACHE = `${PREFIX}build`;
const GLOBE_CACHE = `${PREFIX}globe`;

const scope = worker.registration.scope;
const buildFiles = new Set(__GAME_BUILD_FILES__.map((path) => new URL(path, scope).href));
const globeBase = new URL('globe/', scope).href;

/** The whole files being fetched for the cache, by address, so that two parts asked for at once fetch one file. */
const filling = new Map<string, Promise<void>>();

worker.addEventListener('install', (event) => {
  event.waitUntil(worker.skipWaiting());
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith(PREFIX) && name !== BUILD_CACHE && name !== GLOBE_CACHE) {
          await caches.delete(name);
        }
      }
      const cache = await caches.open(BUILD_CACHE);
      for (const request of await cache.keys()) {
        if (!buildFiles.has(request.url)) {
          await cache.delete(request);
        }
      }
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  url.hash = '';
  url.search = '';
  if (buildFiles.has(url.href)) {
    event.respondWith(fromBuildCache(event, url.href));
  } else if (url.href.startsWith(globeBase)) {
    event.respondWith(fromGlobeCache(event, url.href));
  }
});

/** A file of this build: from the cache, or from the network once and then from the cache. */
async function fromBuildCache(event: FetchEvent, address: string): Promise<Response> {
  const cache = await caches.open(BUILD_CACHE);
  const cached = await cache.match(address);
  const range = event.request.headers.get('range');
  if (cached !== undefined) {
    return range === null ? cached : await partOf(cached, range);
  }
  if (range !== null) {
    event.waitUntil(fill(cache, address));
    return await fetch(event.request);
  }
  const response = await fetch(event.request);
  if (response.status === 200) {
    event.waitUntil(cache.put(address, response.clone()));
  }
  return response;
}

/** A globe map: from the cache when it is there, fetched again behind it either way. */
async function fromGlobeCache(event: FetchEvent, address: string): Promise<Response> {
  const cache = await caches.open(GLOBE_CACHE);
  const cached = await cache.match(address);
  const fresh = fetch(address).then(async (response) => {
    if (response.status === 200) {
      await cache.put(address, response.clone());
    }
    return response;
  });
  if (cached !== undefined) {
    event.waitUntil(fresh.catch(() => undefined));
    return cached;
  }
  return await fresh;
}

/** Fetches the whole file at `address` into `cache`, once however many parts of it are asked for meanwhile. */
function fill(cache: Cache, address: string): Promise<void> {
  let pending = filling.get(address);
  if (pending === undefined) {
    pending = fetch(address)
      .then(async (response) => {
        if (response.status === 200) {
          await cache.put(address, response);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        filling.delete(address);
      });
    filling.set(address, pending);
  }
  return pending;
}

/** The part of a cached file that a Range header asks for, e.g. `bytes=1000-` or `bytes=0-499`. */
async function partOf(cached: Response, range: string): Promise<Response> {
  const body = await cached.blob();
  const size = body.size;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  let start = 0;
  let end = size - 1;
  if (match !== null) {
    const [, first = '', last = ''] = match;
    if (first === '' && last !== '') {
      start = Math.max(0, size - Number(last));
    } else {
      start = first === '' ? 0 : Number(first);
      end = last === '' ? size - 1 : Math.min(size - 1, Number(last));
    }
  }
  if (match === null || start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const headers = new Headers(cached.headers);
  headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Accept-Ranges', 'bytes');
  return new Response(body.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}
