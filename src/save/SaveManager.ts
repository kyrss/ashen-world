import { clampWorldPosition, THRESHOLD_WAYSTONES } from '../world/thresholdLayout';

export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_DB_NAME = 'ashen_world_db';
export const SAVE_STORE_NAME = 'saves';
export const DEFAULT_SLOT_ID = 'slot_1';
export const SETTINGS_STORAGE_KEY = 'ashen_world_settings_v1';
export const FALLBACK_SAVE_STORAGE_KEY = 'ashen_world_save_backup_v1';

export interface SaveRecord {
  version: number;
  slotId: string;
  savedAt: string;
  regionId: string;
  regionName: string;
  playerPosition: {
    x: number;
    y: number;
    facing: 'left' | 'right';
  };
  activeWaystoneId: string;
  discoveredWaystones: string[];
  playTimeSeconds: number;
  checksum: string; // 32-bit FNV-1a hex digest
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

/**
 * Computes a deterministic 32-bit FNV-1a hex checksum over the core save fields
 * to guard against corrupted or truncated local saves.
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
    t: Math.floor(payload.playTimeSeconds),
  });

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createInitialSaveRecord(slotId: string = DEFAULT_SLOT_ID): SaveRecord {
  const startWaystone = THRESHOLD_WAYSTONES[0];
  const clamped = clampWorldPosition(startWaystone.x, startWaystone.y - 40);
  const base: Omit<SaveRecord, 'checksum'> = {
    version: SAVE_SCHEMA_VERSION,
    slotId,
    savedAt: new Date().toISOString(),
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: {
      x: clamped.x,
      y: clamped.y,
      facing: 'right',
    },
    activeWaystoneId: startWaystone.id,
    discoveredWaystones: [startWaystone.id],
    playTimeSeconds: 0,
  };

  return {
    ...base,
    checksum: computeSaveChecksum(base),
  };
}

/**
 * Strictly validates a raw save object loaded from IndexedDB or LocalStorage backup.
 * 1. Verifies structural fields and schema version (1..SAVE_SCHEMA_VERSION).
 * 2. For current-version records, verifies that the stored FNV-1a checksum matches the raw payload.
 *    If the checksum does not match, returns null so corrupted data is rejected.
 * 3. For legacy schema versions (< SAVE_SCHEMA_VERSION), migrates fields and computes a new v1 checksum.
 * 4. Clamps out-of-bounds world coordinates and returns a sanitized SaveRecord.
 */
export function validateAndMigrateSave(raw: unknown): SaveRecord | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const candidate = raw as Partial<SaveRecord>;
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

  const validWaystoneIds = new Set(THRESHOLD_WAYSTONES.map((w) => w.id));
  if (!Array.isArray(candidate.discoveredWaystones)) {
    return null;
  }

  const rawFacing = candidate.playerPosition.facing === 'left' ? 'left' : 'right';
  const rawActiveWs =
    typeof candidate.activeWaystoneId === 'string'
      ? candidate.activeWaystoneId
      : THRESHOLD_WAYSTONES[0].id;
  const rawRegionId =
    typeof candidate.regionId === 'string' ? candidate.regionId : 'ashen_threshold';

  // Strict FNV-1a integrity verification for current schema version
  if (candidate.version === SAVE_SCHEMA_VERSION) {
    if (typeof candidate.checksum !== 'string' || candidate.checksum.length !== 8) {
      return null;
    }

    const rawCanonicalPayload: Omit<SaveRecord, 'checksum'> = {
      version: candidate.version,
      slotId: candidate.slotId,
      savedAt: typeof candidate.savedAt === 'string' ? candidate.savedAt : '',
      regionId: rawRegionId,
      regionName: typeof candidate.regionName === 'string' ? candidate.regionName : 'Пепельный Рубеж',
      playerPosition: {
        x: candidate.playerPosition.x,
        y: candidate.playerPosition.y,
        facing: rawFacing,
      },
      activeWaystoneId: rawActiveWs,
      discoveredWaystones: candidate.discoveredWaystones.filter(
        (id): id is string => typeof id === 'string'
      ),
      playTimeSeconds: candidate.playTimeSeconds,
    };

    const computedRawHash = computeSaveChecksum(rawCanonicalPayload);
    if (computedRawHash !== candidate.checksum) {
      return null;
    }
  }

  // Sanitize discovered waystones and clamp world position into safe bounds
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

  const clampedPos = clampWorldPosition(candidate.playerPosition.x, candidate.playerPosition.y);
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
      x: clampedPos.x,
      y: clampedPos.y,
      facing: rawFacing,
    },
    activeWaystoneId,
    discoveredWaystones,
    playTimeSeconds: Math.max(0, Math.floor(candidate.playTimeSeconds)),
  };

  return {
    ...sanitizedWithoutChecksum,
    checksum: computeSaveChecksum(sanitizedWithoutChecksum),
  };
}

/**
 * Reconciles primary IndexedDB record and LocalStorage backup record:
 * - Never allows a corrupted record to overwrite a healthy backup.
 * - If both records are valid, selects the fresher one (by savedAt timestamp and playTimeSeconds)
 *   and flags the lagging store for synchronization.
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
      needsSyncToIdb: false,
      needsSyncToBackup: true,
    };
  }

  if (!validIdb && validBackup) {
    return {
      winner: validBackup,
      source: 'backup',
      needsSyncToIdb: true,
      needsSyncToBackup: false,
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

  // Both validIdb and validBackup exist; compare freshness
  const idbRecord = validIdb!;
  const backupRecord = validBackup!;

  if (idbRecord.checksum === backupRecord.checksum && idbRecord.savedAt === backupRecord.savedAt) {
    return {
      winner: idbRecord,
      source: 'idb',
      needsSyncToIdb: false,
      needsSyncToBackup: false,
    };
  }

  const idbTime = Date.parse(idbRecord.savedAt) || 0;
  const backupTime = Date.parse(backupRecord.savedAt) || 0;

  const backupIsNewer =
    backupTime > idbTime ||
    (backupTime === idbTime && backupRecord.playTimeSeconds > idbRecord.playTimeSeconds);

  if (backupIsNewer) {
    return {
      winner: backupRecord,
      source: 'backup',
      needsSyncToIdb: true,
      needsSyncToBackup: false,
    };
  }

  return {
    winner: idbRecord,
    source: 'idb',
    needsSyncToIdb: false,
    needsSyncToBackup: true,
  };
}

class SaveManager {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private currentSave: SaveRecord = createInitialSaveRecord();
  private currentSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };

  async init(): Promise<SaveRecord> {
    this.loadSettings();
    const loaded = await this.loadSave(DEFAULT_SLOT_ID);
    if (loaded) {
      this.currentSave = loaded;
      return loaded;
    }
    const initial = createInitialSaveRecord(DEFAULT_SLOT_ID);
    await this.writeToStores(initial, true, true);
    this.currentSave = initial;
    return initial;
  }

  getCurrentSave(): SaveRecord {
    return this.currentSave;
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
        const request = window.indexedDB.open(SAVE_DB_NAME, SAVE_SCHEMA_VERSION);
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

  private async readFromIdb(slotId: string): Promise<unknown> {
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

  private readFromBackup(): unknown {
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

  private async writeToStores(
    record: SaveRecord,
    writeIdb: boolean,
    writeBackup: boolean
  ): Promise<void> {
    if (writeIdb) {
      const db = await this.openDatabase();
      if (db) {
        await new Promise<void>((resolve) => {
          try {
            const tx = db.transaction(SAVE_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SAVE_STORE_NAME);
            store.put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        });
      }
    }

    if (writeBackup) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(FALLBACK_SAVE_STORAGE_KEY, JSON.stringify(record));
        }
      } catch {
        // Ignore storage quota error
      }
    }
  }

  async loadSave(slotId: string = DEFAULT_SLOT_ID): Promise<SaveRecord | null> {
    const idbRaw = await this.readFromIdb(slotId);
    const backupRaw = this.readFromBackup();

    const reconciled = reconcileSaveRecords(idbRaw, backupRaw);
    if (!reconciled.winner) {
      return null;
    }

    this.currentSave = reconciled.winner;

    // Heal whichever storage was missing, corrupted, or stale
    if (reconciled.needsSyncToIdb || reconciled.needsSyncToBackup) {
      await this.writeToStores(
        reconciled.winner,
        reconciled.needsSyncToIdb,
        reconciled.needsSyncToBackup
      );
    }

    return reconciled.winner;
  }

  async saveGame(partialUpdate?: {
    x?: number;
    y?: number;
    facing?: 'left' | 'right';
    activeWaystoneId?: string;
    discoveredWaystoneId?: string;
    playTimeSeconds?: number;
  }): Promise<SaveRecord> {
    // Reconcile against any newer backup before writing so we never clobber fresher data
    const existingBackup = validateAndMigrateSave(this.readFromBackup());
    if (existingBackup) {
      const currTime = Date.parse(this.currentSave.savedAt) || 0;
      const backTime = Date.parse(existingBackup.savedAt) || 0;
      if (backTime > currTime && existingBackup.playTimeSeconds > this.currentSave.playTimeSeconds) {
        this.currentSave = existingBackup;
      }
    }

    const prev = this.currentSave;
    const discoveredSet = new Set(prev.discoveredWaystones);
    if (partialUpdate?.discoveredWaystoneId) {
      discoveredSet.add(partialUpdate.discoveredWaystoneId);
    }

    const rawX = partialUpdate?.x ?? prev.playerPosition.x;
    const rawY = partialUpdate?.y ?? prev.playerPosition.y;
    const clamped = clampWorldPosition(rawX, rawY);

    // Guarantee monotonically non-decreasing timestamp and playTimeSeconds
    const prevTimestampMs = Date.parse(prev.savedAt) || 0;
    const nextTimestampMs = Math.max(Date.now(), prevTimestampMs + 1);
    const nextPlayTime =
      partialUpdate?.playTimeSeconds !== undefined
        ? Math.max(prev.playTimeSeconds, Math.floor(partialUpdate.playTimeSeconds))
        : prev.playTimeSeconds;

    const nextWithoutChecksum: Omit<SaveRecord, 'checksum'> = {
      version: SAVE_SCHEMA_VERSION,
      slotId: prev.slotId || DEFAULT_SLOT_ID,
      savedAt: new Date(nextTimestampMs).toISOString(),
      regionId: 'ashen_threshold',
      regionName: 'Пепельный Рубеж',
      playerPosition: {
        x: clamped.x,
        y: clamped.y,
        facing: partialUpdate?.facing ?? prev.playerPosition.facing,
      },
      activeWaystoneId: partialUpdate?.activeWaystoneId ?? prev.activeWaystoneId,
      discoveredWaystones: Array.from(discoveredSet),
      playTimeSeconds: nextPlayTime,
    };

    const nextRecord: SaveRecord = {
      ...nextWithoutChecksum,
      checksum: computeSaveChecksum(nextWithoutChecksum),
    };

    this.currentSave = nextRecord;
    await this.writeToStores(nextRecord, true, true);

    return nextRecord;
  }

  async resetSave(slotId: string = DEFAULT_SLOT_ID): Promise<SaveRecord> {
    const fresh = createInitialSaveRecord(slotId);
    this.currentSave = fresh;
    await this.writeToStores(fresh, true, true);
    return fresh;
  }
}

export const saveManager = new SaveManager();
