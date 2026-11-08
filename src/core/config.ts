export type GameShellState = 'title' | 'playing' | 'paused';

export interface ViewportMetrics {
  windowWidth: number;
  windowHeight: number;
  logicalWidth: number;
  logicalHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  isPortrait: boolean;
  aspectRatio: number;
}

export const GAME_CONFIG = {
  TITLE: 'ASHEN WORLD',
  SUBTITLE: 'Хроники Пепельного Рубежа',
  LOGICAL_WIDTH: 1280,
  LOGICAL_HEIGHT: 720,
  WORLD_WIDTH: 3200,
  WORLD_HEIGHT: 900,
  GROUND_Y: 760,
  GRAVITY_Y: 1320,
  CAMERA_LERP_X: 0.12,
  CAMERA_LERP_Y: 0.12,
  PLAYER_MOVE_SPEED: 310,
  PLAYER_JUMP_VELOCITY: -590,
  PLAYER_DASH_SPEED: 680,
  PLAYER_DASH_DURATION_MS: 210,
  PLAYER_DASH_COOLDOWN_MS: 1150,
  COYOTE_TIME_MS: 110,
  JUMP_BUFFER_MS: 130,
  WAYSTONE_INTERACT_RADIUS: 115,
} as const;

/**
 * Computes how the 1280x720 landscape logical canvas fits inside any host window
 * (including iPhone 15/16 Pro Max landscape 932x430, standard iPhone 844x390, or 1440x900 desktop).
 */
export function computeViewportMetrics(
  windowWidth: number,
  windowHeight: number,
  logicalWidth: number = GAME_CONFIG.LOGICAL_WIDTH,
  logicalHeight: number = GAME_CONFIG.LOGICAL_HEIGHT
): ViewportMetrics {
  const safeW = Math.max(1, windowWidth);
  const safeH = Math.max(1, windowHeight);
  const scaleX = safeW / logicalWidth;
  const scaleY = safeH / logicalHeight;
  const scale = Math.min(scaleX, scaleY);
  const renderedWidth = logicalWidth * scale;
  const renderedHeight = logicalHeight * scale;
  const offsetX = Math.round((safeW - renderedWidth) * 0.5);
  const offsetY = Math.round((safeH - renderedHeight) * 0.5);
  const aspectRatio = Number((safeW / safeH).toFixed(3));

  return {
    windowWidth: safeW,
    windowHeight: safeH,
    logicalWidth,
    logicalHeight,
    scale: Number(scale.toFixed(4)),
    offsetX,
    offsetY,
    isPortrait: safeH > safeW * 1.05,
    aspectRatio,
  };
}

/**
 * Converts client screen coordinates (touch/mouse) into logical 1280x720 canvas coordinates
 * using live bounding rectangle measurements.
 */
export function screenToLogicalCanvas(
  clientX: number,
  clientY: number,
  canvasRect: { left: number; top: number; width: number; height: number },
  logicalWidth: number = GAME_CONFIG.LOGICAL_WIDTH,
  logicalHeight: number = GAME_CONFIG.LOGICAL_HEIGHT
): { x: number; y: number } {
  const width = Math.max(1, canvasRect.width);
  const height = Math.max(1, canvasRect.height);
  const normX = (clientX - canvasRect.left) / width;
  const normY = (clientY - canvasRect.top) / height;
  return {
    x: Math.round(Math.max(0, Math.min(1, normX)) * logicalWidth),
    y: Math.round(Math.max(0, Math.min(1, normY)) * logicalHeight),
  };
}
