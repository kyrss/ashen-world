import { computeViewportMetrics, type GameShellState } from '../core/config';
import { eventBus, type TelemetrySnapshot } from '../core/EventBus';
import { computeJoystickVector, inputController } from '../input/InputController';
import { saveManager, type SaveRecord } from '../save/SaveManager';
import { THRESHOLD_WAYSTONES } from '../world/thresholdLayout';

/**
 * Pure helper to check whether a touch point remains within a button's active bounds
 * (including an ergonomic thumb tolerance margin).
 */
export function isPointWithinExpandedRect(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; right: number; bottom: number },
  tolerancePx: number = 24
): boolean {
  return (
    clientX >= rect.left - tolerancePx &&
    clientX <= rect.right + tolerancePx &&
    clientY >= rect.top - tolerancePx &&
    clientY <= rect.bottom + tolerancePx
  );
}

export class GameShellUI {
  private root: HTMLElement;
  private currentState: GameShellState = 'title';
  private portraitDismissed = false;

  // DOM References
  private titleLayer!: HTMLElement;
  private hudLayer!: HTMLElement;
  private pauseModalLayer!: HTMLElement;
  private portraitBanner!: HTMLElement;
  private safeAreaGuideLayer!: HTMLElement;
  private toastEl!: HTMLElement;

  private hudZoneTitleEl!: HTMLElement;
  private hudCoordsEl!: HTMLElement;
  private hudStateEl!: HTMLElement;
  private hudWaystonesEl!: HTMLElement;
  private hudWaystonePromptEl!: HTMLElement;
  private hudWaystonePromptTextEl!: HTMLElement;
  private dashButtonEl!: HTMLButtonElement;
  private dashCooldownLabelEl!: HTMLElement;
  private interactButtonLabelEl!: HTMLElement;
  private soundToggleBtnEl!: HTMLButtonElement;
  private jumpButtonEl!: HTMLButtonElement;

  private joystickBaseEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;
  private joystickVectorTextEl!: HTMLElement;

  private titleSaveSummaryEl!: HTMLElement;
  private pauseSaveDetailsEl!: HTMLElement;

  // Independent multi-touch pointer identifiers
  private joystickTouchId: number | null = null;
  private jumpTouchId: number | null = null;
  private pointerDragActive = false;
  private toastTimeoutId: number | null = null;

  constructor(mountElement: HTMLElement) {
    this.root = mountElement;
    this.buildDOM();
    this.bindEvents();
    this.refreshSaveReadouts(saveManager.getCurrentSave());
    this.applySettingsVisuals();
    this.checkViewportOrientation();

    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      this.transitionTo('playing');
    } else {
      this.transitionTo('title');
    }
  }

  private buildDOM(): void {
    this.root.innerHTML = `
      <!-- Optional iPhone Safe-Area Visual Guide Frame -->
      <div id="safe-area-guide" class="hidden fixed inset-0 pointer-events-none z-40">
        <div class="w-full h-full border-2 border-dashed border-amber-400/50 safe-pad flex items-end justify-center">
          <span class="text-[11px] font-mono-tabular text-amber-300/80 bg-[#090b10]/90 px-2 py-0.5 rounded">
            Безопасная область iPhone Landscape (Safe Area Inset)
          </span>
        </div>
      </div>

      <!-- Portrait Orientation Notice Banner -->
      <div
        id="portrait-banner"
        role="status"
        class="hidden fixed top-3 left-3 right-3 z-50 pointer-events-auto bg-[#111622] border border-amber-500/50 rounded-xl px-4 py-2.5 shadow-xl flex items-center justify-between gap-3"
      >
        <div class="flex items-center gap-3 min-w-0">
          <svg class="w-5 h-5 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="2" y="6" width="20" height="12" rx="2.5" />
            <path d="M18 12h.01" />
          </svg>
          <p class="text-xs text-[#e6e1d6] truncate">
            Рекомендуется горизонтальный режим (Landscape) для удобного управления двумя большими пальцами.
          </p>
        </div>
        <button
          id="btn-dismiss-portrait"
          type="button"
          class="px-3 py-1.5 min-h-[36px] text-xs font-medium text-amber-300 bg-[#1b2234] hover:bg-[#252f47] rounded-lg border border-amber-500/30 whitespace-nowrap shrink-0 cursor-pointer"
        >
          Понятно
        </button>
      </div>

      <!-- Toast Notification -->
      <div
        id="hud-toast"
        role="status"
        aria-live="polite"
        class="opacity-0 translate-y-2 transition-all duration-150 fixed bottom-6 left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3.5 py-1.5 rounded-lg bg-[#0d121d]/95 border border-amber-500/40 text-xs font-medium text-[#f3ede0] shadow-lg whitespace-nowrap"
      ></div>

      <!-- ==================== 1. TITLE SCREEN OVERLAY ==================== -->
      <section
        id="layer-title"
        aria-label="Экран приветствия Ashen World"
        class="fixed inset-0 pointer-events-auto z-30 flex flex-col justify-between safe-pad bg-gradient-to-r from-[#07090e]/92 via-[#090c14]/78 to-transparent"
      >
        <!-- Top Subtle World Context -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2 text-xs text-slate-400 truncate">
            <span class="text-amber-400/90 font-medium">Этап 1 · Технический фундамент</span>
            <span aria-hidden="true">·</span>
            <span>Phaser 3 WebGL</span>
            <span aria-hidden="true">·</span>
            <span class="hidden sm:inline">Локация: Пепельный Рубеж</span>
          </div>
          <div class="text-xs font-mono-tabular text-slate-400 whitespace-nowrap shrink-0">
            1280×720 · IndexedDB v1
          </div>
        </div>

        <!-- Asymmetric Left-Third Hero Lockup over Calm Negative Space -->
        <div class="my-auto max-w-xl py-1">
          <div class="flex items-center gap-3.5 mb-2.5">
            <svg class="w-12 h-12 sm:w-14 sm:h-14 shrink-0" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <circle cx="32" cy="32" r="28" fill="#0f1523" stroke="#d97706" stroke-width="1.8" />
              <circle cx="32" cy="32" r="22" stroke="#38bdf8" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="4 3" />
              <path d="M32 8L44 32L32 56L20 32L32 8Z" fill="#172033" stroke="#f59e0b" stroke-width="1.8" />
              <path d="M32 15L38 32L32 49L26 32L32 15Z" fill="#38bdf8" fill-opacity="0.28" />
              <circle cx="32" cy="32" r="4.5" fill="#fbbf24" />
            </svg>
            <div>
              <h1 class="font-display text-2xl sm:text-4xl lg:text-5xl font-bold tracking-wider text-[#f5efe4] leading-none">
                ASHEN WORLD
              </h1>
              <p class="text-xs sm:text-sm text-amber-400/90 mt-1 tracking-wide">
                Хроники Вел'Ариса · Одиночная 2D Action RPG
              </p>
            </div>
          </div>

          <p class="text-xs sm:text-sm text-slate-300/90 leading-relaxed max-w-lg mb-3">
            Испытательный полигон у врат древнего святилища Зодчих. Проверьте работу камеры, физики столкновений, сенсорного управления и локальных сохранений у Путевых Обелисков.
          </p>

          <!-- IndexedDB Save Slot Status Line -->
          <div
            id="title-save-summary"
            class="mb-3.5 px-3 py-2 rounded-lg bg-[#0e131f]/90 border border-slate-700/70 text-xs text-slate-300 font-mono-tabular"
          >
            Загрузка данных из IndexedDB...
          </div>

          <!-- Primary CTA & Secondary Reset Action -->
          <div class="flex flex-wrap items-center gap-3">
            <button
              id="btn-start-game"
              type="button"
              data-start="true"
              class="px-5 py-2.5 min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-[0.98] text-[#090b10] font-semibold text-xs sm:text-sm tracking-wide shadow-lg cursor-pointer transition-all whitespace-nowrap shrink-0"
            >
              Войти в Пепельный Рубеж
            </button>
            <button
              id="btn-title-reset-save"
              type="button"
              class="px-4 py-2.5 min-h-[44px] rounded-xl bg-[#161d2e] hover:bg-[#1f2940] text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
            >
              Новая сессия (Сброс)
            </button>
          </div>
        </div>

        <!-- Flat Single-Line Control Hint in Bottom Safe Margin -->
        <div class="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
          <span>Сенсор: Левый джойстик — движение · Правые кнопки — прыжок, рывок, обелиск</span>
          <span class="hidden md:inline font-mono-tabular">Клавиатура: A/D · Space · Shift · E · Esc</span>
        </div>
      </section>

      <!-- ==================== 2. PLAYING HUD LAYER ==================== -->
      <section
        id="layer-hud"
        aria-label="Игровой интерфейс"
        class="hidden fixed inset-0 pointer-events-none z-20 flex flex-col justify-between safe-pad"
      >
        <!-- Top Row: Strictly 2 Compact Corner Clusters (Left Plaque + Right Utility Controls) -->
        <div class="flex items-start justify-between gap-3">
          <!-- Top-Left World-Matched Obsidian Plaque -->
          <div class="pointer-events-auto bg-[#0d121d]/90 border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-lg max-w-[310px]">
            <div class="flex items-center justify-between gap-3">
              <span id="hud-zone-title" class="text-xs font-semibold text-amber-400 truncate">
                Врата Заката · Западный Бастион
              </span>
              <span id="hud-waystones" class="text-[11px] font-mono-tabular text-sky-300 whitespace-nowrap shrink-0">
                Обелиски: 1/3
              </span>
            </div>
            <div class="flex items-center gap-2 mt-0.5 text-[11px] font-mono-tabular text-slate-300 whitespace-nowrap">
              <span id="hud-coords">X: 340 · Y: 700</span>
              <span aria-hidden="true">·</span>
              <span id="hud-state" class="text-emerald-300">На опоре</span>
            </div>
          </div>

          <!-- Top-Right Compact Utility Controls (>= 44x44px hitboxes) -->
          <div class="pointer-events-auto flex items-center gap-2 shrink-0">
            <button
              id="btn-hud-save"
              type="button"
              aria-label="Сохранить прогресс"
              title="Сохранить прогресс [F]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span class="hidden sm:inline whitespace-nowrap">Сохранить</span>
            </button>

            <button
              id="btn-hud-sound"
              type="button"
              aria-label="Переключить звук"
              title="Переключить звук [M]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            >
              <!-- Speaker Icon injected via applySettingsVisuals -->
            </button>

            <button
              id="btn-hud-pause"
              type="button"
              aria-label="Меню и пауза"
              title="Меню и пауза [P / Esc]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-amber-500/50 text-amber-300 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <span class="hidden sm:inline whitespace-nowrap">Меню</span>
            </button>
          </div>
        </div>

        <!-- Contextual Waystone Banner (Positioned below top bar center so it never collides with bottom thumb controls even on 667x375) -->
        <div
          id="hud-waystone-prompt"
          class="hidden pointer-events-auto fixed top-[64px] left-1/2 -translate-x-1/2 z-30 bg-[#131a29]/95 border border-amber-500/60 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5"
        >
          <svg class="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L17 12L12 22L7 12L12 2Z" />
          </svg>
          <span id="hud-waystone-prompt-text" class="text-xs font-medium text-[#f5efe4] whitespace-nowrap">
            Обелиск Врат Заката
          </span>
          <button
            id="btn-prompt-attune"
            type="button"
            class="px-2.5 py-1 min-h-[32px] rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-amber-300 text-xs font-medium cursor-pointer whitespace-nowrap"
          >
            Резонанс [E]
          </button>
        </div>

        <!-- Bottom Row: Ergonomic Left Virtual Thumbstick + Right Thumb Action Arc -->
        <div class="flex items-end justify-between gap-4 pb-1">
          <!-- Left Virtual Analog Thumbstick -->
          <div class="pointer-events-auto flex items-end gap-2.5">
            <div
              id="virtual-joystick-zone"
              data-testid="virtual-joystick"
              role="slider"
              aria-label="Виртуальный джойстик движения"
              aria-valuemin="-1"
              aria-valuemax="1"
              aria-valuenow="0"
              class="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0d121d]/80 border-2 border-slate-600/70 shadow-xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
            >
              <!-- Cardinal directional notches -->
              <span class="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>
              <span class="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>
              <span class="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>
              <span class="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>

              <!-- Inner ring (strictly absolute centered) -->
              <div class="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full border border-slate-700/60 pointer-events-none"></div>

              <!-- Movable Thumb Knob (dead-center at rest) -->
              <div
                id="virtual-joystick-knob"
                class="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-amber-400/80 shadow-md flex items-center justify-center pointer-events-none transition-transform duration-75"
              >
                <div class="w-3 h-3 rounded-full bg-amber-400/90"></div>
              </div>
            </div>

            <div class="hidden md:block text-[11px] font-mono-tabular text-slate-400 bg-[#0d121d]/80 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <div class="text-slate-300 font-medium">Джойстик</div>
              <div id="joystick-vector-text">Ось X: 0.00</div>
            </div>
          </div>

          <!-- Right Ergonomic Thumb Action Arc (Jump, Dash, Waystone Attune) -->
          <div class="pointer-events-auto flex items-end gap-2.5 sm:gap-3">
            <!-- Interact / Attune Waystone Button -->
            <button
              id="btn-touch-interact"
              type="button"
              aria-label="Обелиск и сохранение"
              tabindex="-1"
              class="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#101827]/90 hover:bg-[#19253b] active:scale-95 border-2 border-amber-500/60 text-amber-300 shadow-lg flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-transform"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L17 12L12 22L7 12L12 2Z" />
              </svg>
              <span id="label-touch-interact" class="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                Обелиск
              </span>
            </button>

            <!-- Impulse Dash Button -->
            <button
              id="btn-touch-dash"
              type="button"
              aria-label="Импульсный рывок"
              tabindex="-1"
              class="w-14 h-14 sm:w-16 sm:h-16 mb-2.5 sm:mb-3 rounded-2xl bg-[#101827]/90 hover:bg-[#19253b] active:scale-95 border-2 border-sky-400/70 text-sky-300 shadow-lg flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-transform"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span id="label-touch-dash" class="text-[10px] font-semibold font-mono-tabular tracking-tight whitespace-nowrap">
                Рывок
              </span>
            </button>

            <!-- Primary Jump Button -->
            <button
              id="btn-touch-jump"
              type="button"
              aria-label="Прыжок"
              tabindex="-1"
              class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-600/90 hover:bg-amber-500 active:scale-95 border-2 border-amber-300 text-[#090b10] shadow-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-transform"
            >
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4">
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
              <span class="text-xs font-bold tracking-tight whitespace-nowrap">Прыжок</span>
            </button>
          </div>
        </div>
      </section>

      <!-- ==================== 3. PAUSE & FOUNDATION INSPECTOR MODAL ==================== -->
      <section
        id="layer-pause"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-modal-title"
        class="hidden fixed inset-0 pointer-events-auto z-40 bg-[#06080d]/88 flex items-center justify-center safe-pad"
      >
        <div class="w-full max-w-xl max-h-[calc(100vh-24px)] overflow-y-auto bg-[#0e131f] border border-slate-700/90 rounded-2xl p-4 sm:p-5 shadow-2xl">
          <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-800">
            <div>
              <h2 id="pause-modal-title" class="font-display text-base sm:text-xl font-bold text-[#f5efe4]">
                Пауза · Технический паспорт Этапа 1
              </h2>
              <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Управление локальными сохранениями IndexedDB и настройками мобильного экрана
              </p>
            </div>
            <button
              id="btn-pause-resume-top"
              type="button"
              class="px-3.5 py-2 min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-500 text-[#090b10] font-semibold text-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              Продолжить [Esc]
            </button>
          </div>

          <!-- IndexedDB Live Status & Telemetry -->
          <div
            id="pause-save-details"
            class="my-3 p-3 rounded-xl bg-[#090c14] border border-slate-800 text-xs font-mono-tabular text-slate-300 space-y-1"
          ></div>

          <!-- LocalStorage Settings Controls -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-3">
            <button
              id="btn-setting-sound"
              type="button"
              class="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#151c2c] hover:bg-[#1c2539] border border-slate-700/80 text-left flex items-center justify-between gap-2 cursor-pointer"
            >
              <span class="text-xs font-medium text-slate-200">Звуковой синтез (Web Audio)</span>
              <span id="badge-setting-sound" class="text-xs font-mono-tabular text-amber-400">ВКЛ</span>
            </button>

            <button
              id="btn-setting-safearea"
              type="button"
              class="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#151c2c] hover:bg-[#1c2539] border border-slate-700/80 text-left flex items-center justify-between gap-2 cursor-pointer"
            >
              <span class="text-xs font-medium text-slate-200">Рамка Safe Area iPhone</span>
              <span id="badge-setting-safearea" class="text-xs font-mono-tabular text-slate-400">ВЫКЛ</span>
            </button>
          </div>

          <!-- Action Buttons Row -->
          <div class="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-800">
            <div class="flex flex-wrap items-center gap-2">
              <button
                id="btn-pause-save-now"
                type="button"
                class="px-3.5 py-2 min-h-[44px] rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-400/50 text-sky-300 text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                Записать в IndexedDB
              </button>
              <button
                id="btn-pause-reset-save"
                type="button"
                class="px-3.5 py-2 min-h-[44px] rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/40 text-rose-300 text-xs font-medium cursor-pointer whitespace-nowrap"
              >
                Сбросить прогресс
              </button>
            </div>

            <button
              id="btn-pause-to-title"
              type="button"
              class="px-3.5 py-2 min-h-[44px] rounded-xl bg-[#161d2e] hover:bg-[#202a42] border border-slate-700 text-slate-300 text-xs font-medium cursor-pointer whitespace-nowrap"
            >
              На титульный экран
            </button>
          </div>
        </div>
      </section>
    `;

    this.titleLayer = this.root.querySelector('#layer-title')!;
    this.hudLayer = this.root.querySelector('#layer-hud')!;
    this.pauseModalLayer = this.root.querySelector('#layer-pause')!;
    this.portraitBanner = this.root.querySelector('#portrait-banner')!;
    this.safeAreaGuideLayer = this.root.querySelector('#safe-area-guide')!;
    this.toastEl = this.root.querySelector('#hud-toast')!;

    this.hudZoneTitleEl = this.root.querySelector('#hud-zone-title')!;
    this.hudCoordsEl = this.root.querySelector('#hud-coords')!;
    this.hudStateEl = this.root.querySelector('#hud-state')!;
    this.hudWaystonesEl = this.root.querySelector('#hud-waystones')!;
    this.hudWaystonePromptEl = this.root.querySelector('#hud-waystone-prompt')!;
    this.hudWaystonePromptTextEl = this.root.querySelector('#hud-waystone-prompt-text')!;
    this.dashButtonEl = this.root.querySelector('#btn-touch-dash')!;
    this.dashCooldownLabelEl = this.root.querySelector('#label-touch-dash')!;
    this.interactButtonLabelEl = this.root.querySelector('#label-touch-interact')!;
    this.soundToggleBtnEl = this.root.querySelector('#btn-hud-sound')!;
    this.jumpButtonEl = this.root.querySelector('#btn-touch-jump')!;

    this.joystickBaseEl = this.root.querySelector('#virtual-joystick-zone')!;
    this.joystickKnobEl = this.root.querySelector('#virtual-joystick-knob')!;
    this.joystickVectorTextEl = this.root.querySelector('#joystick-vector-text')!;

    this.titleSaveSummaryEl = this.root.querySelector('#title-save-summary')!;
    this.pauseSaveDetailsEl = this.root.querySelector('#pause-save-details')!;
  }

  private bindEvents(): void {
    const startBtn = this.root.querySelector('#btn-start-game') as HTMLButtonElement;
    startBtn.addEventListener('click', () => {
      startBtn.blur();
      this.transitionTo('playing');
    });

    const titleResetBtn = this.root.querySelector('#btn-title-reset-save') as HTMLButtonElement;
    titleResetBtn.addEventListener('click', () => {
      titleResetBtn.blur();
      void saveManager
        .resetSave()
        .then((fresh) => {
          eventBus.emit('save:reset', fresh);
          this.refreshSaveReadouts(fresh);
          this.showToast('Создана чистая сессия в IndexedDB');
        })
        .catch((err: unknown) => {
          const reason = err instanceof Error ? err.message : 'Сбой сброса сохранения';
          eventBus.emit('save:failed', { reason });
        });
    });

    window.addEventListener('keydown', (e) => {
      if (this.currentState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        this.transitionTo('playing');
      } else if (e.code === 'KeyM') {
        this.toggleSoundSetting();
      }
    });

    const hudSaveBtn = this.root.querySelector('#btn-hud-save') as HTMLButtonElement;
    hudSaveBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      eventBus.emit('save:requested', { source: 'hud_button' });
    });

    this.soundToggleBtnEl.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.toggleSoundSetting();
    });

    const hudPauseBtn = this.root.querySelector('#btn-hud-pause') as HTMLButtonElement;
    hudPauseBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.transitionTo('paused');
    });

    const promptAttuneBtn = this.root.querySelector('#btn-prompt-attune') as HTMLButtonElement;
    promptAttuneBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      inputController.triggerTouchInteract();
    });

    const resumeBtn = this.root.querySelector('#btn-pause-resume-top') as HTMLButtonElement;
    resumeBtn.addEventListener('click', () => {
      resumeBtn.blur();
      this.transitionTo('playing');
    });

    const pauseSaveNowBtn = this.root.querySelector('#btn-pause-save-now') as HTMLButtonElement;
    pauseSaveNowBtn.addEventListener('click', () => {
      pauseSaveNowBtn.blur();
      eventBus.emit('save:requested', { source: 'pause_menu' });
    });

    const pauseResetBtn = this.root.querySelector('#btn-pause-reset-save') as HTMLButtonElement;
    pauseResetBtn.addEventListener('click', () => {
      pauseResetBtn.blur();
      void saveManager
        .resetSave()
        .then((fresh) => {
          eventBus.emit('save:reset', fresh);
          this.refreshSaveReadouts(fresh);
          this.showToast('Сохранение сброшено к начальной точке Пепельного Рубежа');
        })
        .catch((err: unknown) => {
          const reason = err instanceof Error ? err.message : 'Сбой сброса сохранения';
          eventBus.emit('save:failed', { reason });
        });
    });

    const pauseToTitleBtn = this.root.querySelector('#btn-pause-to-title') as HTMLButtonElement;
    pauseToTitleBtn.addEventListener('click', () => {
      pauseToTitleBtn.blur();
      this.transitionTo('title');
    });

    const settingSoundBtn = this.root.querySelector('#btn-setting-sound') as HTMLButtonElement;
    settingSoundBtn.addEventListener('click', () => {
      this.toggleSoundSetting();
    });

    const settingSafeAreaBtn = this.root.querySelector('#btn-setting-safearea') as HTMLButtonElement;
    settingSafeAreaBtn.addEventListener('click', () => {
      const curr = saveManager.getSettings();
      const updated = saveManager.updateSettings({ showSafeAreaGuide: !curr.showSafeAreaGuide });
      this.applySettingsVisuals();
      eventBus.emit('settings:changed', updated);
    });

    const dismissPortraitBtn = this.root.querySelector('#btn-dismiss-portrait') as HTMLButtonElement;
    dismissPortraitBtn.addEventListener('click', () => {
      this.portraitDismissed = true;
      this.portraitBanner.classList.add('hidden');
    });

    this.bindVirtualJoystickAndMultiTouch();
    this.bindActionButtons();

    eventBus.on('state:changed', (nextState) => {
      if (this.currentState !== nextState) {
        this.applyStateLayers(nextState);
      }
    });

    eventBus.on('telemetry:updated', (snap) => {
      this.updateTelemetryHUD(snap);
    });

    eventBus.on('save:completed', (save) => {
      this.refreshSaveReadouts(save);
    });

    eventBus.on('save:failed', ({ reason }) => {
      this.showToast(`Ошибка сохранения: ${reason}`);
    });

    eventBus.on('toast:message', ({ text }) => {
      this.showToast(text);
    });

    window.addEventListener('resize', () => {
      this.checkViewportOrientation();
    });
  }

  private updateJoystickFromClientCoords(clientX: number, clientY: number): void {
    const rect = this.joystickBaseEl.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    const maxRadius = rect.width * 0.4;
    const sensitivity = saveManager.getSettings().joystickSensitivity;

    const vec = computeJoystickVector(
      clientX - centerX,
      clientY - centerY,
      maxRadius,
      0.14,
      sensitivity
    );
    inputController.setJoystickState(vec);
    this.joystickKnobEl.style.transform = `translate3d(${vec.knobOffsetX}px, ${vec.knobOffsetY}px, 0)`;
    this.joystickBaseEl.setAttribute('aria-valuenow', String(vec.x));
    this.joystickVectorTextEl.textContent = `Ось X: ${vec.x.toFixed(2)}`;
  }

  private resetJoystickVisuals(): void {
    this.joystickTouchId = null;
    this.pointerDragActive = false;
    inputController.setJoystickState({
      x: 0,
      y: 0,
      magnitude: 0,
      knobOffsetX: 0,
      knobOffsetY: 0,
      active: false,
    });
    this.joystickKnobEl.style.transform = 'translate3d(0px, 0px, 0)';
    this.joystickBaseEl.setAttribute('aria-valuenow', '0');
    this.joystickVectorTextEl.textContent = 'Ось X: 0.00';
  }

  private releaseJumpTouch(): void {
    this.jumpTouchId = null;
    inputController.triggerTouchJump(false);
  }

  private bindVirtualJoystickAndMultiTouch(): void {
    // Use targetTouches[0] so simultaneous touches on right-hand buttons never hijack the joystick ID
    this.joystickBaseEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (this.joystickTouchId !== null) return;
        const touch = e.targetTouches[0] || e.changedTouches[0];
        if (!touch) return;
        this.joystickTouchId = touch.identifier;
        this.updateJoystickFromClientCoords(touch.clientX, touch.clientY);
      },
      { passive: false }
    );

    window.addEventListener(
      'touchmove',
      (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (this.joystickTouchId !== null && t.identifier === this.joystickTouchId) {
            this.updateJoystickFromClientCoords(t.clientX, t.clientY);
          }
          if (this.jumpTouchId !== null && t.identifier === this.jumpTouchId) {
            const jumpRect = this.jumpButtonEl.getBoundingClientRect();
            if (!isPointWithinExpandedRect(t.clientX, t.clientY, jumpRect, 28)) {
              this.releaseJumpTouch();
            }
          }
        }
      },
      { passive: false }
    );

    const handleGlobalTouchEndOrCancel = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const id = e.changedTouches[i].identifier;
        if (this.joystickTouchId !== null && id === this.joystickTouchId) {
          this.resetJoystickVisuals();
        }
        if (this.jumpTouchId !== null && id === this.jumpTouchId) {
          this.releaseJumpTouch();
        }
      }
    };

    window.addEventListener('touchend', handleGlobalTouchEndOrCancel);
    window.addEventListener('touchcancel', handleGlobalTouchEndOrCancel);

    // Clear all touch/pointer states on window blur or visibility loss
    window.addEventListener('blur', () => {
      this.resetJoystickVisuals();
      this.releaseJumpTouch();
    });

    // Mouse / Pointer events for desktop verification
    this.joystickBaseEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.pointerDragActive = true;
      this.updateJoystickFromClientCoords(e.clientX, e.clientY);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.pointerDragActive) return;
      this.updateJoystickFromClientCoords(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', () => {
      if (this.pointerDragActive) {
        this.resetJoystickVisuals();
      }
    });
  }

  private bindActionButtons(): void {
    const dashBtn = this.root.querySelector('#btn-touch-dash') as HTMLButtonElement;
    const interactBtn = this.root.querySelector('#btn-touch-interact') as HTMLButtonElement;

    // Multi-touch isolated Jump button
    this.jumpButtonEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const touch = e.targetTouches[0] || e.changedTouches[0];
        if (touch) {
          this.jumpTouchId = touch.identifier;
        }
        inputController.triggerTouchJump(true);
      },
      { passive: false }
    );

    this.jumpButtonEl.addEventListener(
      'touchend',
      (e) => {
        e.preventDefault();
        this.releaseJumpTouch();
      },
      { passive: false }
    );

    this.jumpButtonEl.addEventListener(
      'touchcancel',
      (e) => {
        e.preventDefault();
        this.releaseJumpTouch();
      },
      { passive: false }
    );

    this.jumpButtonEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      inputController.triggerTouchJump(true);
    });
    this.jumpButtonEl.addEventListener('mouseup', (e) => {
      e.preventDefault();
      inputController.triggerTouchJump(false);
    });
    this.jumpButtonEl.addEventListener('mouseleave', () => {
      inputController.triggerTouchJump(false);
    });

    const triggerDash = (e: Event) => {
      e.preventDefault();
      inputController.triggerTouchDash();
    };
    dashBtn.addEventListener('touchstart', triggerDash, { passive: false });
    dashBtn.addEventListener('mousedown', triggerDash);

    const triggerInteract = (e: Event) => {
      e.preventDefault();
      inputController.triggerTouchInteract();
    };
    interactBtn.addEventListener('touchstart', triggerInteract, { passive: false });
    interactBtn.addEventListener('mousedown', triggerInteract);
  }

  public transitionTo(nextState: GameShellState): void {
    this.applyStateLayers(nextState);
    eventBus.emit('state:changed', nextState);
  }

  private applyStateLayers(nextState: GameShellState): void {
    this.currentState = nextState;
    document.body.dataset.state = nextState;

    if (nextState !== 'playing') {
      this.resetJoystickVisuals();
      this.releaseJumpTouch();
    }

    this.titleLayer.classList.toggle('hidden', nextState !== 'title');
    this.hudLayer.classList.toggle('hidden', nextState === 'title');
    this.pauseModalLayer.classList.toggle('hidden', nextState !== 'paused');

    if (nextState === 'paused' || nextState === 'title') {
      this.refreshSaveReadouts(saveManager.getCurrentSave());
    }
  }

  private updateTelemetryHUD(snap: TelemetrySnapshot): void {
    this.hudZoneTitleEl.textContent = snap.zoneTitle;
    this.hudCoordsEl.textContent = `X: ${snap.x} · Y: ${snap.y}`;

    if (snap.dashing) {
      this.hudStateEl.textContent = 'Импульсный шаг';
      this.hudStateEl.className = 'text-sky-300';
    } else if (snap.grounded) {
      this.hudStateEl.textContent = 'На опоре';
      this.hudStateEl.className = 'text-emerald-300';
    } else {
      this.hudStateEl.textContent = 'В воздухе';
      this.hudStateEl.className = 'text-amber-300';
    }

    this.hudWaystonesEl.textContent = `Обелиски: ${snap.discoveredCount}/${snap.totalWaystones}`;

    if (snap.nearestWaystoneName) {
      this.hudWaystonePromptEl.classList.remove('hidden');
      this.hudWaystonePromptTextEl.textContent = `Обелиск: ${snap.nearestWaystoneName}`;
      this.interactButtonLabelEl.textContent = 'Резонанс';
    } else {
      this.hudWaystonePromptEl.classList.add('hidden');
      this.interactButtonLabelEl.textContent = 'Запись';
    }

    if (snap.dashCooldownRatio > 0) {
      this.dashButtonEl.classList.add('opacity-60');
      this.dashCooldownLabelEl.textContent = `${(snap.dashCooldownRatio * 1.15).toFixed(1)}с`;
    } else {
      this.dashButtonEl.classList.remove('opacity-60');
      this.dashCooldownLabelEl.textContent = 'Рывок';
    }
  }

  public refreshSaveReadouts(save: SaveRecord): void {
    const wsObj =
      THRESHOLD_WAYSTONES.find((w) => w.id === save.activeWaystoneId) || THRESHOLD_WAYSTONES[0];
    const formattedTime = new Date(save.savedAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    this.titleSaveSummaryEl.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-amber-300 font-semibold">Слот IndexedDB #1</span>
        <span aria-hidden="true">·</span>
        <span>Точка: ${wsObj.name}</span>
        <span aria-hidden="true">·</span>
        <span>X: ${save.playerPosition.x}, Y: ${save.playerPosition.y}</span>
        <span aria-hidden="true">·</span>
        <span>Обелиски: ${save.discoveredWaystones.length}/${THRESHOLD_WAYSTONES.length}</span>
      </div>
    `;

    this.pauseSaveDetailsEl.innerHTML = `
      <div class="flex items-center justify-between text-amber-300 font-semibold">
        <span>Хранилище: IndexedDB (${save.slotId} · схема v${save.version})</span>
        <span>FNV-1a: #${save.checksum}</span>
      </div>
      <div>Регион: ${save.regionName} · Активный якорь: ${wsObj.name}</div>
      <div>Координаты: X=${save.playerPosition.x}, Y=${save.playerPosition.y} · Направление: ${
        save.playerPosition.facing === 'right' ? 'Восток' : 'Запад'
      } · Время: ${save.playTimeSeconds}с</div>
      <div>Открыто путевых обелисков: ${save.discoveredWaystones.length} из ${
        THRESHOLD_WAYSTONES.length
      } · Записано в ${formattedTime}</div>
    `;
  }

  private toggleSoundSetting(): void {
    const curr = saveManager.getSettings();
    const updated = saveManager.updateSettings({ soundEnabled: !curr.soundEnabled });
    this.applySettingsVisuals();
    eventBus.emit('settings:changed', updated);
    this.showToast(updated.soundEnabled ? 'Звуковые эффекты включены' : 'Звуковые эффекты отключены');
  }

  private applySettingsVisuals(): void {
    const settings = saveManager.getSettings();
    const soundBadge = this.root.querySelector('#badge-setting-sound');
    if (soundBadge) {
      soundBadge.textContent = settings.soundEnabled ? 'ВКЛ' : 'ВЫКЛ';
      soundBadge.className = settings.soundEnabled
        ? 'text-xs font-mono-tabular text-amber-400'
        : 'text-xs font-mono-tabular text-slate-500';
    }

    const safeBadge = this.root.querySelector('#badge-setting-safearea');
    if (safeBadge) {
      safeBadge.textContent = settings.showSafeAreaGuide ? 'ВКЛ' : 'ВЫКЛ';
      safeBadge.className = settings.showSafeAreaGuide
        ? 'text-xs font-mono-tabular text-amber-400'
        : 'text-xs font-mono-tabular text-slate-500';
    }

    this.safeAreaGuideLayer.classList.toggle('hidden', !settings.showSafeAreaGuide);

    this.soundToggleBtnEl.innerHTML = settings.soundEnabled
      ? `<svg class="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
           <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
           <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
         </svg>`
      : `<svg class="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
           <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
           <line x1="23" y1="9" x2="17" y2="15" />
           <line x1="17" y1="9" x2="23" y2="15" />
         </svg>`;
  }

  private checkViewportOrientation(): void {
    const metrics = computeViewportMetrics(window.innerWidth, window.innerHeight);
    if (metrics.isPortrait && !this.portraitDismissed) {
      this.portraitBanner.classList.remove('hidden');
    } else {
      this.portraitBanner.classList.add('hidden');
    }
  }

  private showToast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('opacity-0', 'translate-y-2');
    this.toastEl.classList.add('opacity-100', 'translate-y-0');

    if (this.toastTimeoutId !== null) {
      window.clearTimeout(this.toastTimeoutId);
    }
    this.toastTimeoutId = window.setTimeout(() => {
      this.toastEl.classList.remove('opacity-100', 'translate-y-0');
      this.toastEl.classList.add('opacity-0', 'translate-y-2');
    }, 2600);
  }
}
