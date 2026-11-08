import { normalizeMovementVector } from '../core/config';

export interface JoystickVector {
  x: number; // -1..1
  y: number; // -1..1
  magnitude: number; // 0..1
  knobOffsetX: number; // px offset for UI rendering
  knobOffsetY: number; // px offset for UI rendering
  active: boolean;
}

export interface InputSnapshot {
  moveX: number; // normalized -1..1
  moveY: number; // normalized -1..1
  magnitude: number; // 0..1
  interactJustPressed: boolean;
  pauseJustPressed: boolean;
}

/**
 * Pure function that computes normalized 360-degree / 8-direction joystick output
 * with deadzone and sensitivity scaling.
 */
export function computeJoystickVector(
  deltaX: number,
  deltaY: number,
  maxRadiusPx: number = 52,
  deadzone: number = 0.14,
  sensitivity: number = 1.0
): JoystickVector {
  const safeRadius = Math.max(10, maxRadiusPx);
  const rawDist = Math.hypot(deltaX, deltaY);
  if (rawDist < 0.001) {
    return { x: 0, y: 0, magnitude: 0, knobOffsetX: 0, knobOffsetY: 0, active: false };
  }

  const clampedDist = Math.min(rawDist, safeRadius);
  const dirX = deltaX / rawDist;
  const dirY = deltaY / rawDist;
  const rawNorm = clampedDist / safeRadius;

  if (rawNorm <= deadzone) {
    return {
      x: 0,
      y: 0,
      magnitude: 0,
      knobOffsetX: Math.round(dirX * clampedDist * 0.4),
      knobOffsetY: Math.round(dirY * clampedDist * 0.4),
      active: true,
    };
  }

  const rescaled =
    ((rawNorm - deadzone) / (1 - deadzone)) * Math.max(0.7, Math.min(1.4, sensitivity));
  const finalMag = Math.min(1, rescaled);

  return {
    x: Number((dirX * finalMag).toFixed(3)),
    y: Number((dirY * finalMag).toFixed(3)),
    magnitude: Number(finalMag.toFixed(3)),
    knobOffsetX: Math.round(dirX * clampedDist),
    knobOffsetY: Math.round(dirY * clampedDist),
    active: true,
  };
}

class InputController {
  private keysDown = new Set<string>();
  private keysJustPressed = new Set<string>();

  private touchVector: JoystickVector = {
    x: 0,
    y: 0,
    magnitude: 0,
    knobOffsetX: 0,
    knobOffsetY: 0,
    active: false,
  };

  private touchInteractEdge = false;
  private touchPauseEdge = false;
  private initialized = false;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const code = e.code;
      if (!this.keysDown.has(code)) {
        this.keysJustPressed.add(code);
      }
      this.keysDown.add(code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    const clearAll = () => {
      this.clearAllInputs();
    };

    window.addEventListener('blur', clearAll);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearAll();
      }
    });
  }

  clearAllInputs(): void {
    this.keysDown.clear();
    this.keysJustPressed.clear();
    this.touchVector = {
      x: 0,
      y: 0,
      magnitude: 0,
      knobOffsetX: 0,
      knobOffsetY: 0,
      active: false,
    };
    this.touchInteractEdge = false;
    this.touchPauseEdge = false;
  }

  setJoystickState(vec: JoystickVector): void {
    this.touchVector = vec;
  }

  getJoystickState(): JoystickVector {
    return this.touchVector;
  }

  triggerTouchInteract(): void {
    this.touchInteractEdge = true;
  }

  triggerTouchPause(): void {
    this.touchPauseEdge = true;
  }

  /**
   * Simulates key state in headless tests or programmatic checks.
   */
  setKeyDownState(code: string, isDown: boolean): void {
    if (isDown) {
      if (!this.keysDown.has(code)) {
        this.keysJustPressed.add(code);
      }
      this.keysDown.add(code);
    } else {
      this.keysDown.delete(code);
    }
  }

  /**
   * Consumes one-shot edges for the current simulation step and returns unified,
   * diagonally normalized touch + keyboard movement vectors.
   */
  consumeFrameInput(): InputSnapshot {
    let kbX = 0;
    let kbY = 0;

    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) kbX -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) kbX += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) kbY -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) kbY += 1;

    const useTouch = this.touchVector.active && this.touchVector.magnitude > 0.01;
    const rawX = useTouch ? this.touchVector.x : kbX;
    const rawY = useTouch ? this.touchVector.y : kbY;

    const normalized = normalizeMovementVector(rawX, rawY);

    const kbInteractJust =
      this.keysJustPressed.has('KeyE') ||
      this.keysJustPressed.has('KeyF') ||
      this.keysJustPressed.has('Space');

    const kbPauseJust =
      this.keysJustPressed.has('Escape') || this.keysJustPressed.has('KeyP');

    const snapshot: InputSnapshot = {
      moveX: normalized.vx,
      moveY: normalized.vy,
      magnitude: normalized.magnitude,
      interactJustPressed: this.touchInteractEdge || kbInteractJust,
      pauseJustPressed: this.touchPauseEdge || kbPauseJust,
    };

    // Clear one-shot edge triggers
    this.keysJustPressed.clear();
    this.touchInteractEdge = false;
    this.touchPauseEdge = false;

    return snapshot;
  }
}

export const inputController = new InputController();
