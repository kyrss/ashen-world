import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_FACING_DIRECTIONS,
  computeViewportMetrics,
  computeYSortDepth,
  normalizeMovementVector,
  resolveFacingDirection,
  screenToLogicalCanvas,
  type FacingDirection,
} from './config';
import {
  checkAABBOverlap,
  clampWorldPosition,
  DEFAULT_SPAWN_POINT,
  findNearestInteractable,
  findNearestWaystone,
  isPositionWalkable,
  resolveSafeWalkablePosition,
  resolveZoneTitle,
  THRESHOLD_INTERACTABLES,
  THRESHOLD_WAYSTONES,
} from '../world/thresholdLayout';
import { computeJoystickVector, inputController } from '../input/InputController';
import {
  applyExperienceGain,
  bindLiveSceneSaveHandler,
  compareSaveFreshness,
  computeLegacyV1Checksum,
  computeSaveChecksum,
  createInitialSaveRecord,
   DEFAULT_HERO_STATS,
  reconcileSaveRecords,
  SaveManager,
  SAVE_SCHEMA_VERSION,
  validateAndMigrateSave,
  type SaveRecord,
  type SaveStorageAdapter,
} from '../save/SaveManager';
import { TypedEventBus } from './EventBus';
import {
  ASSET_KEYS,
  ASSET_MANIFEST,
  getHeroAnimationFrameIndices,
  getHeroAnimKey,
} from '../gfx/AssetManifest';
import { isPointWithinExpandedRect } from '../ui/GameShellUI';

function createValidSaveRecord(overrides: {
  savedAt: string;
  x: number;
  y: number;
  facing?: FacingDirection;
  playTimeSeconds: number;
  activeWaystoneId?: string;
  discoveredWaystones?: string[];
  discoveredInteractables?: string[];
}): SaveRecord {
  const base: Omit<SaveRecord, 'checksum'> = {
    version: SAVE_SCHEMA_VERSION,
    slotId: 'slot_1',
    savedAt: overrides.savedAt,
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: {
      x: overrides.x,
      y: overrides.y,
      facing: overrides.facing ?? 'e',
    },
    activeWaystoneId: overrides.activeWaystoneId ?? 'waystone_west',
    discoveredWaystones: overrides.discoveredWaystones ?? ['waystone_west'],
    discoveredInteractables: overrides.discoveredInteractables ?? [],
    heroStats: { ...DEFAULT_HERO_STATS },
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

test('8-directional movement normalization and facing resolution work across all 8 octants', () => {
  // Cardinal directions
  assert.equal(resolveFacingDirection(0, 1, 's'), 's');
  assert.equal(resolveFacingDirection(1, 0, 's'), 'e');
  assert.equal(resolveFacingDirection(0, -1, 's'), 'n');
  assert.equal(resolveFacingDirection(-1, 0, 's'), 'w');

  // Diagonal directions
  assert.equal(resolveFacingDirection(1, 1, 's'), 'se');
  assert.equal(resolveFacingDirection(1, -1, 's'), 'ne');
  assert.equal(resolveFacingDirection(-1, -1, 's'), 'nw');
  assert.equal(resolveFacingDirection(-1, 1, 's'), 'sw');

  // Diagonal speed normalization: (1, 1) must normalize to magnitude 1.0 (~0.7071 per axis)
  const diag = normalizeMovementVector(1, 1);
  assert.equal(diag.magnitude, 1);
  assert.ok(Math.abs(diag.vx - Math.SQRT1_2) < 0.001);
  assert.ok(Math.abs(diag.vy - Math.SQRT1_2) < 0.001);
  assert.ok(Math.hypot(diag.vx, diag.vy) <= 1.0001);

  // Proportional analog thumbstick input (< 1.0) is preserved without boosting to 1.0
  const halfStick = normalizeMovementVector(0.5, 0);
  assert.equal(halfStick.vx, 0.5);
  assert.equal(halfStick.vy, 0);
  assert.equal(halfStick.magnitude, 0.5);
});

test('InputController normalizes diagonal keyboard and virtual joystick movement in all 8 directions', () => {
  inputController.clearAllInputs();

  // Simulate pressing W + D (North-East diagonal)
  inputController.setKeyDownState('KeyW', true);
  inputController.setKeyDownState('KeyD', true);
  const neSnap = inputController.consumeFrameInput();
  assert.ok(neSnap.moveX > 0.7 && neSnap.moveX < 0.71);
  assert.ok(neSnap.moveY < -0.7 && neSnap.moveY > -0.71);
  assert.equal(neSnap.magnitude, 1);
  assert.equal(resolveFacingDirection(neSnap.moveX, neSnap.moveY), 'ne');

  inputController.clearAllInputs();

  // Simulate virtual joystick South-West diagonal + contextual interact press
  const swStick = computeJoystickVector(-50, 50, 52, 0.14, 1.0);
  inputController.setJoystickState(swStick);
  inputController.triggerTouchInteract();

  const swSnap = inputController.consumeFrameInput();
  assert.ok(swSnap.moveX < -0.7 && swSnap.moveY > 0.7);
  assert.ok(swSnap.magnitude > 0.999 && swSnap.magnitude <= 1);
  assert.equal(swSnap.interactJustPressed, true);
  assert.equal(resolveFacingDirection(swSnap.moveX, swSnap.moveY), 'sw');

  // Next frame: interact edge is cleared while joystick remains active
  const nextSnap = inputController.consumeFrameInput();
  assert.equal(nextSnap.interactJustPressed, false);
  assert.ok(nextSnap.magnitude > 0.999 && nextSnap.magnitude <= 1);

  inputController.clearAllInputs();
});

test('computeYSortDepth orders hero correctly behind and in front of 2D RPG world objects', () => {
  const treeFootY = 690;
  const heroNorthOfTreeY = 655; // hero walks behind tree canopy
  const heroSouthOfTreeY = 720; // hero walks in front of tree trunk

  const treeDepth = computeYSortDepth(treeFootY);
  const heroBehindDepth = computeYSortDepth(heroNorthOfTreeY);
  const heroFrontDepth = computeYSortDepth(heroSouthOfTreeY);

  assert.ok(
    heroBehindDepth < treeDepth,
    'Hero north of tree must have smaller depth (render behind canopy)'
  );
  assert.ok(
    heroFrontDepth > treeDepth,
    'Hero south of tree must have larger depth (render in front of trunk)'
  );
});

test('2D RPG world layout, zones, waystones, interactables, and walkability pass', () => {
  assert.equal(isPositionWalkable(DEFAULT_SPAWN_POINT.x, DEFAULT_SPAWN_POINT.y), true);

  const westWs = THRESHOLD_WAYSTONES[0];
  const nearWs = findNearestWaystone(westWs.x + 30, westWs.y + 30);
  assert.ok(nearWs);
  assert.equal(nearWs.id, 'waystone_west');

  const kaelen = THRESHOLD_INTERACTABLES[0];
  const nearNpc = findNearestInteractable(kaelen.x, kaelen.y + 40);
  assert.ok(nearNpc);
  assert.equal(nearNpc.id, 'npc_warden_kaelen');

  assert.equal(resolveZoneTitle(420, 860), 'Врата Заката · Западный Тракт');
  assert.equal(resolveZoneTitle(1250, 410), 'Святилище Расколотого Свода');
  assert.equal(resolveZoneTitle(1250, 960), "Лагерь Дозорных Вел'Ариса");
  assert.equal(resolveZoneTitle(2040, 880), 'Роща Пепельных Древ · Восточный Карниз');

  // Verify approach points just south of every Waystone and Interactable are walkable
  for (const ws of THRESHOLD_WAYSTONES) {
    assert.equal(
      isPositionWalkable(ws.x, ws.y + 38),
      true,
      `Expected approach point south of ${ws.id} to be walkable`
    );
  }

  for (const item of THRESHOLD_INTERACTABLES) {
    assert.equal(
      isPositionWalkable(item.x, item.y + 36),
      true,
      `Expected approach point south of ${item.id} to be walkable`
    );
  }

  assert.equal(
    checkAABBOverlap(
      { x: 100, y: 100, width: 40, height: 60 },
      { x: 115, y: 110, width: 40, height: 60 }
    ),
    true
  );
});

test('Hero 48-frame 8-directional spritesheet frame indices and animation keys are unique and complete', () => {
  const seenFrames = new Set<number>();

  for (const dir of ALL_FACING_DIRECTIONS) {
    const info = getHeroAnimationFrameIndices(dir);
    assert.equal(info.idleFrames.length, 2);
    assert.equal(info.walkFrames.length, 4);
    assert.equal(getHeroAnimKey('idle', dir), `hero-idle-${dir}`);
    assert.equal(getHeroAnimKey('walk', dir), `hero-walk-${dir}`);

    for (const f of [...info.idleFrames, ...info.walkFrames]) {
      assert.ok(f >= 0 && f < 48, `Frame index ${f} out of bounds 0..47`);
      assert.equal(seenFrames.has(f), false, `Duplicate frame index ${f}`);
      seenFrames.add(f);
    }
  }

  assert.equal(seenFrames.size, 48);
});

test('SaveManager migrates valid v1 platformer saves to v2 RPG schema and rejects tampered v1/v2 saves', () => {
  const v1Payload = {
    version: 1,
    slotId: 'slot_1',
    savedAt: '2026-11-07T10:00:00.000Z',
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: { x: 340, y: 700, facing: 'left' as const },
    activeWaystoneId: 'waystone_west',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
    playTimeSeconds: 145,
  };
  const validV1Record = {
    ...v1Payload,
    checksum: computeLegacyV1Checksum(v1Payload),
  };

  const migrated = validateAndMigrateSave(validV1Record);
  assert.ok(migrated, 'Valid v1 record should migrate cleanly to v2');
  assert.equal(migrated.version, 2);
  assert.equal(migrated.playerPosition.facing, 'w');
  assert.equal(migrated.playerPosition.x, DEFAULT_SPAWN_POINT.x);
  assert.equal(migrated.playerPosition.y, DEFAULT_SPAWN_POINT.y);
  assert.equal(isPositionWalkable(migrated.playerPosition.x, migrated.playerPosition.y), true);
  assert.deepEqual(migrated.discoveredWaystones, ['waystone_west', 'waystone_sanctuary']);
  assert.equal(migrated.heroStats.level, 1);

  // Tampered v1 record must be rejected
  const tamperedV1 = {
    ...validV1Record,
    playerPosition: { x: 999, y: 700, facing: 'left' },
  };
  assert.equal(validateAndMigrateSave(tamperedV1), null);

  // Tampered v2 record must be rejected
  const initialV2 = createInitialSaveRecord('slot_1');
  const tamperedV2 = {
    ...initialV2,
    playerPosition: { x: 1200, y: 800, facing: 'n' as const },
  };
  assert.equal(validateAndMigrateSave(tamperedV2), null);

  // Experience gain and level-up helper
  const leveled = applyExperienceGain(DEFAULT_HERO_STATS, 125);
  assert.equal(leveled.level, 2);
  assert.equal(leveled.xp, 25);
  assert.ok(leveled.maxHp > DEFAULT_HERO_STATS.maxHp);
});

// ============================================================================
// INDEPENDENT REVIEW MANDATORY TEST SCENARIOS (1..7)
// ============================================================================

test('Scenario 1: Backup is newer than IndexedDB while playTimeSeconds is identical', async () => {
  const olderIdb = createValidSaveRecord({
    savedAt: '2026-11-07T12:00:00.000Z',
    x: 490,
    y: 890,
    facing: 'e',
    playTimeSeconds: 120,
    discoveredWaystones: ['waystone_west'],
  });

  const newerBackupSamePlayTime = createValidSaveRecord({
    savedAt: '2026-11-07T12:00:10.000Z',
    x: 1120,
    y: 960,
    facing: 'nw',
    playTimeSeconds: 120,
    activeWaystoneId: 'waystone_sanctuary',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
  });

  assert.ok(compareSaveFreshness(newerBackupSamePlayTime, olderIdb) > 0);

  const rec = reconcileSaveRecords(olderIdb, newerBackupSamePlayTime);
  assert.equal(rec.source, 'backup');
  assert.equal(rec.needsSyncToIdb, true);
  assert.equal(rec.needsSyncToBackup, false);
  assert.equal(rec.winner?.playerPosition.x, 1120);
  assert.equal(rec.winner?.discoveredWaystones.length, 2);

  const adapter = createMemoryStorageAdapter({
    idb: olderIdb,
    backup: olderIdb,
  });
  const mgr = new SaveManager(adapter);
  await mgr.loadSave();
  assert.equal(mgr.getCurrentSave().playerPosition.x, 490);

  adapter.backupStore = newerBackupSamePlayTime;
  const saved = await mgr.saveGame({ x: 1180 });
  assert.equal(saved.playerPosition.x, 1180);
  assert.equal(saved.playerPosition.y, 960);
  assert.equal(saved.playerPosition.facing, 'nw');
  assert.deepEqual(saved.discoveredWaystones, ['waystone_west', 'waystone_sanctuary']);
});

test('Scenario 2: IndexedDB is newer than backup', async () => {
  const newerIdb = createValidSaveRecord({
    savedAt: '2026-11-07T12:05:00.000Z',
    x: 1250,
    y: 480,
    facing: 'n',
    playTimeSeconds: 240,
    activeWaystoneId: 'waystone_sanctuary',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
  });

  const staleBackup = createValidSaveRecord({
    savedAt: '2026-11-07T12:01:00.000Z',
    x: 490,
    y: 890,
    facing: 'e',
    playTimeSeconds: 60,
    discoveredWaystones: ['waystone_west'],
  });

  const rec = reconcileSaveRecords(newerIdb, staleBackup);
  assert.equal(rec.source, 'idb');
  assert.equal(rec.needsSyncToIdb, false);
  assert.equal(rec.needsSyncToBackup, true);
  assert.equal(rec.winner?.playerPosition.x, 1250);

  const adapter = createMemoryStorageAdapter({ idb: newerIdb, backup: staleBackup });
  const mgr = new SaveManager(adapter);
  const loaded = await mgr.loadSave();
  assert.ok(loaded);
  assert.equal(loaded.playerPosition.x, 1250);
  assert.equal((adapter.backupStore as SaveRecord).playerPosition.x, 1250);
});

test('Scenario 3: Both records have identical savedAt timestamp and playTimeSeconds', () => {
  const recA = createValidSaveRecord({
    savedAt: '2026-11-07T12:10:00.000Z',
    x: 720,
    y: 900,
    facing: 'se',
    playTimeSeconds: 95,
  });
  const recAClone = structuredClone(recA);

  const identical = reconcileSaveRecords(recA, recAClone);
  assert.equal(identical.source, 'idb');
  assert.equal(identical.needsSyncToIdb, false);
  assert.equal(identical.needsSyncToBackup, false);
  assert.equal(identical.winner?.checksum, recA.checksum);

  const conflictingBackup = createValidSaveRecord({
    savedAt: '2026-11-07T12:10:00.000Z',
    x: 840,
    y: 900,
    facing: 'sw',
    playTimeSeconds: 95,
  });
  const conflictResolved = reconcileSaveRecords(recA, conflictingBackup);
  assert.equal(conflictResolved.source, 'idb');
  assert.equal(conflictResolved.needsSyncToIdb, false);
  assert.equal(conflictResolved.needsSyncToBackup, true);
  assert.equal(conflictResolved.winner?.playerPosition.x, 720);
});

test('Scenario 4: One record is corrupted (corrupted IDB or corrupted Backup)', () => {
  const healthyRecord = createValidSaveRecord({
    savedAt: '2026-11-07T12:15:00.000Z',
    x: 1320,
    y: 920,
    facing: 'e',
    playTimeSeconds: 180,
  });
  const corruptedRecord = {
    ...healthyRecord,
    playerPosition: { x: 9999, y: 9999, facing: 'w' },
  };

  const fromBackup = reconcileSaveRecords(corruptedRecord, healthyRecord);
  assert.equal(fromBackup.source, 'backup');
  assert.equal(fromBackup.needsSyncToIdb, true);
  assert.equal(fromBackup.needsSyncToBackup, false);
  assert.equal(fromBackup.winner?.playerPosition.x, 1320);

  const fromIdb = reconcileSaveRecords(healthyRecord, corruptedRecord);
  assert.equal(fromIdb.source, 'idb');
  assert.equal(fromIdb.needsSyncToIdb, false);
  assert.equal(fromIdb.needsSyncToBackup, true);
  assert.equal(fromIdb.winner?.playerPosition.x, 1320);
});

test('Scenario 5: Both records are corrupted', async () => {
  const valid = createInitialSaveRecord('slot_1');
  const corruptedIdb = { ...valid, checksum: 'bad00001' };
  const corruptedBackup = { ...valid, playerPosition: { x: 2100, y: 400, facing: 'w' } };

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

  const initialized = await mgr.init();
  assert.ok(validateAndMigrateSave(initialized));
  assert.equal(initialized.playerPosition.x, DEFAULT_SPAWN_POINT.x);
  assert.equal(initialized.playerPosition.y, DEFAULT_SPAWN_POINT.y);
});

test('Scenario 6: Multiple saves occurring sequentially and concurrently preserve order and data', async () => {
  const adapter = createMemoryStorageAdapter();
  const mgr = new SaveManager(adapter);
  await mgr.init();

  const [s1, s2, s3, s4] = await Promise.all([
    mgr.saveGame({ x: 600, y: 900, facing: 'e', playTimeSeconds: 10 }),
    mgr.saveGame({
      x: 1120,
      y: 950,
      facing: 'ne',
      discoveredWaystoneId: 'waystone_sanctuary',
      discoveredInteractableId: 'npc_warden_kaelen',
      xpGain: 40,
      playTimeSeconds: 25,
    }),
    mgr.saveGame({
      x: 1250,
      y: 480,
      facing: 'n',
      discoveredWaystoneId: 'waystone_east',
      discoveredInteractableId: 'shrine_first_rift',
      xpGain: 50,
      playTimeSeconds: 40,
    }),
    mgr.saveGame({
      x: 2040,
      y: 880,
      facing: 'se',
      activeWaystoneId: 'waystone_east',
      playTimeSeconds: 55,
    }),
  ]);

  const t1 = Date.parse(s1.savedAt);
  const t2 = Date.parse(s2.savedAt);
  const t3 = Date.parse(s3.savedAt);
  const t4 = Date.parse(s4.savedAt);
  assert.ok(t1 < t2 && t2 < t3 && t3 < t4, 'Expected strictly increasing savedAt timestamps');

  assert.equal(s4.playerPosition.x, 2040);
  assert.equal(s4.playerPosition.y, 880);
  assert.equal(s4.playerPosition.facing, 'se');
  assert.equal(s4.playTimeSeconds, 55);
  assert.equal(s4.heroStats.xp, 90);
  assert.deepEqual(
    new Set(s4.discoveredWaystones),
    new Set(['waystone_west', 'waystone_sanctuary', 'waystone_east'])
  );
  assert.deepEqual(
    new Set(s4.discoveredInteractables),
    new Set(['npc_warden_kaelen', 'shrine_first_rift'])
  );
});

test('Scenario 7: Manual save from Pause Menu records live 2D RPG coordinates, 8-way facing, and playTimeSeconds and handles errors', async () => {
  const adapter = createMemoryStorageAdapter();
  const mgr = new SaveManager(adapter);
  const bus = new TypedEventBus();
  await mgr.init();

  assert.equal(mgr.getCurrentSave().playerPosition.x, DEFAULT_SPAWN_POINT.x);

  const liveSceneCharacter = {
    x: 1248.6,
    y: 612.4,
    facing: 'nw' as const,
    playTimeSeconds: 94.2,
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

  bus.emit('save:requested', { source: 'pause_menu' });
  await mgr.loadSave();

  assert.ok(completedSave, 'Expected save:completed event to fire');
  const saved = completedSave as SaveRecord;
  assert.equal(saved.playerPosition.x, 1249);
  assert.equal(saved.playerPosition.y, 612);
  assert.equal(saved.playerPosition.facing, 'nw');
  assert.equal(saved.playTimeSeconds, 94);
  assert.equal(failedReason, null);

  adapter.failWrites = true;
  liveSceneCharacter.x = 1800;
  bus.emit('save:requested', { source: 'pause_menu' });

  await new Promise((r) => setTimeout(r, 15));
  assert.ok(failedReason, 'Expected save:failed event when storage write fails');
  assert.equal(mgr.getCurrentSave().playerPosition.x, 1249);

  unsubscribe();
});

test('isPointWithinExpandedRect detects when a thumb slides outside a touch button', () => {
  const btnRect = { left: 700, top: 280, right: 780, bottom: 360 };
  assert.equal(isPointWithinExpandedRect(740, 320, btnRect, 24), true);
  assert.equal(isPointWithinExpandedRect(795, 320, btnRect, 24), true);
  assert.equal(isPointWithinExpandedRect(620, 320, btnRect, 24), false);
});

test('AssetManifest declares all Stage 2 RPG texture keys without duplicates', () => {
  const keys = ASSET_MANIFEST.map((a) => a.key);
  const uniqueKeys = new Set(keys);
  assert.equal(keys.length, Object.keys(ASSET_KEYS).length);
  assert.equal(uniqueKeys.size, keys.length);
  assert.equal( resolveSafeWalkablePosition(490, 890).x, 490);
});
