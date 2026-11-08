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
  computeSaveChecksum,
  createInitialSaveRecord,
  reconcileSaveRecords,
  validateAndMigrateSave,
} from '../save/SaveManager';
import { ASSET_KEYS, STAGE1_ASSET_MANIFEST } from '../gfx/AssetManifest';
import { isPointWithinExpandedRect } from '../ui/GameShellUI';

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

  // Verify all elevated platforms have thickness >= 36px (anti-tunneling) and are physically reachable
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

  // Simulate simultaneous left thumb joystick hold + right thumb jump + dash
  inputController.clearAllInputs();
  inputController.setJoystickState(fullRight);
  inputController.triggerTouchJump(true);
  inputController.triggerTouchDash();

  const frame1 = inputController.consumeFrameInput();
  assert.equal(frame1.moveX, 1);
  assert.equal(frame1.jumpHeld, true);
  assert.equal(frame1.jumpJustPressed, true);
  assert.equal(frame1.dashJustPressed, true);

  // Next frame while jump and joystick are still held: edge triggers must be false, held states remain true
  const frame2 = inputController.consumeFrameInput();
  assert.equal(frame2.moveX, 1);
  assert.equal(frame2.jumpHeld, true);
  assert.equal(frame2.jumpJustPressed, false);
  assert.equal(frame2.dashJustPressed, false);

  // Release jump while joystick remains held
  inputController.triggerTouchJump(false);
  const frame3 = inputController.consumeFrameInput();
  assert.equal(frame3.moveX, 1);
  assert.equal(frame3.jumpHeld, false);

  inputController.clearAllInputs();
});

test('isPointWithinExpandedRect detects when a thumb slides outside a touch button', () => {
  const btnRect = { left: 700, top: 280, right: 780, bottom: 360 };
  assert.equal(isPointWithinExpandedRect(740, 320, btnRect, 24), true);
  assert.equal(isPointWithinExpandedRect(795, 320, btnRect, 24), true); // within 24px tolerance
  assert.equal(isPointWithinExpandedRect(620, 320, btnRect, 24), false); // slid far left off button
});

test('SaveManager strictly verifies FNV-1a checksum and rejects corrupted records', () => {
  const initial = createInitialSaveRecord('slot_1');
  assert.equal(initial.version, 1);
  assert.equal(initial.checksum.length, 8);

  const validated = validateAndMigrateSave(initial);
  assert.ok(validated);
  assert.equal(validated.checksum, initial.checksum);

  // Tampering with coordinates without updating the FNV-1a checksum must be rejected as corrupted
  const tampered = {
    ...initial,
    playerPosition: { x: 1450, y: 550, facing: 'left' as const },
  };
  assert.equal(validateAndMigrateSave(tampered), null);

  // Tampering with checksum string directly must be rejected
  const badHash = {
    ...initial,
    checksum: 'deadbeef',
  };
  assert.equal(validateAndMigrateSave(badHash), null);
});

test('reconcileSaveRecords protects healthy backup against corrupted IDB and picks newer save', () => {
  const baseOlder: Omit<ReturnType<typeof createInitialSaveRecord>, 'checksum'> = {
    version: 1,
    slotId: 'slot_1',
    savedAt: '2026-11-07T10:00:00.000Z',
    regionId: 'ashen_threshold',
    regionName: 'Пепельный Рубеж',
    playerPosition: { x: 420, y: 700, facing: 'right' },
    activeWaystoneId: 'waystone_west',
    discoveredWaystones: ['waystone_west'],
    playTimeSeconds: 45,
  };
  const validOlder = { ...baseOlder, checksum: computeSaveChecksum(baseOlder) };

  const baseNewer: Omit<ReturnType<typeof createInitialSaveRecord>, 'checksum'> = {
    ...baseOlder,
    savedAt: '2026-11-07T10:05:00.000Z',
    playerPosition: { x: 1580, y: 515, facing: 'left' },
    activeWaystoneId: 'waystone_sanctuary',
    discoveredWaystones: ['waystone_west', 'waystone_sanctuary'],
    playTimeSeconds: 310,
  };
  const validNewer = { ...baseNewer, checksum: computeSaveChecksum(baseNewer) };

  const corruptedIdb = { ...validNewer, checksum: '00000000' };

  // Case 1: Corrupted IDB + healthy LocalStorage backup -> backup wins and heals IDB
  const case1 = reconcileSaveRecords(corruptedIdb, validOlder);
  assert.equal(case1.source, 'backup');
  assert.equal(case1.needsSyncToIdb, true);
  assert.equal(case1.needsSyncToBackup, false);
  assert.equal(case1.winner?.playerPosition.x, 420);

  // Case 2: Stale IDB + newer LocalStorage backup -> newer backup wins and updates IDB
  const case2 = reconcileSaveRecords(validOlder, validNewer);
  assert.equal(case2.source, 'backup');
  assert.equal(case2.needsSyncToIdb, true);
  assert.equal(case2.winner?.playerPosition.x, 1580);

  // Case 3: Newer IDB + stale LocalStorage backup -> newer IDB wins and updates backup
  const case3 = reconcileSaveRecords(validNewer, validOlder);
  assert.equal(case3.source, 'idb');
  assert.equal(case3.needsSyncToBackup, true);
  assert.equal(case3.winner?.playerPosition.x, 1580);
});

test('AssetManifest declares all 13 required Stage 1 texture keys without duplicates', () => {
  const keys = STAGE1_ASSET_MANIFEST.map((a) => a.key);
  const uniqueKeys = new Set(keys);
  assert.equal(keys.length, Object.keys(ASSET_KEYS).length);
  assert.equal(uniqueKeys.size, keys.length);
});
