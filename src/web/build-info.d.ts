import type { BuildInfo } from './build-label.ts';

declare global {
  /** The commit the build was made from, which `vite.config.ts` reads from git; null when git gave none. */
  const __BUILD_INFO__: BuildInfo | null;
}
