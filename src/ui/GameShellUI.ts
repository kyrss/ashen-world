import {
  computeViewportMetrics,
  formatFacingLabel,
  type GameShellState,
} from '../core/config';
import {
  eventBus,
  type TelemetrySnapshot,
  type WorldDialoguePayload,
} from '../core/EventBus';
import { computeJoystickVector, inputController } from '../input/InputController';
import { saveManager, type SaveRecord } from '../save/SaveManager';
import {
  THRESHOLD_INTERACTABLES,
  THRESHOLD_WAYSTONES,
} from '../world/thresholdLayout';

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

type RpgDrawerTab = 'inventory' | 'journal' | null;

export class GameShellUI {
  private root: HTMLElement;
  private currentState: GameShellState = 'title';
  private portraitDismissed = false;
  private activeDrawerTab: RpgDrawerTab = null;

  // DOM References
  private titleLayer!: HTMLElement;
  private hudLayer!: HTMLElement;
  private pauseModalLayer!: HTMLElement;
  private portraitBanner!: HTMLElement;
  private safeAreaGuideLayer!: HTMLElement;
  private toastEl!: HTMLElement;

  // Top-Left RPG Hero Status & World Readout
  private hudHeroLevelEl!: HTMLElement;
  private hudHpBarEl!: HTMLElement;
  private hudHpTextEl!: HTMLElement;
  private hudMpBarEl!: HTMLElement;
  private hudMpTextEl!: HTMLElement;
  private hudXpBarEl!: HTMLElement;
  private hudXpTextEl!: HTMLElement;
  private hudZoneTitleEl!: HTMLElement;
  private hudCoordsEl!: HTMLElement;
  private hudFacingEl!: HTMLElement;
  private hudWaystonesEl!: HTMLElement;

  // Contextual Prompt, Dialogue Modal & RPG Drawer
  private hudWaystonePromptEl!: HTMLElement;
  private hudWaystonePromptTextEl!: HTMLElement;
  private promptActionBtnEl!: HTMLButtonElement;
  private dialogueBannerEl!: HTMLElement;
  private dialogueSpeakerEl!: HTMLElement;
  private dialogueRoleEl!: HTMLElement;
  private dialogueBodyEl!: HTMLElement;
  private dialogueXpBadgeEl!: HTMLElement;

  private rpgDrawerEl!: HTMLElement;
  private rpgDrawerTitleEl!: HTMLElement;
  private rpgDrawerBodyEl!: HTMLElement;

  // Bottom Controls
  private interactButtonLabelEl!: HTMLElement;
  private soundToggleBtnEl!: HTMLButtonElement;
  private joystickBaseEl!: HTMLElement;
  private joystickKnobEl!: HTMLElement;
  private joystickVectorTextEl!: HTMLElement;

  private titleSaveSummaryEl!: HTMLElement;
  private pauseSaveDetailsEl!: HTMLElement;

  // Independent multi-touch pointer identifiers
  private joystickTouchId: number | null = null;
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
            Рекомендуется горизонтальный режим (Landscape) для удобного управления RPG двумя руками.
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
        class="opacity-0 translate-y-2 transition-all duration-150 fixed bottom-5 left-1/2 -translate-x-1/2 z-40 pointer-events-none px-3.5 py-1.5 rounded-lg bg-[#0d121d]/95 border border-amber-500/40 text-xs font-medium text-[#f3ede0] shadow-lg whitespace-nowrap"
      ></div>

      <!-- ==================== 1. TITLE SCREEN OVERLAY ==================== -->
      <section
        id="layer-title"
        aria-label="Экран приветствия Ashen World"
        class="fixed inset-0 pointer-events-auto z-30 flex flex-col justify-between safe-pad bg-gradient-to-r from-[#07090e]/92 via-[#090c14]/78 to-transparent"
      >
        <!-- Top World Context -->
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-2 text-xs text-slate-400 truncate">
            <span class="text-amber-400/90 font-medium">Этап 2 · Классическая 2D RPG</span>
            <span aria-hidden="true">·</span>
            <span>8-направленное движение и Y-Sorting</span>
            <span aria-hidden="true">·</span>
            <span class="hidden sm:inline">Локация: Пепельный Рубеж</span>
          </div>
          <div class="text-xs font-mono-tabular text-slate-400 whitespace-nowrap shrink-0">
            1280×720 · IndexedDB v2
          </div>
        </div>

        <!-- Asymmetric Left-Third Hero Lockup -->
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
                Хроники Вел'Ариса · Одиночная фэнтезийная 2D RPG
              </p>
            </div>
          </div>

          <p class="text-xs sm:text-sm text-slate-300/90 leading-relaxed max-w-lg mb-3">
            Исследуйте заставу Дозорных, древнее Святилище Расколотого Свода и Рощу Пепельных Древ в классической 2D-перспективе сверху под углом. Общайтесь с хранителями, изучайте скрижали и активируйте Путевые Обелиски.
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
              Войти в игровой мир
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

        <!-- Flat Single-Line Control Hint -->
        <div class="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80">
          <span>Сенсор: Левый джойстик — движение (8 направлений) · Правая панель — действие, навыки, инвентарь и журнал</span>
          <span class="hidden md:inline font-mono-tabular">Клавиатура: WASD / Стрелки · E / Space · I (Инвентарь) · J (Журнал) · Esc</span>
        </div>
      </section>

      <!-- ==================== 2. PLAYING CLASSIC 2D RPG HUD LAYER ==================== -->
      <section
        id="layer-hud"
        aria-label="Игровой интерфейс RPG"
        class="hidden fixed inset-0 pointer-events-none z-20 flex flex-col justify-between safe-pad"
      >
        <!-- Top Row: Left RPG Hero Unit Frame + Right RPG Utility Bar -->
        <div class="flex items-start justify-between gap-2">
          <!-- Top-Left Hero Status Frame (Portrait Crest, Level, HP, Mana, XP, Zone) -->
          <div
            id="hud-hero-frame"
            class="pointer-events-auto bg-[#0b101b]/92 border border-slate-700/85 rounded-xl px-2.5 py-1.5 shadow-xl flex items-center gap-2.5 max-w-[360px]"
          >
            <!-- Hero Crest & Level Badge -->
            <div class="relative w-10 h-10 rounded-lg bg-[#141d30] border border-amber-500/60 flex items-center justify-center shrink-0">
              <svg class="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M12 2L19 7v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V7l7-5z" />
                <circle cx="12" cy="11" r="2.5" fill="#38bdf8" stroke="none" />
              </svg>
              <span
                id="hud-hero-level"
                class="absolute -bottom-1 -right-1 px-1.5 py-0.2 rounded bg-amber-500 text-[#090b10] font-mono-tabular text-[10px] font-bold leading-tight"
              >
                Ур.1
              </span>
            </div>

            <!-- Vitals Bars (HP, Mana/Aether, XP) & Zone Info -->
            <div class="min-w-0 flex-1 space-y-1">
              <div class="flex items-center justify-between gap-2">
                <span id="hud-zone-title" class="text-[11px] font-semibold text-amber-300 truncate">
                  Врата Заката · Западный Тракт
                </span>
                <span id="hud-waystones" class="text-[10px] font-mono-tabular text-sky-300 whitespace-nowrap shrink-0">
                  Обелиски: 1/3
                </span>
              </div>

              <!-- Health & Mana Dual Bars -->
              <div class="grid grid-cols-2 gap-1.5">
                <div class="relative h-3.5 rounded bg-[#1a1118] border border-rose-900/70 overflow-hidden">
                  <div id="hud-hp-bar" class="h-full bg-gradient-to-r from-rose-700 to-rose-500 transition-all duration-200" style="width: 100%"></div>
                  <span id="hud-hp-text" class="absolute inset-0 flex items-center justify-center text-[9px] font-mono-tabular font-semibold text-white drop-shadow">
                    ОЗ 120/120
                  </span>
                </div>
                <div class="relative h-3.5 rounded bg-[#0f1928] border border-sky-900/70 overflow-hidden">
                  <div id="hud-mp-bar" class="h-full bg-gradient-to-r from-sky-700 to-cyan-400 transition-all duration-200" style="width: 100%"></div>
                  <span id="hud-mp-text" class="absolute inset-0 flex items-center justify-center text-[9px] font-mono-tabular font-semibold text-white drop-shadow">
                    ЭФ 80/80
                  </span>
                </div>
              </div>

              <!-- XP Progress Strip + Coordinates & 8-Way Compass -->
              <div class="flex items-center justify-between gap-2 text-[10px] font-mono-tabular text-slate-300">
                <div class="flex items-center gap-1.5 min-w-0">
                  <div class="w-14 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
                    <div id="hud-xp-bar" class="h-full bg-amber-400 transition-all duration-200" style="width: 0%"></div>
                  </div>
                  <span id="hud-xp-text" class="text-amber-300/90 whitespace-nowrap">ОП 0/100</span>
                </div>
                <div class="flex items-center gap-1.5 whitespace-nowrap">
                  <span id="hud-coords">X: 490 · Y: 890</span>
                  <span aria-hidden="true">·</span>
                  <span id="hud-state" class="text-emerald-300">Восток</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Top-Right RPG System & Utility Buttons (>= 44x44px touch targets) -->
          <div class="pointer-events-auto flex items-center gap-1.5 shrink-0">
            <button
              id="btn-hud-inventory"
              type="button"
              aria-label="Снаряжение и инвентарь"
              title="Инвентарь и экипировка [I]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <path d="M16 10a4 4 0 0 1-8 0" />
              </svg>
              <span class="hidden lg:inline whitespace-nowrap">Сумка</span>
            </button>

            <button
              id="btn-hud-quests"
              type="button"
              aria-label="Журнал заданий"
              title="Журнал заданий [J]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              <span class="hidden lg:inline whitespace-nowrap">Журнал</span>
            </button>

            <button
              id="btn-hud-save"
              type="button"
              aria-label="Сохранить прогресс"
              title="Сохранить прогресс [F]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span class="hidden xl:inline whitespace-nowrap">Сохранить</span>
            </button>

            <button
              id="btn-hud-sound"
              type="button"
              aria-label="Переключить звук"
              title="Переключить звук [M]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-slate-700/80 text-slate-200 flex items-center justify-center cursor-pointer transition-colors"
            ></button>

            <button
              id="btn-hud-pause"
              type="button"
              aria-label="Меню и пауза"
              title="Меню и пауза [P / Esc]"
              tabindex="-1"
              class="min-w-[44px] min-h-[44px] px-2.5 rounded-xl bg-[#0d121d]/90 hover:bg-[#172033] border border-amber-500/50 text-amber-300 flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
            >
              <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              <span class="hidden sm:inline whitespace-nowrap">Меню</span>
            </button>
          </div>
        </div>

        <!-- Contextual World Interaction Prompt Banner (Waystone / NPC / Shrine / Chest) -->
        <div
          id="hud-waystone-prompt"
          class="hidden pointer-events-auto fixed top-[68px] left-1/2 -translate-x-1/2 z-30 bg-[#111827]/95 border border-amber-500/60 rounded-xl px-3 py-1.5 shadow-xl flex items-center gap-2.5"
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
            Взаимодействие [E]
          </button>
        </div>

        <!-- In-World NPC Dialogue & Lore Inspection Panel -->
        <div
          id="hud-dialogue-panel"
          role="dialog"
          aria-label="Диалог и описание объекта"
          class="hidden pointer-events-auto fixed top-[70px] left-1/2 -translate-x-1/2 z-30 w-[92%] max-w-lg bg-[#0d1320]/96 border border-amber-500/60 rounded-2xl p-3.5 shadow-2xl"
        >
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800">
            <div class="min-w-0">
              <div id="dialogue-speaker" class="font-display text-sm font-bold text-amber-300 truncate">
                Хранитель Каэлен
              </div>
              <div id="dialogue-role" class="text-[11px] text-slate-400 truncate">
                Командор Заставы Вел'Ариса
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span id="dialogue-xp-badge" class="hidden px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono-tabular font-semibold">
                +40 ОП
              </span>
              <button
                id="btn-dialogue-close"
                type="button"
                class="px-2.5 py-1 min-h-[32px] rounded-lg bg-[#182236] hover:bg-[#22304c] text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
          <div id="dialogue-body" class="mt-2 text-xs text-slate-200 leading-relaxed space-y-1.5"></div>
        </div>

        <!-- RPG Foundation Drawer (Inventory / Quest Journal) -->
        <div
          id="rpg-drawer-panel"
          role="dialog"
          aria-label="Панель персонажа и журнала"
          class="hidden pointer-events-auto fixed top-[58px] right-4 z-30 w-[90%] max-w-sm max-h-[calc(100vh-148px)] flex flex-col bg-[#0d1320]/96 border border-slate-700/90 rounded-2xl p-3 shadow-2xl"
        >
          <div class="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-800 shrink-0">
            <h3 id="rpg-drawer-title" class="font-display text-sm font-bold text-amber-300">
              Журнал странствий
            </h3>
            <button
              id="btn-drawer-close"
              type="button"
              class="px-2.5 py-1 min-h-[30px] rounded-lg bg-[#182236] hover:bg-[#22304c] text-slate-200 border border-slate-700 text-xs font-medium cursor-pointer"
            >
              Закрыть
            </button>
          </div>
          <div id="rpg-drawer-body" class="mt-1.5 text-xs text-slate-300 space-y-1.5 flex-1 overflow-y-auto pr-0.5"></div>
        </div>

        <!-- Bottom Row: Left 8-Directional Virtual Thumbstick + Right RPG Skill Bar & Context Action -->
        <div class="flex items-end justify-between gap-3 pb-1">
          <!-- Left Virtual Analog 8-Direction Thumbstick -->
          <div class="pointer-events-auto flex items-end gap-2.5">
            <div
              id="virtual-joystick-zone"
              data-testid="virtual-joystick"
              role="slider"
              aria-label="Виртуальный джойстик движения"
              aria-valuemin="-1"
              aria-valuemax="1"
              aria-valuenow="0"
              class="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-[#0d121d]/82 border-2 border-slate-600/75 shadow-xl flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
            >
              <!-- 8-directional compass notches -->
              <span class="absolute top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-amber-400/60"></span>
              <span class="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>
              <span class="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>
              <span class="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-500/60"></span>

              <!-- Inner ring -->
              <div class="absolute inset-0 m-auto w-14 h-14 sm:w-16 sm:h-16 rounded-full border border-slate-700/60 pointer-events-none"></div>

              <!-- Movable Thumb Knob -->
              <div
                id="virtual-joystick-knob"
                class="relative w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-gradient-to-b from-slate-700 to-slate-900 border-2 border-amber-400/85 shadow-md flex items-center justify-center pointer-events-none transition-transform duration-75"
              >
                <div class="w-3 h-3 rounded-full bg-amber-400/90"></div>
              </div>
            </div>

            <div class="hidden md:block text-[11px] font-mono-tabular text-slate-400 bg-[#0d121d]/85 px-2.5 py-1.5 rounded-lg border border-slate-800">
              <div class="text-slate-300 font-medium">8 направлений</div>
              <div id="joystick-vector-text">X: 0.00 · Y: 0.00</div>
            </div>
          </div>

          <!-- Right RPG Skill Slots Foundation + Primary Contextual Interact Button -->
          <div class="pointer-events-auto flex items-end gap-2 sm:gap-2.5">
            <!-- 4-Slot RPG Skill Bar Foundation (Stage 2 HUD architecture) -->
            <div
              id="rpg-skill-bar"
              role="group"
              aria-label="Панель навыков персонажа"
              class="flex items-center gap-1.5 bg-[#0b101b]/90 border border-slate-700/80 rounded-2xl p-1.5 shadow-xl"
            >
              <button
                type="button"
                data-skill-slot="1"
                data-skill-name="Клинок Пепла"
                aria-label="Навык 1: Клинок Пепла"
                tabindex="-1"
                class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#131c2e] hover:bg-[#1b2740] active:scale-95 border border-amber-500/40 text-amber-300 flex flex-col items-center justify-center cursor-pointer transition-transform"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
                  <path d="M13 19l6-6" />
                  <path d="M16 16l4 4" />
                </svg>
                <span class="text-[9px] font-mono-tabular text-slate-300 mt-0.5">I</span>
              </button>

              <button
                type="button"
                data-skill-slot="2"
                data-skill-name="Эфирный Щит"
                aria-label="Навык 2: Эфирный Щит"
                tabindex="-1"
                class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#131c2e] hover:bg-[#1b2740] active:scale-95 border border-sky-500/40 text-sky-300 flex flex-col items-center justify-center cursor-pointer transition-transform"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span class="text-[9px] font-mono-tabular text-slate-300 mt-0.5">II</span>
              </button>

              <button
                type="button"
                data-skill-slot="3"
                data-skill-name="Печать Зодчих"
                aria-label="Навык 3: Печать Зодчих"
                tabindex="-1"
                class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#131c2e] hover:bg-[#1b2740] active:scale-95 border border-emerald-500/40 text-emerald-300 flex flex-col items-center justify-center cursor-pointer transition-transform"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="12 2 15 9 22 9 17 14 19 21 12 17 5 21 7 14 2 9 9 9" />
                </svg>
                <span class="text-[9px] font-mono-tabular text-slate-300 mt-0.5">III</span>
              </button>

              <button
                type="button"
                data-skill-slot="4"
                data-skill-name="Шаг Разлома"
                aria-label="Навык 4: Шаг Разлома"
                tabindex="-1"
                class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-[#131c2e] hover:bg-[#1b2740] active:scale-95 border border-purple-500/40 text-purple-300 flex flex-col items-center justify-center cursor-pointer transition-transform"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <span class="text-[9px] font-mono-tabular text-slate-300 mt-0.5">IV</span>
              </button>
            </div>

            <!-- Primary Contextual RPG Interact / Action Button -->
            <button
              id="btn-touch-interact"
              type="button"
              aria-label="Контекстное действие и взаимодействие"
              tabindex="-1"
              class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-amber-600/95 hover:bg-amber-500 active:scale-95 border-2 border-amber-300 text-[#090b10] shadow-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-transform shrink-0"
            >
              <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M12 2L17 12L12 22L7 12L12 2Z" />
              </svg>
              <span id="label-touch-interact" class="text-[10px] sm:text-[11px] font-bold tracking-tight whitespace-nowrap px-1">
                Действие
              </span>
            </button>
          </div>
        </div>
      </section>

      <!-- ==================== 3. PAUSE & RPG INSPECTOR MODAL ==================== -->
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
                Пауза · Хроники Пепельного Рубежа
              </h2>
              <p class="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                Управление локальными сохранениями IndexedDB (схема v2) и настройками экрана
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

    this.hudHeroLevelEl = this.root.querySelector('#hud-hero-level')!;
    this.hudHpBarEl = this.root.querySelector('#hud-hp-bar')!;
    this.hudHpTextEl = this.root.querySelector('#hud-hp-text')!;
    this.hudMpBarEl = this.root.querySelector('#hud-mp-bar')!;
    this.hudMpTextEl = this.root.querySelector('#hud-mp-text')!;
    this.hudXpBarEl = this.root.querySelector('#hud-xp-bar')!;
    this.hudXpTextEl = this.root.querySelector('#hud-xp-text')!;
    this.hudZoneTitleEl = this.root.querySelector('#hud-zone-title')!;
    this.hudCoordsEl = this.root.querySelector('#hud-coords')!;
    this.hudFacingEl = this.root.querySelector('#hud-state')!;
    this.hudWaystonesEl = this.root.querySelector('#hud-waystones')!;

    this.hudWaystonePromptEl = this.root.querySelector('#hud-waystone-prompt')!;
    this.hudWaystonePromptTextEl = this.root.querySelector('#hud-waystone-prompt-text')!;
    this.promptActionBtnEl = this.root.querySelector('#btn-prompt-attune')!;

    this.dialogueBannerEl = this.root.querySelector('#hud-dialogue-panel')!;
    this.dialogueSpeakerEl = this.root.querySelector('#dialogue-speaker')!;
    this.dialogueRoleEl = this.root.querySelector('#dialogue-role')!;
    this.dialogueBodyEl = this.root.querySelector('#dialogue-body')!;
    this.dialogueXpBadgeEl = this.root.querySelector('#dialogue-xp-badge')!;

    this.rpgDrawerEl = this.root.querySelector('#rpg-drawer-panel')!;
    this.rpgDrawerTitleEl = this.root.querySelector('#rpg-drawer-title')!;
    this.rpgDrawerBodyEl = this.root.querySelector('#rpg-drawer-body')!;

    this.interactButtonLabelEl = this.root.querySelector('#label-touch-interact')!;
    this.soundToggleBtnEl = this.root.querySelector('#btn-hud-sound')!;

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
      startBtn.disabled = true;
      titleResetBtn.disabled = true;
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
        })
        .finally(() => {
          startBtn.disabled = false;
          titleResetBtn.disabled = false;
        });
    });

    window.addEventListener('keydown', (e) => {
      if (this.currentState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        this.transitionTo('playing');
      } else if (e.code === 'KeyM') {
        this.toggleSoundSetting();
      } else if (this.currentState === 'playing') {
        if (e.code === 'KeyI') {
          this.toggleRpgDrawer('inventory');
        } else if (e.code === 'KeyJ') {
          this.toggleRpgDrawer('journal');
        }
      }
    });

    const invBtn = this.root.querySelector('#btn-hud-inventory') as HTMLButtonElement;
    invBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.toggleRpgDrawer('inventory');
    });

    const questsBtn = this.root.querySelector('#btn-hud-quests') as HTMLButtonElement;
    questsBtn.addEventListener('click', (e) => {
      (e.currentTarget as HTMLElement).blur();
      this.toggleRpgDrawer('journal');
    });

    const drawerCloseBtn = this.root.querySelector('#btn-drawer-close') as HTMLButtonElement;
    drawerCloseBtn.addEventListener('click', () => {
      this.closeRpgDrawer();
    });

    const dialogueCloseBtn = this.root.querySelector('#btn-dialogue-close') as HTMLButtonElement;
    dialogueCloseBtn.addEventListener('click', () => {
      this.dialogueBannerEl.classList.add('hidden');
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

    this.promptActionBtnEl.addEventListener('click', (e) => {
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

    // Bind RPG skill bar slots
    const skillButtons = this.root.querySelectorAll<HTMLButtonElement>('[data-skill-slot]');
    skillButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.blur();
        const slot = btn.dataset.skillSlot;
        const name = btn.dataset.skillName || 'Навык';
        this.showToast(`Ячейка навыка ${slot} («${name}») — боевые умения откроются на Этапе 3`);
      });
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

    eventBus.on('world:interacted', (payload) => {
      this.openDialogueBanner(payload);
    });

    eventBus.on('save:completed', (save) => {
      this.refreshSaveReadouts(save);
      if (this.activeDrawerTab) {
        this.renderRpgDrawerContent(this.activeDrawerTab);
      }
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

  private toggleRpgDrawer(tab: 'inventory' | 'journal'): void {
    if (this.activeDrawerTab === tab) {
      this.closeRpgDrawer();
      return;
    }
    this.activeDrawerTab = tab;
    this.dialogueBannerEl.classList.add('hidden');
    this.rpgDrawerEl.classList.remove('hidden');
    this.renderRpgDrawerContent(tab);
  }

  private closeRpgDrawer(): void {
    this.activeDrawerTab = null;
    this.rpgDrawerEl.classList.add('hidden');
  }

  private renderRpgDrawerContent(tab: 'inventory' | 'journal'): void {
    const save = saveManager.getCurrentSave();
    const discoveredSet = new Set(save.discoveredInteractables);
    const wsSet = new Set(save.discoveredWaystones);

    if (tab === 'inventory') {
      this.rpgDrawerTitleEl.textContent = 'Снаряжение и походная сумка';
      const hasReliquary = discoveredSet.has('chest_sentinel_reliquary');
      this.rpgDrawerBodyEl.innerHTML = `
        <div class="p-2 rounded-lg bg-[#090d16] border border-slate-800">
          <div class="text-amber-300 font-semibold">Эйден · Страж Пепельного Разлома</div>
          <div class="text-[11px] text-slate-400 mt-0.5">
            Уровень ${save.heroStats.level} · Опыт: ${save.heroStats.xp}/${save.heroStats.xpToNext} · ОЗ ${save.heroStats.hp}/${save.heroStats.maxHp}
          </div>
        </div>
        <div class="grid grid-cols-2 gap-1.5 text-[11px]">
          <div class="p-2 rounded-lg bg-[#131b2c] border border-slate-700/70">
            <div class="text-slate-400">Оружие</div>
            <div class="text-slate-200 font-medium">Рунный клинок Стража</div>
          </div>
          <div class="p-2 rounded-lg bg-[#131b2c] border border-slate-700/70">
            <div class="text-slate-400">Доспех</div>
            <div class="text-slate-200 font-medium">Кираса Дозора Вел'Ариса</div>
          </div>
          <div class="p-2 rounded-lg bg-[#131b2c] border border-slate-700/70">
            <div class="text-slate-400">Трофей ларя</div>
            <div class="${hasReliquary ? 'text-sky-300 font-medium' : 'text-slate-500'}">
              ${hasReliquary ? 'Малый эфирный кристалл' : 'Не найдено (осмотрите ларь)'}
            </div>
          </div>
          <div class="p-2 rounded-lg bg-[#131b2c] border border-slate-700/70">
            <div class="text-slate-400">Реликвия</div>
            <div class="${hasReliquary ? 'text-amber-300 font-medium' : 'text-slate-500'}">
              ${hasReliquary ? 'Печать Дозорного' : 'Пустой слот'}
            </div>
          </div>
        </div>
      `;
    } else {
      this.rpgDrawerTitleEl.textContent = 'Журнал поручений · Пепельный Рубеж';
      const itemsHtml = THRESHOLD_INTERACTABLES.map((item) => {
        const done = discoveredSet.has(item.id);
        return `
          <div class="flex items-center justify-between gap-2 py-1 border-b border-slate-800/70">
            <span class="${done ? 'text-emerald-300' : 'text-slate-300'}">${item.name}</span>
            <span class="text-[10px] font-mono-tabular ${done ? 'text-emerald-400' : 'text-amber-400'}">
              ${done ? 'Изучено' : item.actionLabel}
            </span>
          </div>
        `;
      }).join('');

      this.rpgDrawerBodyEl.innerHTML = `
        <div class="p-2 rounded-lg bg-[#090d16] border border-slate-800 text-[11px]">
          <div class="text-amber-300 font-semibold">Задание: Разведка Пепельного Рубежа</div>
          <div class="text-slate-400 mt-0.5">
            Пробудите 3 Путевых Обелиска (${wsSet.size}/${THRESHOLD_WAYSTONES.length}) и осмотрите ключевые точки заставы (${discoveredSet.size}/${THRESHOLD_INTERACTABLES.length}).
          </div>
        </div>
        <div class="space-y-0.5">${itemsHtml}</div>
      `;
    }
  }

  private openDialogueBanner(payload: WorldDialoguePayload): void {
    this.closeRpgDrawer();
    this.dialogueSpeakerEl.textContent = payload.speakerName;
    this.dialogueRoleEl.textContent = payload.roleTitle;
    this.dialogueBodyEl.innerHTML = payload.lines
      .map((line) => `<p>${line}</p>`)
      .join('');

    if (payload.xpGranted > 0) {
      this.dialogueXpBadgeEl.textContent = `+${payload.xpGranted} ОП`;
      this.dialogueXpBadgeEl.classList.remove('hidden');
    } else {
      this.dialogueXpBadgeEl.classList.add('hidden');
    }

    this.dialogueBannerEl.classList.remove('hidden');
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
    this.joystickVectorTextEl.textContent = `X: ${vec.x.toFixed(2)} · Y: ${vec.y.toFixed(2)}`;
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
    this.joystickVectorTextEl.textContent = 'X: 0.00 · Y: 0.00';
  }

  private bindVirtualJoystickAndMultiTouch(): void {
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
      }
    };

    window.addEventListener('touchend', handleGlobalTouchEndOrCancel);
    window.addEventListener('touchcancel', handleGlobalTouchEndOrCancel);

    window.addEventListener('blur', () => {
      this.resetJoystickVisuals();
    });

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
    const interactBtn = this.root.querySelector('#btn-touch-interact') as HTMLButtonElement;
    let lastTriggerAt = 0;
    const triggerInteract = (e: Event) => {
      if (e.type === 'touchstart') {
        e.preventDefault();
      }
      const now = performance.now();
      if (now - lastTriggerAt < 180) return;
      lastTriggerAt = now;
      inputController.triggerTouchInteract();
    };
    interactBtn.addEventListener('touchstart', triggerInteract, { passive: false });
    interactBtn.addEventListener('mousedown', triggerInteract);
    interactBtn.addEventListener('click', triggerInteract);
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
      this.closeRpgDrawer();
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
    this.hudFacingEl.textContent = formatFacingLabel(snap.facing);
    this.hudWaystonesEl.textContent = `Обелиски: ${snap.discoveredWaystonesCount}/${snap.totalWaystones}`;

    // Hero Level, HP, Mana, XP
    const stats = snap.heroStats;
    this.hudHeroLevelEl.textContent = `Ур.${stats.level}`;
    const hpPct = Math.max(0, Math.min(100, Math.round((stats.hp / stats.maxHp) * 100)));
    const mpPct = Math.max(0, Math.min(100, Math.round((stats.mana / stats.maxMana) * 100)));
    const xpPct = Math.max(0, Math.min(100, Math.round((stats.xp / stats.xpToNext) * 100)));

    this.hudHpBarEl.style.width = `${hpPct}%`;
    this.hudHpTextEl.textContent = `ОЗ ${stats.hp}/${stats.maxHp}`;
    this.hudMpBarEl.style.width = `${mpPct}%`;
    this.hudMpTextEl.textContent = `ЭФ ${stats.mana}/${stats.maxMana}`;
    this.hudXpBarEl.style.width = `${xpPct}%`;
    this.hudXpTextEl.textContent = `ОП ${stats.xp}/${stats.xpToNext}`;

    if (snap.nearestWaystoneName) {
      this.hudWaystonePromptEl.classList.remove('hidden');
      this.hudWaystonePromptTextEl.textContent = `Обелиск: ${snap.nearestWaystoneName}`;
      this.promptActionBtnEl.textContent = 'Резонанс [E]';
      this.interactButtonLabelEl.textContent = 'Резонанс';
    } else if (snap.nearestInteractableName) {
      this.hudWaystonePromptEl.classList.remove('hidden');
      this.hudWaystonePromptTextEl.textContent = snap.nearestInteractableName;
      this.promptActionBtnEl.textContent = `${snap.nearestActionLabel ?? 'Действие'} [E]`;
      this.interactButtonLabelEl.textContent = snap.nearestActionLabel ?? 'Действие';
    } else {
      this.hudWaystonePromptEl.classList.add('hidden');
      this.interactButtonLabelEl.textContent = 'Запись';
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
    const facingLabel = formatFacingLabel(save.playerPosition.facing);

    this.titleSaveSummaryEl.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="text-amber-300 font-semibold">Слот IndexedDB #1 (v${save.version})</span>
        <span aria-hidden="true">·</span>
        <span>Ур.${save.heroStats.level} (${save.heroStats.xp}/${save.heroStats.xpToNext} ОП)</span>
        <span aria-hidden="true">·</span>
        <span>X: ${save.playerPosition.x}, Y: ${save.playerPosition.y} (${facingLabel})</span>
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
      <div>Герой: Уровень ${save.heroStats.level} (ОП ${save.heroStats.xp}/${save.heroStats.xpToNext}) · ОЗ ${save.heroStats.hp}/${save.heroStats.maxHp} · ЭФ ${save.heroStats.mana}/${save.heroStats.maxMana}</div>
      <div>Координаты: X=${save.playerPosition.x}, Y=${save.playerPosition.y} · Направление: ${facingLabel} · Время: ${save.playTimeSeconds}с</div>
      <div>Обелиски: ${save.discoveredWaystones.length}/${THRESHOLD_WAYSTONES.length} · Изучено объектов мира: ${save.discoveredInteractables.length}/${THRESHOLD_INTERACTABLES.length} · Записано в ${formattedTime}</div>
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
