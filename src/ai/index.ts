/** The Autopilot AIs this Game build offers. */
import type { AutopilotAi } from '../engine/player-api.ts';
import { createBasicAutopilotAi } from './basic/basic-autopilot-ai.ts';

export {
  BASIC_AI_THRESHOLDS,
  createBasicAutopilotAi,
  type BasicAiThresholds,
} from './basic/basic-autopilot-ai.ts';

export const AUTOPILOT_AIS: readonly AutopilotAi[] = [createBasicAutopilotAi()];
