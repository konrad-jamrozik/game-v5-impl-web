/**
 * VIS, Tables: the widths of the columns whose widest value Visual Design names, each measured in its font with the
 * cell's 10 px padding on each side.
 */

/**
 * Every column headed Agent: an Agent name of 30 characters, the most AGENT, NameList allows, at
 * about 8.4 px a character of the Figure style.
 */
export const AGENT_COLUMN_WIDTH = '274px';

/**
 * A column headed Agent whose name is followed by its Rank insignia, as in the deployment pane: the Agent name of 30
 * characters in that pane's larger Figure style, its 6 px gap, and the widest insignia, three stars (33 px).
 */
export const AGENT_WITH_RANK_COLUMN_WIDTH = '330px';

/** The CR column of the deployment pane: "1,234" in its larger Figure style, which is wider than the header with its sort arrow. */
export const CR_COLUMN_WIDTH = '72px';

/** A Rank column: the widest `abbreviation`, "Hi Cmdr" (54 px), its 6 px gap, and three stars (33 px). */
export const RANK_COLUMN_WIDTH = '114px';

/** An Assignment column: "Recovery · 99 T left" (128 px) followed by the In transit icon. */
export const ASSIGNMENT_COLUMN_WIDTH = '168px';
