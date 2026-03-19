/** Default frame budget in milliseconds (targeting 60fps) */
export const DEFAULT_FRAME_BUDGET_MS = 16;

/** Queue size at which all actions are force-applied */
export const CRITICAL_QUEUE_SIZE = 1500;

/** Queue size that triggers increased actions-per-frame */
export const MAX_QUEUE_BEFORE_FLUSH = 3000;

/** Number of actions to process per flush when queue is large */
export const FLUSH_BATCH_SIZE = 500;

/** Number of frames to cache viewport visibility results */
export const VIEWPORT_CACHE_FRAMES = 60;

/** Default batch size before auto-flush in batch transport mode */
export const DEFAULT_BATCH_PACK_SIZE = 1000;

/** Default batch timeout in milliseconds */
export const DEFAULT_BATCH_TIMEOUT_MS = 6;

/** WebSocket reconnection defaults */
export const WS_MAX_RETRIES = 10;
export const WS_BASE_DELAY_MS = 1000;
export const WS_MAX_DELAY_MS = 30000;
