import test from 'node:test';
import assert from 'node:assert/strict';
import { computeViewportMetrics, screenToLogicalCanvas } from './config';
import {
  checkAABBOverlap,
  clampWorldPosition,
  findNearestWaystone,
  resolveZoneTitle,
  THRESHOLD_PLATFORMS,
  THRESHOLD_WAYSTONES,
  verifyAllPlatformsReachable,
} from '../world/thresholdLayout';
import { computeJoystickVector, inputController } from '../input/InputController';
import {
  bindLiveSceneSaveHandler,
  compareSaveFreshness,
  computeSaveChecksum,
  createInitialSaveRecord,
  reconcileSaveRecords,
  SaveManager,
  validateAndMigrateSave,
  type SaveRecord,
  type SaveStorageAdapter,
} from '../save/SaveManager';
import { TypedEventBus } from './EventBus';
import { ASSET_KEYS, STAGE1_ASSET_MANIFEST } from '../gfx/AssetManifest';
import { isPointWithinExpandedRect } from '../ui/GameShellUI';

function createValidSaveRecord(overrides: {
  savedAt: string;
  x: number;
  y: number;
  facing?: 'left' | 'right';
  playTimeSeconds: number;
  activeWaystoneId?: string;
  discoveredWaystones?: string[];
}): SaveRecord {
  const base: Omit<SaveRecord, 'checksum'> = {
    version: 1,
    slotId: 'slot_1',
    savedAt: overrides.savedAt,
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: {
      x: overrides.x,
      y: overrides.y,
      facing: overrides.facing ?? 'right',
    },
    activeWaystoneId: overrides.activeWaystoneId ?? 'waystone_west',
    discoveredWaystones: overrides.discoveredWaystones ?? ['waystone_west'],
    playTimeSeconds: overrides.playTimeSeconds,
  };
  return {
    ...base,
    checksum: computeSaveChecksum(base),
  };
}

function createMemoryStorageAdapter(initial?: {
  idb?: unknown;
  backup?: unknown;
  failWrites?: boolean;
}): SaveStorageAdapter & {
  idbStore: unknown;
  backupStore: unknown;
  failWrites: boolean;
} {
  const state: {
    idbStore: unknown;
    backupStore: unknown;
    failWrites: boolean;
  } = {
    idbStore: initial?.idb ?? null,
    backupStore: initial?.backup ?? null,
    failWrites: initial?.failWrites ?? false,
  };

  return {
    get idbStore() {
      return state.idbStore;
    },
    set idbStore(v: unknown) {
      state.idbStore = v;
    },
    get backupStore() {
      return state.backupStore;
    },
    set backupStore(v: unknown) {
      state.backupStore = v;
    },
    get failWrites() {
      return state.failWrites;
    },
    set failWrites(v: boolean) {
      state.failWrites = v;
    },
    async readIdb() {
      return state.idbStore;
    },
    readBackup() {
      return state.backupStore;
    },
    async writeStores(record, writeIdb, writeBackup) {
      if (state.failWrites) {
        return { idbWritten: false, backupWritten: false };
      }
      if (writeIdb) {
        state.idbStore = structuredClone(record);
      }
      if (writeBackup) {
        state.backupStore = structuredClone(record);
      }
      return { idbWritten: writeIdb, backupWritten: writeBackup };
    },
  };
}

test('computeViewportMetrics covers all 5 required mobile landscape resolutions and portrait', () => {
  const requiredLandscape = [
    [844, 390],
    [852, 393],
    [932, 430],
    [667, 375],
    [1280, 720],
  ] as const;

  for (const [w, h] of requiredLandscape) {
    const m = computeViewportMetrics(w, h);
    assert.equal(m.isPortrait, false, `Expected ${w}x${h} to be landscape`);
    assert.equal(m.logicalWidth, 1280);
    assert.equal(m.logicalHeight, 720);
    assert.ok(m.scale > 0.45 && m.scale <= 1.0, `Unexpected scale ${m.scale} for ${w}x${h}`);
  }

  const iphonePortrait = computeViewportMetrics(390, 844);
  assert.equal(iphonePortrait.isPortrait, true);
});

test('screenToLogicalCanvas maps client coordinates into 1280x720 space', () => {
  const mapped = screenToLogicalCanvas(500, 250, {
    left: 100,
    top: 50,
    width: 800,
    height: 400,
  });
  assert.equal(mapped.x, 640);
  assert.equal(mapped.y, 360);
});

test('world layout helpers and platform reachability audit pass for all platforms', () => {
  const westWs = THRESHOLD_WAYSTONES[0];
  const near = findNearestWaystone(westWs.x + 25, westWs.y - 30);
  assert.ok(near);
  assert.equal(near.id, 'waystone_west');

  const far = findNearestWaystone(900, 300);
  assert.equal(far, null);

  assert.equal(resolveZoneTitle(300), 'Врата Заката · Западный Бастион');
  assert.equal(resolveZoneTitle(1580), 'Святилище Расколотого Свода');
  assert.equal(resolveZoneTitle(2800), 'Восточный Карниз · Разлом Ветров');

  const clamped = clampWorldPosition(-500, 2500);
  assert.ok(clamped.x >= 78);
  assert.ok(clamped.y <= 722);

  assert.equal(
    checkAABBOverlap(
      { x: 100, y: 100, width: 40, height: 60 },
      { x: 115, y: 110, width: 40, height: 60 }
    ),
    true
  );
  assert.equal(
    checkAABBOverlap(
      { x: 100, y: 100, width: 40, height: 60 },
      { x: 250, y: 100, width: 40, height: 60 }
    ),
    false
  );

  for (const p of THRESHOLD_PLATFORMS) {
    assert.ok(p.height >= 36, `Platform ${p.id} height ${p.height}px is below 36px anti-tunneling floor`);
  }

  const reachability = verifyAllPlatformsReachable();
  assert.equal(
    reachability.reachable,
    true,
    `Unreachable platforms found: ${reachability.unreachableIds.join(', ')}`
  );
});

test('computeJoystickVector and multi-touch simultaneous joystick + jump/dash work without conflict', () => {
  const insideDeadzone = computeJoystickVector(3, 2, 52, 0.14, 1.0);
  assert.equal(insideDeadzone.x, 0);
  assert.equal(insideDeadzone.y, 0);
  assert.equal(insideDeadzone.magnitude, 0);

  const fullRight = computeJoystickVector(80, 0, 52, 0.14, 1.0);
  assert.equal(fullRight.x, 1);
  assert.equal(fullRight.y, 0);
  assert.equal(fullRight.magnitude, 1);
  assert.equal(fullRight.knobOffsetX, 52);

  inputController.clearAllInputs();
  inputController.setJoystickState(fullRight);
  inputController.triggerTouchJump(true);
  inputController.triggerTouchDash();

  const frame1 = inputController.consumeFrameInput();
  assert.equal(frame1.moveX, 1);
  assert.equal(frame1.jumpHeld, true);
  assert.equal(frame1.jumpJustPressed, true);
  assert.equal(frame1.dashJustPressed, true);

  const frame2 = inputController.consumeFrameInput();
  assert.equal(frame2.moveX, 1);
  assert.equal(frame2.jumpHeld, true);
  assert.equal(frame2.jumpJustPressed, false);
  assert.equal(frame2.dashJustPressed, false);

  inputController.triggerTouchJump(false);
  const frame3 = inputController.consumeFrameInput();
  assert.equal(frame3.moveX, 1);
  assert.equal(frame3.jumpHeld, false);

  inputController.clearAllInputs();
});

test('isPointWithinExpandedRect detects when a thumb slides outside a touch button', () => {
  const btnRect = { left: 700, top: 280, right: 780, bottom: 360 };
  assert.equal(isPointWithinExpandedRect(740, 320, btnRect, 24), true);
  assert.equal(isPointWithinExpandedRect(795, 320, btnRect, 24), true);
  assert.equal(isPointWithinExpandedRect(620, 320, btnRect, 24), false);
});

test('SaveManager strictly verifies FNV-1a checksum and rejects corrupted records', () => {
  const initial = createInitialSaveRecord('slot_1');
  assert.equal(initial.version, 1);
  assert.equal(initial.checksum.length, 8);

  const validated = validateAndMigrateSave(initial);
  assert.ok(validated);
  assert.equal(validated.checksum, initial.checksum);

  const tampered = {
    ...initial,
    playerPosition: { x: 1450, y: 550, facing: 'left' as const },
  };
  assert.equal(validateAndMigrateSave(tampered), null);

  const badHash = {
    ...initial,
    checksum: 'deadbeef',
  };
  assert.equal(validateAndMigrateSave(badHash), null);
});

// ============================================================================
// INDEPENDENT REVIEW MANDATORY TEST SCENARIOS (1..7)
// ============================================================================

test('Scenario 1: Backup is newer than IndexedDB while playTimeSeconds is identical', async () => {
  const olderIdb = createValidSaveRecord({
    savedAt: '2026-11-07T12:00:00.000Z',
    x: 420,
    y: 700,
    facing: 'right',
    playTimeSeconds: 120,
    discoveredWaystones: ['waystone_west'],
  });

  // Saved 10 seconds later while paused (or within same second of playTimeSeconds = 120)
  const newerBackupSamePlayTime = createValidSaveRecord({
    savedAt: '2026-11-07T12:00:10.000Z',
    x: 980,
    y: 540,
    facing: 'left',
    playTimeSeconds: 120,
    activeWaystoneId: 'waystone_sanctuary',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
  });

  assert.ok(compareSaveFreshness(newerBackupSamePlayTime, olderIdb) > 0);

  const rec = reconcileSaveRecords(olderIdb, newerBackupSamePlayTime);
  assert.equal(rec.source, 'backup');
  assert.equal(rec.needsSyncToIdb, true);
  assert.equal(rec.needsSyncToBackup, false);
  assert.equal(rec.winner?.playerPosition.x, 980);
  assert.equal(rec.winner?.discoveredWaystones.length, 2);

  // Verify SaveManager.saveGame() also honors the newer backup even when playTimeSeconds is equal
  const adapter = createMemoryStorageAdapter({
    idb: olderIdb,
    backup: olderIdb,
  });
  const mgr = new SaveManager(adapter);
  await mgr.loadSave();
  assert.equal(mgr.getCurrentSave().playerPosition.x, 420);

  // Now simulate backup store holding a newer record with identical playTimeSeconds (120s)
  adapter.backupStore = newerBackupSamePlayTime;
  const saved = await mgr.saveGame({ x: 1050 });
  assert.equal(saved.playerPosition.x, 1050);
  assert.equal(saved.playerPosition.y, 540);
  assert.equal(saved.playerPosition.facing, 'left');
  assert.deepEqual(saved.discoveredWaystones, ['waystone_west', 'waystone_sanctuary']);
});

test('Scenario 2: IndexedDB is newer than backup', async () => {
  const newerIdb = createValidSaveRecord({
    savedAt: '2026-11-07T12:05:00.000Z',
    x: 1580,
    y: 515,
    facing: 'left',
    playTimeSeconds: 240,
    activeWaystoneId: 'waystone_sanctuary',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
  });

  const staleBackup = createValidSaveRecord({
    savedAt: '2026-11-07T12:01:00.000Z',
    x: 420,
    y: 700,
    facing: 'right',
    playTimeSeconds: 60,
    discoveredWaystones: ['waystone_west'],
  });

  const rec = reconcileSaveRecords(newerIdb, staleBackup);
  assert.equal(rec.source, 'idb');
  assert.equal(rec.needsSyncToIdb, false);
  assert.equal(rec.needsSyncToBackup, true);
  assert.equal(rec.winner?.playerPosition.x, 1580);

  const adapter = createMemoryStorageAdapter({ idb: newerIdb, backup: staleBackup });
  const mgr = new SaveManager(adapter);
  const loaded = await mgr.loadSave();
  assert.ok(loaded);
  assert.equal(loaded.playerPosition.x, 1580);
  assert.equal((adapter.backupStore as SaveRecord).playerPosition.x, 1580);
});

test('Scenario 3: Both records have identical savedAt timestamp and playTimeSeconds', () => {
  const recA = createValidSaveRecord({
    savedAt: '2026-11-07T12:10:00.000Z',
    x: 720,
    y: 700,
    facing: 'right',
    playTimeSeconds: 95,
  });
  const recAClone = structuredClone(recA);

  // 3a: Identical content & checksum -> no unnecessary sync writes
  const identical = reconcileSaveRecords(recA, recAClone);
  assert.equal(identical.source, 'idb');
  assert.equal(identical.needsSyncToIdb, false);
  assert.equal(identical.needsSyncToBackup, false);
  assert.equal(identical.winner?.checksum, recA.checksum);

  // 3b: Identical timestamp and playTimeSeconds, but conflicting coordinates -> primary IndexedDB wins and syncs backup
  const conflictingBackup = createValidSaveRecord({
    savedAt: '2026-11-07T12:10:00.000Z',
    x: 840,
    y: 700,
    facing: 'left',
    playTimeSeconds: 95,
  });
  const conflictResolved = reconcileSaveRecords(recA, conflictingBackup);
  assert.equal(conflictResolved.source, 'idb');
  assert.equal(conflictResolved.needsSyncToIdb, false);
  assert.equal(conflictResolved.needsSyncToBackup, true);
  assert.equal(conflictResolved.winner?.playerPosition.x, 720);
});

test('Scenario 4: One record is corrupted (corrupted IDB or corrupted Backup)', async () => {
  const healthyRecord = createValidSaveRecord({
    savedAt: '2026-11-07T12:15:00.000Z',
    x: 1320,
    y: 620,
    facing: 'right',
    playTimeSeconds: 180,
  });
  const corruptedRecord = {
    ...healthyRecord,
    playerPosition: { x: 9999, y: 9999, facing: 'left' },
    // checksum mismatch!
  };

  // 4a: Corrupted IDB + healthy Backup -> Backup wins and heals IDB
  const fromBackup = reconcileSaveRecords(corruptedRecord, healthyRecord);
  assert.equal(fromBackup.source, 'backup');
  assert.equal(fromBackup.needsSyncToIdb, true);
  assert.equal(fromBackup.needsSyncToBackup, false);
  assert.equal(fromBackup.winner?.playerPosition.x, 1320);

  // 4b: Healthy IDB + corrupted Backup -> IDB wins and heals Backup
  const fromIdb = reconcileSaveRecords(healthyRecord, corruptedRecord);
  assert.equal(fromIdb.source, 'idb');
  assert.equal(fromIdb.needsSyncToIdb, false);
  assert.equal(fromIdb.needsSyncToBackup, true);
  assert.equal(fromIdb.winner?.playerPosition.x, 1320);
});

test('Scenario 5: Both records are corrupted', async () => {
  const valid = createInitialSaveRecord('slot_1');
  const corruptedIdb = { ...valid, checksum: 'bad00001' };
  const corruptedBackup = { ...valid, playerPosition: { x: 2100, y: 400, facing: 'left' } };

  const res = reconcileSaveRecords(corruptedIdb, corruptedBackup);
  assert.equal(res.winner, null);
  assert.equal(res.source, 'none');
  assert.equal(res.needsSyncToIdb, false);
  assert.equal(res.needsSyncToBackup, false);

  const adapter = createMemoryStorageAdapter({
    idb: corruptedIdb,
    backup: corruptedBackup,
  });
  const mgr = new SaveManager(adapter);
  const loaded = await mgr.loadSave();
  assert.equal(loaded, null);

  // init() creates a clean valid initial record when both stores are corrupted
  const initialized = await mgr.init();
  assert.ok(validateAndMigrateSave(initialized));
  assert.equal(initialized.playerPosition.x, 340);
});

test('Scenario 6: Multiple saves occurring sequentially and concurrently preserve order and data', async () => {
  const adapter = createMemoryStorageAdapter();
  const mgr = new SaveManager(adapter);
  await mgr.init();

  // Trigger 4 saves concurrently without awaiting intermediate steps
  const [s1, s2, s3, s4] = await Promise.all([
    mgr.saveGame({ x: 500, y: 700, facing: 'right', playTimeSeconds: 10 }),
    mgr.saveGame({
      x: 1100,
      y: 580,
      facing: 'left',
      discoveredWaystoneId: 'waystone_sanctuary',
      playTimeSeconds: 25,
    }),
    mgr.saveGame({
      x: 1850,
      y: 460,
      facing: 'right',
      discoveredWaystoneId: 'waystone_east',
      playTimeSeconds: 40,
    }),
    mgr.saveGame({
      x: 2420,
      y: 520,
      facing: 'left',
      activeWaystoneId: 'waystone_east',
      playTimeSeconds: 55,
    }),
  ]);

  // Verify strictly monotonic timestamps across rapid consecutive saves
  const t1 = Date.parse(s1.savedAt);
  const t2 = Date.parse(s2.savedAt);
  const t3 = Date.parse(s3.savedAt);
  const t4 = Date.parse(s4.savedAt);
  assert.ok(t1 < t2 && t2 < t3 && t3 < t4, 'Expected strictly increasing savedAt timestamps');

  // Verify final persisted state contains all accumulated waystones and latest coordinates
  assert.equal(s4.playerPosition.x, 2420);
  assert.equal(s4.playerPosition.y, 520);
  assert.equal(s4.playerPosition.facing, 'left');
  assert.equal(s4.playTimeSeconds, 55);
  assert.equal(s4.activeWaystoneId, 'waystone_east');
  assert.deepEqual(
    new Set(s4.discoveredWaystones),
    new Set(['waystone_west', 'waystone_sanctuary', 'waystone_east'])
  );

  const persistedIdb = adapter.idbStore as SaveRecord;
  assert.equal(persistedIdb.checksum, s4.checksum);
  assert.equal(persistedIdb.playerPosition.x, 2420);
});

test('Scenario 7: Manual save from Pause Menu records live character coordinates, facing, and playTimeSeconds and handles errors', async () => {
  const adapter = createMemoryStorageAdapter();
  const mgr = new SaveManager(adapter);
  const bus = new TypedEventBus();
  await mgr.init();

  // Initial save starts at West Waystone (X=340, Y=700, facing='right', playTimeSeconds=0)
  assert.equal(mgr.getCurrentSave().playerPosition.x, 340);

  // Simulate character moving across the scene before opening the Pause Menu
  const liveSceneCharacter = {
    x: 1465.4,
    y: 528.2,
    facing: 'left' as const,
    playTimeSeconds: 87.8,
  };

  let completedSave: SaveRecord | null = null;
  let failedReason: string | null = null;

  bus.on('save:completed', (record) => {
    completedSave = record;
  });
  bus.on('save:failed', ({ reason }) => {
    failedReason = reason;
  });

  const unsubscribe = bindLiveSceneSaveHandler({
    getLiveState: () => liveSceneCharacter,
    manager: mgr,
    bus,
  });

  // Trigger Pause Menu manual save button event (exact event emitted by #btn-pause-save-now)
  bus.emit('save:requested', { source: 'pause_menu' });

  // Wait for queued save operation to settle
  await mgr.loadSave();

  assert.ok(completedSave, 'Expected save:completed event to fire');
  const saved = completedSave as SaveRecord;
  assert.equal(saved.playerPosition.x, 1465);
  assert.equal(saved.playerPosition.y, 528);
  assert.equal(saved.playerPosition.facing, 'left');
  assert.equal(saved.playTimeSeconds, 87);
  assert.equal(failedReason, null);

  // Verify persisted record in IndexedDB matches the live character position
  const idbRecord = adapter.idbStore as SaveRecord;
  assert.equal(idbRecord.playerPosition.x, 1465);
  assert.equal(idbRecord.playerPosition.y, 528);
  assert.equal(idbRecord.playerPosition.facing, 'left');
  assert.equal(idbRecord.playTimeSeconds, 87);

  // Now simulate storage failure and verify save:failed is emitted without overwriting completedSave
  adapter.failWrites = true;
  liveSceneCharacter.x = 1900;
  bus.emit('save:requested', { source: 'pause_menu' });

  await new Promise((r) => setTimeout(r, 15));
  assert.ok(failedReason, 'Expected save:failed event when storage write fails');
  assert.equal(mgr.getCurrentSave().playerPosition.x, 1465);

  unsubscribe();
});

test('AssetManifest declares all 13 required Stage 1 texture keys without duplicates', () => {
  const keys = STAGE1_ASSET_MANIFEST.map((a) => a.key);
  const uniqueKeys = new Set(keys);
  assert.equal(keys.length, Object.keys(ASSET_KEYS).length);
  assert.equal(uniqueKeys.size, keys.length);
});

