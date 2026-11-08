export type GameShellState = 'title' | 'playing' | 'paused';

/**
 * 8-way compass directions for classic 2D top-down / 3/4 perspective RPG movement:
 * s (Down), se (Down-Right), e (Right), ne (Up-Right),
 * n (Up), nw (Up-Left), w (Left), sw (Down-Left)
 */
export type FacingDirection = 's' | 'se' | 'e' | 'ne' | 'n' | 'nw' | 'w' | 'sw';

export const ALL_FACING_DIRECTIONS: readonly FacingDirection[] = [
  's',
  'se',
  'e',
  'ne',
  'n',
  'nw',
  'w',
  'sw',
] as const;

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
  WORLD_WIDTH: 2400,
  WORLD_HEIGHT: 1600,
  WORLD_MARGIN: 64,
  CAMERA_LERP_X: 0.12,
  CAMERA_LERP_Y: 0.12,
  PLAYER_MOVE_SPEED: 240,
  INTERACT_RADIUS: 130,
  WAYSTONE_INTERACT_RADIUS: 135,
} as const;

/**
 * Normalizes a 2D movement input vector (moveX, moveY in [-1..1]) so that diagonal movement
 * never exceeds unit magnitude (1.0), while preserving analog thumbstick magnitudes < 1.0.
 */
export function normalizeMovementVector(
  moveX: number,
  moveY: number
): { vx: number; vy: number; magnitude: number } {
  const rawMag = Math.hypot(moveX, moveY);
  if (rawMag < 0.001) {
    return { vx: 0, vy: 0, magnitude: 0 };
  }
  const clampedMag = Math.min(1, rawMag);
  const scale = clampedMag / rawMag;
  return {
    vx: Number((moveX * scale).toFixed(4)),
    vy: Number((moveY * scale).toFixed(4)),
    magnitude: Number(clampedMag.toFixed(4)),
  };
}

/**
 * Resolves one of the 8 RPG facing directions ('s', 'se', 'e', 'ne', 'n', 'nw', 'w', 'sw')
 * from a velocity/input vector (vx, vy). In screen coordinates, +X is East and +Y is South.
 */
export function resolveFacingDirection(
  vx: number,
  vy: number,
  fallback: FacingDirection = 's'
): FacingDirection {
  if (Math.hypot(vx, vy) < 0.05) {
    return fallback;
  }
  const angleDeg = (Math.atan2(vy, vx) * 180) / Math.PI; // -180..180, 0 = East, 90 = South
  const normalized = (angleDeg + 360) % 360;

  if (normalized >= 337.5 || normalized < 22.5) return 'e';
  if (normalized >= 22.5 && normalized < 67.5) return 'se';
  if (normalized >= 67.5 && normalized < 112.5) return 's';
  if (normalized >= 112.5 && normalized < 157.5) return 'sw';
  if (normalized >= 157.5 && normalized < 202.5) return 'w';
  if (normalized >= 202.5 && normalized < 247.5) return 'nw';
  if (normalized >= 247.5 && normalized < 292.5) return 'n';
  return 'ne';
}

/**
 * Computes the render depth for Y-sorting in a 3/4 top-down RPG perspective.
 * Entities with a larger ground-contact Y coordinate (further south / closer to camera)
 * render in front of entities with a smaller Y coordinate (further north).
 */
export function computeYSortDepth(footY: number, layerBias: number = 0): number {
  return Math.round(footY * 10) + layerBias;
}

/**
 * Human-readable Russian compass label for each of the 8 facing directions.
 */
export function formatFacingLabel(facing: FacingDirection): string {
  const labels: Record<FacingDirection, string> = {
    n: 'Север',
    ne: 'Северо-Восток',
    e: 'Восток',
    se: 'Юго-Восток',
    s: 'Юг',
    sw: 'Юго-Запад',
    w: 'Запад',
    nw: 'Северо-Запад',
  };
  return labels[facing] || 'Юг';
}

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
