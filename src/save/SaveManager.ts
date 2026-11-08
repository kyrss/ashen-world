import { ALL_FACING_DIRECTIONS, type FacingDirection } from '../core/config';
import {
  clampWorldPosition,
  DEFAULT_SPAWN_POINT,
  findNearestWaystone,
  resolveSafeWalkablePosition,
  THRESHOLD_INTERACTABLES,
  THRESHOLD_WAYSTONES,
  type WaystoneSpec,
} from '../world/thresholdLayout';
import { eventBus, type TypedEventBus } from '../core/EventBus';

export const SAVE_SCHEMA_VERSION = 2;
export const SAVE_DB_NAME = 'ashen_world_db';
export const SAVE_STORE_NAME = 'saves';
export const DEFAULT_SLOT_ID = 'slot_1';
export const SETTINGS_STORAGE_KEY = 'ashen_world_settings_v1';
export const FALLBACK_SAVE_STORAGE_KEY = 'ashen_world_save_backup_v1';

export interface HeroStats {
  level: number;
  xp: number;
  xpToNext: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
}

export const DEFAULT_HERO_STATS: HeroStats = {
  level: 1,
  xp: 0,
  xpToNext: 100,
  hp: 120,
  maxHp: 120,
  mana: 80,
  maxMana: 80,
};

export interface SaveRecord {
  version: number;
  slotId: string;
  savedAt: string;
  regionId: string;
  regionName: string;
  playerPosition: {
    x: number;
    y: number;
    facing: FacingDirection;
  };
  activeWaystoneId: string;
  discoveredWaystones: string[];
  discoveredInteractables: string[];
  heroStats: HeroStats;
  playTimeSeconds: number;
  checksum: string; // 32-bit FNV-1a hex digest
}

export interface SavePartialUpdate {
  x?: number;
  y?: number;
  facing?: FacingDirection | 'left' | 'right';
  activeWaystoneId?: string;
  discoveredWaystoneId?: string;
  discoveredInteractableId?: string;
  xpGain?: number;
  restoreVitals?: boolean;
  playTimeSeconds?: number;
}

export interface SaveReconciliationResult {
  winner: SaveRecord | null;
  source: 'idb' | 'backup' | 'none';
  needsSyncToIdb: boolean;
  needsSyncToBackup: boolean;
}

export interface UserSettings {
  soundEnabled: boolean;
  joystickSensitivity: number;
  showSafeAreaGuide: boolean;
  hapticFeedback: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  soundEnabled: true,
  joystickSensitivity: 1.0,
  showSafeAreaGuide: false,
  hapticFeedback: true,
};

const VALID_FACING_SET = new Set<string>(ALL_FACING_DIRECTIONS);

export function normalizeFacingDirection(raw: unknown): FacingDirection {
  if (raw === 'left') return 'w';
  if (raw === 'right') return 'e';
  if (typeof raw === 'string' && VALID_FACING_SET.has(raw)) {
    return raw as FacingDirection;
  }
  return 's';
}

/**
 * Pure helper to apply experience points and level-ups to HeroStats.
 */
export function applyExperienceGain(stats: HeroStats, xpDelta: number): HeroStats {
  if (xpDelta <= 0) {
    return { ...stats };
  }
  let level = stats.level;
  let xp = stats.xp + Math.floor(xpDelta);
  let xpToNext = stats.xpToNext;
  let maxHp = stats.maxHp;
  let maxMana = stats.maxMana;
  let hp = stats.hp;
  let mana = stats.mana;

  while (xp >= xpToNext) {
    xp -= xpToNext;
    level += 1;
    xpToNext = Math.round(xpToNext * 1.35);
    maxHp += 20;
    maxMana += 15;
    hp = maxHp;
    mana = maxMana;
  }

  return {
    level,
    xp,
    xpToNext,
    hp,
    maxHp,
    mana,
    maxMana,
  };
}

function fnv1aHex(canonical: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Legacy v1 checksum computation (kept so v1 saves can be verified before migration to v2).
 */
export function computeLegacyV1Checksum(payload: {
  version: number;
  slotId: string;
  regionId: string;
  playerPosition: { x: number; y: number; facing: string };
  activeWaystoneId: string;
  discoveredWaystones: string[];
  playTimeSeconds: number;
}): string {
  const canonical = JSON.stringify({
    v: payload.version,
    slot: payload.slotId,
    region: payload.regionId,
    x: Math.round(payload.playerPosition.x),
    y: Math.round(payload.playerPosition.y),
    facing: payload.playerPosition.facing,
    ws: payload.activeWaystoneId,
    disc: [...payload.discoveredWaystones].sort(),
    t: Math.floor(payload.playTimeSeconds),
  });
  return fnv1aHex(canonical);
}

/**
 * Computes a deterministic 32-bit FNV-1a hex checksum over the v2 RPG save payload.
 */
export function computeSaveChecksum(payload: Omit<SaveRecord, 'checksum'>): string {
  const canonical = JSON.stringify({
    v: payload.version,
    slot: payload.slotId,
    region: payload.regionId,
    x: Math.round(payload.playerPosition.x),
    y: Math.round(payload.playerPosition.y),
    facing: payload.playerPosition.facing,
    ws: payload.activeWaystoneId,
    disc: [...payload.discoveredWaystones].sort(),
    inter: [...(payload.discoveredInteractables ?? [])].sort(),
    lvl: payload.heroStats?.level ?? 1,
    xp: payload.heroStats?.xp ?? 0,
    hp: payload.heroStats?.hp ?? 120,
    mp: payload.heroStats?.mana ?? 80,
    t: Math.floor(payload.playTimeSeconds),
  });
  return fnv1aHex(canonical);
}

export function createInitialSaveRecord(slotId: string = DEFAULT_SLOT_ID): SaveRecord {
  const startWaystone = THRESHOLD_WAYSTONES[0];
  const spawn = resolveSafeWalkablePosition(DEFAULT_SPAWN_POINT.x, DEFAULT_SPAWN_POINT.y);
  const base: Omit<SaveRecord, 'checksum'> = {
    version: SAVE_SCHEMA_VERSION,
    slotId,
    savedAt: new Date().toISOString(),
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: {
      x: spawn.x,
      y: spawn.y,
      facing: 'e',
    },
    activeWaystoneId: startWaystone.id,
    discoveredWaystones: [startWaystone.id],
    discoveredInteractables: [],
    heroStats: { ...DEFAULT_HERO_STATS },
    playTimeSeconds: 0,
  };

  return {
    ...base,
    checksum: computeSaveChecksum(base),
  };
}

/**
 * Strictly validates a raw save object loaded from IndexedDB or LocalStorage backup.
 * - Supports both schema v1 (Stage 1 platformer saves) and schema v2 (Stage 2 2D RPG saves).
 * - Strictly verifies the FNV-1a checksum for both v1 and v2 records; rejects tampered/corrupted records (`null`).
 * - Safely migrates valid v1 records to v2 (converting 'left'/'right' to 'w'/'e', resolving safe walkable 2D coordinates,
 *   and initializing heroStats and discoveredInteractables).
 */
export function validateAndMigrateSave(raw: unknown): SaveRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<SaveRecord> & {
    playerPosition?: { x?: unknown; y?: unknown; facing?: unknown };
  };

  if (
    typeof candidate.version !== 'number' ||
    candidate.version < 1 ||
    candidate.version > SAVE_SCHEMA_VERSION
  ) {
    return null;
  }

  if (
    !candidate.playerPosition ||
    typeof candidate.playerPosition.x !== 'number' ||
    !Number.isFinite(candidate.playerPosition.x) ||
    typeof candidate.playerPosition.y !== 'number' ||
    !Number.isFinite(candidate.playerPosition.y)
  ) {
    return null;
  }

  if (typeof candidate.slotId !== 'string' || !candidate.slotId) {
    return null;
  }

  if (
    typeof candidate.playTimeSeconds !== 'number' ||
    !Number.isFinite(candidate.playTimeSeconds) ||
    candidate.playTimeSeconds < 0
  ) {
    return null;
  }

  if (!Array.isArray(candidate.discoveredWaystones)) {
    return null;
  }

  if (typeof candidate.checksum !== 'string' || candidate.checksum.length !== 8) {
    return null;
  }

  const validWaystoneIds = new Set(THRESHOLD_WAYSTONES.map((w) => w.id));
  const validInteractableIds = new Set(THRESHOLD_INTERACTABLES.map((i) => i.id));
  const rawActiveWs =
    typeof candidate.activeWaystoneId === 'string'
      ? candidate.activeWaystoneId
      : THRESHOLD_WAYSTONES[0].id;
  const rawRegionId =
    typeof candidate.regionId === 'string' ? candidate.regionId : 'ashen_threshold';

  // 1. Verify integrity of v1 legacy saves before migrating to v2
  if (candidate.version === 1) {
    const rawFacing: unknown = candidate.playerPosition.facing;
    const legacyFacing = rawFacing === 'left' ? 'left' : 'right';
    const expectedV1Hash = computeLegacyV1Checksum({
      version: 1,
      slotId: candidate.slotId,
      regionId: rawRegionId,
      playerPosition: {
        x: candidate.playerPosition.x,
        y: candidate.playerPosition.y,
        facing: legacyFacing,
      },
      activeWaystoneId: rawActiveWs,
      discoveredWaystones: candidate.discoveredWaystones.filter(
        (id): id is string => typeof id === 'string'
      ),
      playTimeSeconds: candidate.playTimeSeconds,
    });

    if (expectedV1Hash !== candidate.checksum) {
      return null;
    }
  }

  // 2. Verify integrity of v2 saves
  const normalizedFacing = normalizeFacingDirection(candidate.playerPosition.facing);
  const rawInteractables = Array.isArray(candidate.discoveredInteractables)
    ? candidate.discoveredInteractables.filter((id): id is string => typeof id === 'string')
    : [];
  const rawHeroStats: HeroStats =
    candidate.heroStats && typeof candidate.heroStats === 'object'
      ? {
          level:
            typeof candidate.heroStats.level === 'number'
              ? Math.max(1, Math.floor(candidate.heroStats.level))
              : DEFAULT_HERO_STATS.level,
          xp:
            typeof candidate.heroStats.xp === 'number'
              ? Math.max(0, Math.floor(candidate.heroStats.xp))
              : DEFAULT_HERO_STATS.xp,
          xpToNext:
            typeof candidate.heroStats.xpToNext === 'number'
              ? Math.max(50, Math.floor(candidate.heroStats.xpToNext))
              : DEFAULT_HERO_STATS.xpToNext,
          hp:
            typeof candidate.heroStats.hp === 'number'
              ? Math.max(1, Math.floor(candidate.heroStats.hp))
              : DEFAULT_HERO_STATS.hp,
          maxHp:
            typeof candidate.heroStats.maxHp === 'number'
              ? Math.max(50, Math.floor(candidate.heroStats.maxHp))
              : DEFAULT_HERO_STATS.maxHp,
          mana:
            typeof candidate.heroStats.mana === 'number'
              ? Math.max(0, Math.floor(candidate.heroStats.mana))
              : DEFAULT_HERO_STATS.mana,
          maxMana:
            typeof candidate.heroStats.maxMana === 'number'
              ? Math.max(20, Math.floor(candidate.heroStats.maxMana))
              : DEFAULT_HERO_STATS.maxMana,
        }
      : { ...DEFAULT_HERO_STATS };

  if (candidate.version === SAVE_SCHEMA_VERSION) {
    const rawV2Payload: Omit<SaveRecord, 'checksum'> = {
      version: candidate.version,
      slotId: candidate.slotId,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : '',
      regionId: rawRegionId,
      regionName:
        typeof candidate.regionName === 'string' ? candidate.regionName : 'Пепельный Рубеж',
      playerPosition: {
        x: candidate.playerPosition.x,
        y: candidate.playerPosition.y,
        facing: normalizedFacing,
      },
      activeWaystoneId: rawActiveWs,
      discoveredWaystones: candidate.discoveredWaystones.filter(
        (id): id is string => typeof id === 'string'
      ),
      discoveredInteractables: rawInteractables,
      heroStats: rawHeroStats,
      playTimeSeconds: candidate.playTimeSeconds,
    };

    const computedV2Hash = computeSaveChecksum(rawV2Payload);
    if (computedV2Hash !== candidate.checksum) {
      return null;
    }
  }

  // 3. Sanitize and migrate to v2
  const filteredDiscovered = candidate.discoveredWaystones.filter(
    (id): id is string => typeof id === 'string' && validWaystoneIds.has(id)
  );
  const discoveredWaystones =
    filteredDiscovered.length > 0
      ? Array.from(new Set(filteredDiscovered))
      : [THRESHOLD_WAYSTONES[0].id];

  const activeWaystoneId = validWaystoneIds.has(rawActiveWs)
    ? rawActiveWs
    : discoveredWaystones[0];

  const discoveredInteractables = Array.from(
    new Set(rawInteractables.filter((id) => validInteractableIds.has(id)))
  );

  // If migrating from v1 default spawn (340, 700), map to the v2 West Gate spawn road;
  // otherwise clamp into world bounds (and resolve safe walkable if v1).
  let targetX = candidate.playerPosition.x;
  let targetY = candidate.playerPosition.y;
  if (candidate.version === 1) {
    if (Math.abs(targetX - 340) <= 10 && Math.abs(targetY - 700) <= 10) {
      targetX = DEFAULT_SPAWN_POINT.x;
      targetY = DEFAULT_SPAWN_POINT.y;
    }
    const safePos = resolveSafeWalkablePosition(targetX, targetY);
    targetX = safePos.x;
    targetY = safePos.y;
  } else {
    const clampedPos = clampWorldPosition(targetX, targetY);
    targetX = clampedPos.x;
    targetY = clampedPos.y;
  }

  const parsedTime =
    typeof candidate.savedAt === 'string' && Number.isFinite(Date.parse(candidate.savedAt))
      ? candidate.savedAt
      : new Date().toISOString();

  const sanitizedWithoutChecksum: Omit<SaveRecord, 'checksum'> = {
    version: SAVE_SCHEMA_VERSION,
    slotId: candidate.slotId,
    savedAt: parsedTime,
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: {
      x: targetX,
      y: targetY,
      facing: normalizedFacing,
    },
    activeWaystoneId,
    discoveredWaystones,
    discoveredInteractables,
    heroStats: rawHeroStats,
    playTimeSeconds: Math.max(0, Math.floor(candidate.playTimeSeconds)),
  };

  return {
    ...sanitizedWithoutChecksum,
    checksum: computeSaveChecksum(sanitizedWithoutChecksum),
  };
}

/**
 * Unified comparator for determining which of two valid SaveRecords is newer.
 */
export function compareSaveFreshness(a: SaveRecord, b: SaveRecord): number {
  const timeA = Date.parse(a.savedAt) || 0;
  const timeB = Date.parse(b.savedAt) || 0;
  if (timeA !== timeB) {
    return timeA - timeB;
  }

  if (a.playTimeSeconds !== b.playTimeSeconds) {
    return a.playTimeSeconds - b.playTimeSeconds;
  }

  if (a.discoveredWaystones.length !== b.discoveredWaystones.length) {
    return a.discoveredWaystones.length - b.discoveredWaystones.length;
  }

  if (a.discoveredInteractables.length !== b.discoveredInteractables.length) {
    return a.discoveredInteractables.length - b.discoveredInteractables.length;
  }

  return 0;
}

/**
 * Reconciles primary IndexedDB record and LocalStorage backup record using unified freshness rules.
 */
export function reconcileSaveRecords(
  idbRaw: unknown,
  backupRaw: unknown
): SaveReconciliationResult {
  const validIdb = validateAndMigrateSave(idbRaw);
  const validBackup = validateAndMigrateSave(backupRaw);

  if (validIdb && !validBackup) {
    return {
      winner: validIdb,
      source: 'idb',
      needsSyncToIdb: (idbRaw as { version?: number })?.version !== SAVE_SCHEMA_VERSION,
      needsSyncToBackup: true,
    };
  }

  if (!validIdb && validBackup) {
    return {
      winner: validBackup,
      source: 'backup',
      needsSyncToIdb: true,
      needsSyncToBackup: (backupRaw as { version?: number })?.version !== SAVE_SCHEMA_VERSION,
    };
  }

  if (!validIdb && !validBackup) {
    return {
      winner: null,
      source: 'none',
      needsSyncToIdb: false,
      needsSyncToBackup: false,
    };
  }

  const idbRecord = validIdb!;
  const backupRecord = validBackup!;

  const cmp = compareSaveFreshness(backupRecord, idbRecord);

  if (cmp > 0) {
    return {
      winner: backupRecord,
      source: 'backup',
      needsSyncToIdb: true,
      needsSyncToBackup: false,
    };
  }

  if (cmp < 0) {
    return {
      winner: idbRecord,
      source: 'idb',
      needsSyncToIdb: false,
      needsSyncToBackup: true,
    };
  }

  if (idbRecord.checksum === backupRecord.checksum) {
    const idbWasLegacy = (idbRaw as { version?: number })?.version !== SAVE_SCHEMA_VERSION;
    const backupWasLegacy = (backupRaw as { version?: number })?.version !== SAVE_SCHEMA_VERSION;
    return {
      winner: idbRecord,
      source: 'idb',
      needsSyncToIdb: idbWasLegacy,
      needsSyncToBackup: backupWasLegacy,
    };
  }

  return {
    winner: idbRecord,
    source: 'idb',
    needsSyncToIdb: false,
    needsSyncToBackup: true,
  };
}

export interface SaveStorageAdapter {
  readIdb(slotId: string): Promise<unknown>;
  readBackup(): unknown;
  writeStores(
    record: SaveRecord,
    writeIdb: boolean,
    writeBackup: boolean
  ): Promise<{ idbWritten: boolean; backupWritten: boolean }>;
}

export interface LivePlayerStateSnapshot {
  x: number;
  y: number;
  facing: FacingDirection | 'left' | 'right';
  playTimeSeconds: number;
}

export class SaveManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private currentSave: SaveRecord = createInitialSaveRecord();
  private currentSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };
  private operationQueue: Promise<unknown> = Promise.resolve();
  private hasLoadedState = false;
  private adapter?: SaveStorageAdapter;

  constructor(adapter?: SaveStorageAdapter) {
    this.adapter = adapter;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(task, task);
    this.operationQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  }

  async init(): Promise<SaveRecord> {
    this.loadSettings();
    const loaded = await this.loadSave(DEFAULT_SLOT_ID);
    if (loaded) {
      this.currentSave = loaded;
      this.hasLoadedState = true;
      return loaded;
    }
    const initial = createInitialSaveRecord(DEFAULT_SLOT_ID);
    await this.enqueue(async () => {
      await this.writeToStores(initial, true, true);
      this.currentSave = initial;
      this.hasLoadedState = true;
    });
    return initial;
  }

  getCurrentSave(): SaveRecord {
    return {
      ...this.currentSave,
      playerPosition: { ...this.currentSave.playerPosition },
      discoveredWaystones: [...this.currentSave.discoveredWaystones],
      discoveredInteractables: [...this.currentSave.discoveredInteractables],
      heroStats: { ...this.currentSave.heroStats },
    };
  }

  getSettings(): UserSettings {
    return { ...this.currentSettings };
  }

  loadSettings(): UserSettings {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<UserSettings>;
          this.currentSettings = {
            soundEnabled:
              typeof parsed.soundEnabled === 'boolean'
                ? parsed.soundEnabled
                : DEFAULT_USER_SETTINGS.soundEnabled,
            joystickSensitivity:
              typeof parsed.joystickSensitivity === 'number' &&
              Number.isFinite(parsed.joystickSensitivity)
                ? Math.max(0.7, Math.min(1.4, parsed.joystickSensitivity))
                : DEFAULT_USER_SETTINGS.joystickSensitivity,
            showSafeAreaGuide:
              typeof parsed.showSafeAreaGuide === 'boolean'
                ? parsed.showSafeAreaGuide
                : DEFAULT_USER_SETTINGS.showSafeAreaGuide,
            hapticFeedback:
              typeof parsed.hapticFeedback === 'boolean'
                ? parsed.hapticFeedback
                : DEFAULT_USER_SETTINGS.hapticFeedback,
          };
        }
      }
    } catch {
      this.currentSettings = { ...DEFAULT_USER_SETTINGS };
    }
    return this.getSettings();
  }

  updateSettings(patch: Partial<UserSettings>): UserSettings {
    this.currentSettings = {
      ...this.currentSettings,
      ...patch,
    };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.currentSettings));
      }
    } catch {
      // Ignore storage quota errors in private browsing
    }
    return this.getSettings();
  }

  private openDatabase(): Promise<IDBDatabase | null> {
    if (this.dbPromise) {
      return this.dbPromise;
    }
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      return Promise.resolve(null);
    }

    this.dbPromise = new Promise((resolve) => {
      try {
        // Keep IDB container version at 1 so existing stores open without schema upgrade conflicts;
        // record-level version (SAVE_SCHEMA_VERSION = 2) handles document migration.
        const request = window.indexedDB.open(SAVE_DB_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SAVE_STORE_NAME)) {
            db.createObjectStore(SAVE_STORE_NAME, { keyPath: 'slotId' });
          }
        };
        request.onsuccess = () => {
          resolve(request.result);
        };
        request.onerror = () => {
          resolve(null);
        };
      } catch {
        resolve(null);
      }
    });

    return this.dbPromise;
  }

  protected async readFromIdb(slotId: string): Promise<unknown> {
    if (this.adapter) {
      return this.adapter.readIdb(slotId);
    }
    const db = await this.openDatabase();
    if (!db) return null;

    return new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(SAVE_STORE_NAME, 'readonly');
        const store = tx.objectStore(SAVE_STORE_NAME);
        const req = store.get(slotId);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  protected readFromBackup(): unknown {
    if (this.adapter) {
      return this.adapter.readBackup();
    }
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(FALLBACK_SAVE_STORAGE_KEY);
        if (raw) {
          return JSON.parse(raw);
        }
      }
    } catch {
      // Corrupted JSON in localStorage
    }
    return null;
  }

  protected async writeToStores(
    record: SaveRecord,
    writeIdb: boolean,
    writeBackup: boolean
  ): Promise<{ idbWritten: boolean; backupWritten: boolean }> {
    if (this.adapter) {
      return this.adapter.writeStores(record, writeIdb, writeBackup);
    }

    let idbWritten = false;
    let backupWritten = false;

    if (writeIdb) {
      const db = await this.openDatabase();
      if (db) {
        idbWritten = await new Promise<boolean>((resolve) => {
          try {
            const tx = db.transaction(SAVE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SAVE_STORE_NAME);
            store.put(record);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
          } catch {
            resolve(false);
          }
        });
      }
    }

    if (writeBackup) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(FALLBACK_SAVE_STORAGE_KEY, JSON.stringify(record));
          backupWritten = true;
        }
      } catch {
        backupWritten = false;
      }
    }

    return { idbWritten, backupWritten };
  }

  async loadSave(slotId: string = DEFAULT_SLOT_ID): Promise<SaveRecord | null> {
    return this.enqueue(async () => {
      const idbRaw = await this.readFromIdb(slotId);
      const backupRaw = this.readFromBackup();

      const reconciled = reconcileSaveRecords(idbRaw, backupRaw);
      if (!reconciled.winner) {
        return null;
      }

      this.currentSave = reconciled.winner;
      this.hasLoadedState = true;

      if (reconciled.needsSyncToIdb || reconciled.needsSyncToBackup) {
        await this.writeToStores(
          reconciled.winner,
          reconciled.needsSyncToIdb,
          reconciled.needsSyncToBackup
        );
      }

      return this.getCurrentSave();
    });
  }

  async saveGame(partialUpdate?: SavePartialUpdate): Promise<SaveRecord> {
    return this.enqueue(async () => {
      const idbRaw = await this.readFromIdb(this.currentSave.slotId || DEFAULT_SLOT_ID);
      const backupRaw = this.readFromBackup();
      const storedReconciled = reconcileSaveRecords(idbRaw, backupRaw);

      if (
        storedReconciled.winner &&
        (!this.hasLoadedState ||
          compareSaveFreshness(storedReconciled.winner, this.currentSave) > 0)
      ) {
        this.currentSave = storedReconciled.winner;
      }
      this.hasLoadedState = true;

      const prev = this.currentSave;
      const discoveredSet = new Set(prev.discoveredWaystones);
      if (partialUpdate?.discoveredWaystoneId) {
        discoveredSet.add(partialUpdate.discoveredWaystoneId);
      }

      const interactablesSet = new Set(prev.discoveredInteractables);
      if (partialUpdate?.discoveredInteractableId) {
        interactablesSet.add(partialUpdate.discoveredInteractableId);
      }

      let nextHeroStats = { ...prev.heroStats };
      if (partialUpdate?.xpGain && partialUpdate.xpGain > 0) {
        nextHeroStats = applyExperienceGain(nextHeroStats, partialUpdate.xpGain);
      }
      if (partialUpdate?.restoreVitals) {
        nextHeroStats.hp = nextHeroStats.maxHp;
        nextHeroStats.mana = nextHeroStats.maxMana;
      }

      const rawX = partialUpdate?.x ?? prev.playerPosition.x;
      const rawY = partialUpdate?.y ?? prev.playerPosition.y;
      const clamped = clampWorldPosition(rawX, rawY);

      const prevTimestampMs = Date.parse(prev.savedAt) || 0;
      const nextTimestampMs = Math.max(Date.now(), prevTimestampMs + 1);
      const nextPlayTime =
        partialUpdate?.playTimeSeconds !== undefined
          ? Math.max(prev.playTimeSeconds, Math.floor(partialUpdate.playTimeSeconds))
          : prev.playTimeSeconds;

      const nextFacing =
        partialUpdate?.facing !== undefined
          ? normalizeFacingDirection(partialUpdate.facing)
          : prev.playerPosition.facing;

      const nextWithoutChecksum: Omit<SaveRecord, 'checksum'> = {
        version: SAVE_SCHEMA_VERSION,
        slotId: prev.slotId || DEFAULT_SLOT_ID,
        savedAt: new Date(nextTimestampMs).toISOString(),
        regionId: 'ashen_threshold',
        regionName: 'Пепельный Рубеж',
        playerPosition: {
          x: clamped.x,
          y: clamped.y,
          facing: nextFacing,
        },
        activeWaystoneId: partialUpdate?.activeWaystoneId ?? prev.activeWaystoneId,
        discoveredWaystones: Array.from(discoveredSet),
        discoveredInteractables: Array.from(interactablesSet),
        heroStats: nextHeroStats,
        playTimeSeconds: nextPlayTime,
      };

      const nextRecord: SaveRecord = {
        ...nextWithoutChecksum,
        checksum: computeSaveChecksum(nextWithoutChecksum),
      };

      const writeRes = await this.writeToStores(nextRecord, true, true);
      if (
        (typeof window !== 'undefined' || this.adapter) &&
        !writeRes.idbWritten &&
        !writeRes.backupWritten
      ) {
        throw new Error('Не удалось записать сохранение ни в IndexedDB, ни в резервное хранилище');
      }

      this.currentSave = nextRecord;
      return this.getCurrentSave();
    });
  }

  async resetSave(slotId: string = DEFAULT_SLOT_ID): Promise<SaveRecord> {
    return this.enqueue(async () => {
      const fresh = createInitialSaveRecord(slotId);
      const writeRes = await this.writeToStores(fresh, true, true);
      if (
        (typeof window !== 'undefined' || this.adapter) &&
        !writeRes.idbWritten &&
        !writeRes.backupWritten
      ) {
        throw new Error('Не удалось сбросить сохранение в хранилище');
      }
      this.currentSave = fresh;
      this.hasLoadedState = true;
      return this.getCurrentSave();
    });
  }
}

export const saveManager = new SaveManager();

/**
 * Modular coordinator that binds a scene's live character state provider to `save:requested` events
 * without exposing Phaser internals to the UI layer.
 */
export function bindLiveSceneSaveHandler(options: {
  getLiveState: () => LivePlayerStateSnapshot;
  manager?: SaveManager;
  bus?: TypedEventBus;
  onSaved?: (
    updatedSave: SaveRecord,
    nearestWaystone: WaystoneSpec | null,
    source: 'pause_menu' | 'hud_button'
  ) => void;
}): () => void {
  const mgr = options.manager ?? saveManager;
  const targetBus = options.bus ?? eventBus;

  return targetBus.on('save:requested', ({ source }) => {
    let live: LivePlayerStateSnapshot;
    try {
      live = options.getLiveState();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'Не удалось считать координаты сцены';
      targetBus.emit('save:failed', { reason });
      return;
    }

    const nearest = findNearestWaystone(live.x, live.y);
    void mgr
      .saveGame({
        x: live.x,
        y: live.y,
        facing: live.facing,
        playTimeSeconds: live.playTimeSeconds,
        ...(nearest
          ? {
              activeWaystoneId: nearest.id,
              discoveredWaystoneId: nearest.id,
              restoreVitals: true,
            }
          : {}),
      })
      .then((updatedSave) => {
        options.onSaved?.(updatedSave, nearest, source);
        if (nearest) {
          targetBus.emit('waystone:attuned', {
            id: nearest.id,
            name: nearest.name,
            save: updatedSave,
          });
        }
        targetBus.emit('save:completed', updatedSave);
        targetBus.emit('toast:message', {
          text:
            source === 'pause_menu'
              ? `Сохранено в IndexedDB (X: ${updatedSave.playerPosition.x}, Y: ${updatedSave.playerPosition.y}) · FNV-1a #${updatedSave.checksum}`
              : nearest
                ? `Обелиск активирован: ${nearest.name} · Прогресс сохранён`
                : `Локальное сохранение записано (X: ${updatedSave.playerPosition.x}, Y: ${updatedSave.playerPosition.y})`,
          tone: nearest ? 'amber' : 'cyan',
        });
      })
      .catch((err: unknown) => {
        const reason =
          err instanceof Error ? err.message : 'Не удалось записать сохранение в хранилище';
        targetBus.emit('save:failed', { reason });
      });
  });
}
