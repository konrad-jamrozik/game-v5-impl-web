/**
 * Installs the service worker of the Game build, `sw.js`, which keeps the files of the build in the browser so that a
 * reload does not download them again; see service-worker.ts. The development server has no worker, so that every
 * edit shows at once. A browser without service workers, or one that refuses this worker, downloads the files as
 * before.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }
  navigator.serviceWorker.register('./sw.js').catch((error: unknown) => {
    console.warn('The service worker could not be installed', error);
  });
}
