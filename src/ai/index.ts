/** The Autopilot AIs this Game build offers. */
import type { AutopilotAi } from '../engine/player-api.ts';
import { createBasicAutopilotAi } from './basic/basic-autopilot-ai.ts';

export { createBasicAutopilotAi } from './basic/basic-autopilot-ai.ts';
export { planEquipment, type EquipmentPlan } from './basic/equipping.ts';
export { makePlan, nextRungs, threat, wonAgainst } from './basic/strategy.ts';
export {
  agentsNeeded,
  BASIC_AI_THRESHOLDS,
  meetsRequiredShare,
  requiredRatingSharePct,
  type BasicAiThresholds,
} from './basic/tuning.ts';

export const AUTOPILOT_AIS: readonly AutopilotAi[] = [createBasicAutopilotAi()];
