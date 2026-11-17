/** VIS, Background artwork and Artwork tuning: how GDRs name Detail views and how Artwork tuning names images. */

/**
 * A Detail view's name in lowercase words joined by underscores, as a BackgroundArtwork GDR names it, from the
 * identifier the web UI gives it, e.g. `turn_report` for `report`.
 */
export function detailViewName(view: string): string {
  return view === 'report' ? 'turn_report' : view;
}

/** The file name of an image path, as Artwork tuning shows it, e.g. `chatgpt-agents-i2.png`. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
