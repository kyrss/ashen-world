import Phaser from 'phaser';
import { GAME_CONFIG, type GameShellState } from '../core/config';
import { eventBus } from '../core/EventBus';
import { ASSET_KEYS } from '../gfx/AssetManifest';
import { inputController } from '../input/InputController';
import { saveManager } from '../save/SaveManager';
import { soundFX } from '../audio/SoundFX';
import {
  THRESHOLD_PLATFORMS,
  THRESHOLD_PROPS,
  THRESHOLD_WAYSTONES,
  findNearestWaystone,
  resolveZoneTitle,
  type WaystoneSpec,
} from '../world/thresholdLayout';

interface AshMote {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  phase: number;
}

interface DustParticle {
  graphic: Phaser.GameObjects.Arc;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class ThresholdScene extends Phaser.Scene {
  private shellState: GameShellState = 'title';
  private platformsGroup!: Phaser.Physics.Arcade.StaticGroup;
  private seeker!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private waystoneSprites = new Map<string, Phaser.GameObjects.Image>();
  private waystoneRings = new Map<string, Phaser.GameObjects.Arc>();

  private facing: 'left' | 'right' = 'right';
  private lastGroundedTime = 0;
  private lastJumpPressedTime = -9999;
  private wasGrounded = false;
  private isDashing = false;
  private dashEndTime = 0;
  private dashCooldownUntil = 0;
  private walkDistanceAccumulator = 0;
  private stepSoundAccumulator = 0;

  private scaleSquashX = 1;
  private scaleSquashY = 1;

  private ashPool: AshMote[] = [];
  private dustPool: DustParticle[] = [];
  private tourAngle = 0;
  private sessionPlayTimeSec = 0;
  private autosaveTimerSec = 0;
  private discoveredWaystonesCount = 1;
  private lastTelemetryHash = '';

  private unsubscribeState?: () => void;
  private unsubscribeReset?: () => void;

  constructor() {
    super({ key: 'ThresholdScene' });
  }

  create(): void {
    // Reset pools and maps so scene restarts never retain stale references
    this.ashPool = [];
    this.dustPool = [];
    this.waystoneSprites.clear();
    this.waystoneRings.clear();
    this.lastTelemetryHash = '';

    const save = saveManager.getCurrentSave();
    this.sessionPlayTimeSec = save.playTimeSeconds;
    this.facing = save.playerPosition.facing;
    this.discoveredWaystonesCount = save.discoveredWaystones.length;

    // 1. Configure physics world bounds & anti-tunneling bias
    this.physics.world.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.physics.world.TILE_BIAS = 32;
    this.physics.world.OVERLAP_BIAS = 16;

    this.cameras.main.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#090b10');

    // 2. Build multi-layer atmospheric parallax backdrop
    this.createParallaxBackdrop();

    // 3. Create background architectural props (arches, pillars, braziers, rift fissures)
    this.createRuinProps();

    // 4. Create static collision platforms & carved stone borders
    this.createPlatforms();

    // 5. Create interactive Waystone Obelisks
    this.createWaystones(save.discoveredWaystones);

    // 6. Create Stage 1 Pioneer Seeker prototype avatar
    this.createSeeker(save.playerPosition.x, save.playerPosition.y);

    // 7. Create pooled ash and dust particles (zero runtime allocation)
    this.createParticlePools();

    // 8. Check initial state (title tour vs direct ?autostart=1 playing)
    const initialState = (document.body.dataset.state as GameShellState) || 'title';
    this.applyShellState(initialState, true);

    this.unsubscribeState = eventBus.on('state:changed', (nextState) => {
      this.applyShellState(nextState, false);
    });

    this.unsubscribeReset = eventBus.on('save:reset', (freshSave) => {
      this.sessionPlayTimeSec = freshSave.playTimeSeconds;
      this.facing = freshSave.playerPosition.facing;
      this.discoveredWaystonesCount = freshSave.discoveredWaystones.length;
      this.seeker.setPosition(freshSave.playerPosition.x, freshSave.playerPosition.y);
      this.seeker.body.setVelocity(0, 0);
      this.refreshWaystoneVisuals(freshSave.discoveredWaystones);
      this.emitTelemetry(0, undefined, true);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeReset?.();
      this.ashPool = [];
      this.dustPool = [];
      this.waystoneSprites.clear();
      this.waystoneRings.clear();
    });
  }

  private createParallaxBackdrop(): void {
    const sky = this.add.graphics();
    sky.setScrollFactor(0);
    sky.setDepth(-100);
    sky.fillGradientStyle(0x070a10, 0x070a10, 0x131b2b, 0x182132, 1);
    sky.fillRect(0, 0, GAME_CONFIG.LOGICAL_WIDTH, GAME_CONFIG.LOGICAL_HEIGHT);

    const eclipse = this.add.graphics();
    eclipse.setScrollFactor(0.06, 0.04);
    eclipse.setDepth(-90);
    eclipse.fillStyle(0xf59e0b, 0.08);
    eclipse.fillCircle(880, 165, 118);
    eclipse.lineStyle(2, 0xf59e0b, 0.35);
    eclipse.strokeCircle(880, 165, 68);
    eclipse.fillStyle(0x080b12, 1);
    eclipse.fillCircle(880, 165, 65);

    const farMountains = this.add.graphics();
    farMountains.setScrollFactor(0.18, 0.08);
    farMountains.setDepth(-80);
    farMountains.fillStyle(0x0e1420, 1);
    farMountains.beginPath();
    farMountains.moveTo(0, 720);
    const farPeaks = [
      [0, 440],
      [190, 310],
      [370, 410],
      [580, 250],
      [790, 390],
      [1040, 280],
      [1290, 420],
      [1520, 270],
      [1780, 380],
      [2040, 310],
    ];
    for (const [px, py] of farPeaks) {
      farMountains.lineTo(px, py);
    }
    farMountains.lineTo(2200, 720);
    farMountains.closePath();
    farMountains.fill();

    const midRuins = this.add.graphics();
    midRuins.setScrollFactor(0.38, 0.15);
    midRuins.setDepth(-65);
    midRuins.fillStyle(0x131b2a, 0.92);
    for (let i = 0; i < 14; i++) {
      const bx = i * 190 + 60;
      const topY = 390 + (i % 3) * 28;
      midRuins.fillRect(bx, topY, 36, 360);
      midRuins.fillRect(bx - 12, topY, 60, 14);
    }
  }

  private createRuinProps(): void {
    for (const prop of THRESHOLD_PROPS) {
      let texKey: string = ASSET_KEYS.PROP_PILLAR;
      const originY = 1;
      let depth = -20;

      if (prop.kind === 'archway') {
        texKey = ASSET_KEYS.PROP_ARCHWAY;
        depth = -25;
      } else if (prop.kind === 'brazier') {
        texKey = ASSET_KEYS.PROP_BRAZIER;
        depth = -15;
      } else if (prop.kind === 'rift_fissure') {
        texKey = ASSET_KEYS.PROP_RIFT_FISSURE;
        depth = -30;
      }

      const img = this.add.image(prop.x, prop.y, texKey);
      img.setOrigin(0.5, originY);
      img.setScale(prop.scale);
      img.setDepth(depth);
    }
  }

  private createPlatforms(): void {
    this.platformsGroup = this.physics.add.staticGroup();

    for (const spec of THRESHOLD_PLATFORMS) {
      const tileSprite = this.add.tileSprite(
        spec.x,
        spec.y,
        spec.width,
        spec.height,
        ASSET_KEYS.BASALT_PLATFORM_TILE
      );
      tileSprite.setDepth(0);

      const border = this.add.graphics();
      border.setDepth(1);
      border.lineStyle(1.5, spec.kind === 'terrace' ? 0xd97706 : 0x475569, 0.55);
      border.strokeRect(
        spec.x - spec.width * 0.5,
        spec.y - spec.height * 0.5,
        spec.width,
        spec.height
      );

      this.physics.add.existing(tileSprite, true);
      if (spec.oneWayUp && tileSprite.body) {
        const staticBody = tileSprite.body as Phaser.Physics.Arcade.StaticBody;
        staticBody.checkCollision.down = false;
        staticBody.checkCollision.left = false;
        staticBody.checkCollision.right = false;
        staticBody.checkCollision.up = true;
      }
      this.platformsGroup.add(tileSprite);
    }
  }

  private createWaystones(discoveredIds: string[]): void {
    const discoveredSet = new Set(discoveredIds);

    for (const ws of THRESHOLD_WAYSTONES) {
      const isDiscovered = discoveredSet.has(ws.id);
      const sprite = this.add.image(
        ws.x,
        ws.y,
        isDiscovered ? ASSET_KEYS.WAYSTONE_ACTIVE : ASSET_KEYS.WAYSTONE_DORMANT
      );
      sprite.setOrigin(0.5, 0.94);
      sprite.setDepth(-5);
      this.waystoneSprites.set(ws.id, sprite);

      const ring = this.add.circle(ws.x, ws.y - 6, 48, 0xf59e0b, 0.08);
      ring.setStrokeStyle(1.5, isDiscovered ? 0xf59e0b : 0x38bdf8, 0.45);
      ring.setScale(1, 0.28);
      ring.setDepth(-4);
      this.waystoneRings.set(ws.id, ring);
    }
  }

  private refreshWaystoneVisuals(discoveredIds: string[]): void {
    const discoveredSet = new Set(discoveredIds);
    this.discoveredWaystonesCount = discoveredSet.size;
    for (const ws of THRESHOLD_WAYSTONES) {
      const active = discoveredSet.has(ws.id);
      const sprite = this.waystoneSprites.get(ws.id);
      if (sprite) {
        sprite.setTexture(active ? ASSET_KEYS.WAYSTONE_ACTIVE : ASSET_KEYS.WAYSTONE_DORMANT);
      }
      const ring = this.waystoneRings.get(ws.id);
      if (ring) {
        ring.setStrokeStyle(1.5, active ? 0xf59e0b : 0x38bdf8, 0.55);
      }
    }
  }

  private createSeeker(startX: number, startY: number): void {
    this.seeker = this.physics.add.sprite(startX, startY, ASSET_KEYS.SEEKER_IDLE);
    this.seeker.setDepth(10);
    this.seeker.setCollideWorldBounds(true);

    this.seeker.body.setSize(34, 78);
    this.seeker.body.setOffset(31, 20);
    this.seeker.body.setMaxVelocity(750, 960);
    this.seeker.setFlipX(this.facing === 'left');

    this.physics.add.collider(this.seeker, this.platformsGroup);
  }

  private createParticlePools(): void {
    for (let i = 0; i < 36; i++) {
      const sprite = this.add.image(
        Math.random() * GAME_CONFIG.WORLD_WIDTH,
        Math.random() * (GAME_CONFIG.WORLD_HEIGHT - 120),
        ASSET_KEYS.ASH_MOTE
      );
      sprite.setDepth(18);
      sprite.setAlpha(0.2 + Math.random() * 0.45);
      sprite.setScale(0.45 + Math.random() * 0.7);
      this.ashPool.push({
        sprite,
        vx: -14 - Math.random() * 22,
        vy: -6 - Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < 18; i++) {
      const graphic = this.add.circle(-100, -100, 4, 0x94a3b8, 0);
      graphic.setDepth(9);
      this.dustPool.push({
        graphic,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.35,
      });
    }
  }

  private spawnDustBurst(x: number, y: number, count: number, color: number): void {
    let spawned = 0;
    for (const p of this.dustPool) {
      if (p.life <= 0) {
        p.graphic.setPosition(x + (Math.random() - 0.5) * 20, y);
        p.graphic.setFillStyle(color, 0.75);
        p.graphic.setScale(0.7 + Math.random() * 0.6);
        p.vx = (Math.random() - 0.5) * 140;
        p.vy = -30 - Math.random() * 90;
        p.maxLife = 0.24 + Math.random() * 0.16;
        p.life = p.maxLife;
        spawned++;
        if (spawned >= count) break;
      }
    }
  }

  private applyShellState(nextState: GameShellState, immediate: boolean): void {
    this.shellState = nextState;
    inputController.clearAllInputs();

    if (nextState === 'title') {
      this.physics.world.pause();
      this.cameras.main.stopFollow();
      if (immediate) {
        this.cameras.main.scrollX = 220;
        this.cameras.main.scrollY = 140;
      }
    } else if (nextState === 'playing') {
      this.physics.world.resume();
      this.cameras.main.startFollow(
        this.seeker,
        true,
        GAME_CONFIG.CAMERA_LERP_X,
        GAME_CONFIG.CAMERA_LERP_Y,
        0,
        -35
      );
      this.emitTelemetry(this.time.now, undefined, true);
    } else if (nextState === 'paused') {
      this.physics.world.pause();
    }
  }

  update(time: number, rawDeltaMs: number): void {
    const dt = Math.min(rawDeltaMs / 1000, 0.05);

    this.updateAmbientParticles(time, dt);

    if (this.shellState === 'title') {
      this.tourAngle += dt * 0.22;
      const targetX = 980 + Math.sin(this.tourAngle) * 760;
      const targetY = 125 + Math.cos(this.tourAngle * 1.5) * 35;
      this.cameras.main.scrollX += (targetX - this.cameras.main.scrollX) * 0.04;
      this.cameras.main.scrollY += (targetY - this.cameras.main.scrollY) * 0.04;
      return;
    }

    const input = inputController.consumeFrameInput();

    if (input.pauseJustPressed) {
      const targetState: GameShellState = this.shellState === 'paused' ? 'playing' : 'paused';
      document.body.dataset.state = targetState;
      eventBus.emit('state:changed', targetState);
      return;
    }

    if (this.shellState !== 'playing') {
      return;
    }

    this.sessionPlayTimeSec += dt;
    this.autosaveTimerSec += dt;

    const body = this.seeker.body;
    const grounded = body.blocked.down || body.touching.down;

    if (grounded) {
      this.lastGroundedTime = time;
      if (!this.wasGrounded) {
        this.scaleSquashX = 1.2;
        this.scaleSquashY = 0.82;
        soundFX.playLand();
        this.spawnDustBurst(this.seeker.x, this.seeker.y + 38, 6, 0x94a3b8);
      }
    }
    this.wasGrounded = grounded;

    if (input.jumpJustPressed) {
      this.lastJumpPressedTime = time;
    }

    // Dash execution
    if (input.dashJustPressed && time >= this.dashCooldownUntil && !this.isDashing) {
      this.isDashing = true;
      this.dashEndTime = time + GAME_CONFIG.PLAYER_DASH_DURATION_MS;
      this.dashCooldownUntil = time + GAME_CONFIG.PLAYER_DASH_COOLDOWN_MS;
      if (Math.abs(input.moveX) > 0.1) {
        this.facing = input.moveX < 0 ? 'left' : 'right';
        this.seeker.setFlipX(this.facing === 'left');
      }
      const dir = this.facing === 'left' ? -1 : 1;
      body.setAllowGravity(false);
      body.setVelocity(dir * GAME_CONFIG.PLAYER_DASH_SPEED, 0);
      this.scaleSquashX = 1.26;
      this.scaleSquashY = 0.78;
      soundFX.playDash();
      this.spawnDustBurst(this.seeker.x, this.seeker.y + 20, 8, 0x38bdf8);
    }

    if (this.isDashing) {
      if (time >= this.dashEndTime) {
        this.isDashing = false;
        body.setAllowGravity(true);
        body.setVelocityX(body.velocity.x * 0.45);
      }
    } else {
      const targetVx = input.moveX * GAME_CONFIG.PLAYER_MOVE_SPEED;
      const accelFactor = grounded ? 0.28 : 0.18;
      const nextVx = body.velocity.x + (targetVx - body.velocity.x) * accelFactor;
      body.setVelocityX(Math.abs(nextVx) < 4 ? 0 : nextVx);

      if (Math.abs(input.moveX) > 0.08) {
        this.facing = input.moveX < 0 ? 'left' : 'right';
        this.seeker.setFlipX(this.facing === 'left');
      }

      const withinCoyote = time - this.lastGroundedTime <= GAME_CONFIG.COYOTE_TIME_MS;
      const withinBuffer = time - this.lastJumpPressedTime <= GAME_CONFIG.JUMP_BUFFER_MS;

      if (withinCoyote && withinBuffer) {
        body.setVelocityY(GAME_CONFIG.PLAYER_JUMP_VELOCITY);
        this.lastGroundedTime = 0;
        this.lastJumpPressedTime = -9999;
        this.scaleSquashX = 0.86;
        this.scaleSquashY = 1.16;
        soundFX.playJump();
        this.spawnDustBurst(this.seeker.x, this.seeker.y + 38, 5, 0xcbd5e1);
      }

      if (!input.jumpHeld && body.velocity.y < -180) {
        body.setVelocityY(body.velocity.y * 0.55);
      }
    }

    // Safety guard if high-velocity collision ever pushes body below ground bottom
    if (this.seeker.y > GAME_CONFIG.GROUND_Y - 10) {
      this.seeker.setY(GAME_CONFIG.GROUND_Y - 38);
      body.setVelocityY(0);
    }

    this.scaleSquashX += (1 - this.scaleSquashX) * Math.min(1, dt * 14);
    this.scaleSquashY += (1 - this.scaleSquashY) * Math.min(1, dt * 14);
    this.seeker.setScale(this.scaleSquashX, this.scaleSquashY);

    const speedX = Math.abs(body.velocity.x);
    if (this.isDashing) {
      this.seeker.setTexture(ASSET_KEYS.SEEKER_DASH);
    } else if (!grounded) {
      this.seeker.setTexture(ASSET_KEYS.SEEKER_AIR);
    } else if (speedX > 24) {
      this.walkDistanceAccumulator += speedX * dt;
      this.stepSoundAccumulator += speedX * dt;
      const cycle = Math.floor(this.walkDistanceAccumulator / 42) % 2;
      this.seeker.setTexture(
        cycle === 0 ? ASSET_KEYS.SEEKER_WALK_1 : ASSET_KEYS.SEEKER_WALK_2
      );

      if (this.stepSoundAccumulator >= 95) {
        this.stepSoundAccumulator = 0;
        soundFX.playStep();
      }
    } else {
      this.seeker.setTexture(ASSET_KEYS.SEEKER_IDLE);
    }

    const nearestWaystone = findNearestWaystone(this.seeker.x, this.seeker.y);
    if (input.interactJustPressed) {
      if (nearestWaystone) {
        this.attuneWaystone(nearestWaystone);
      } else {
        this.manualSaveAtPosition();
      }
    }

    if (this.autosaveTimerSec >= 20) {
      this.autosaveTimerSec = 0;
      void saveManager.saveGame({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        playTimeSeconds: this.sessionPlayTimeSec,
      });
    }

    this.emitTelemetry(time, nearestWaystone, false);
  }

  private attuneWaystone(ws: WaystoneSpec): void {
    soundFX.playWaystoneAttune();
    this.spawnDustBurst(ws.x, ws.y - 16, 12, 0xfbbf24);

    void saveManager
      .saveGame({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        activeWaystoneId: ws.id,
        discoveredWaystoneId: ws.id,
        playTimeSeconds: this.sessionPlayTimeSec,
      })
      .then((updatedSave) => {
        this.refreshWaystoneVisuals(updatedSave.discoveredWaystones);
        eventBus.emit('waystone:attuned', { id: ws.id, name: ws.name, save: updatedSave });
        eventBus.emit('save:completed', updatedSave);
        eventBus.emit('toast:message', {
          text: `Обелиск активирован: ${ws.name} · Прогресс сохранён`,
          tone: 'amber',
        });
        this.emitTelemetry(this.time.now, ws, true);
      });
  }

  public manualSaveAtPosition(): void {
    soundFX.playWaystoneAttune();
    void saveManager
      .saveGame({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        playTimeSeconds: this.sessionPlayTimeSec,
      })
      .then((updatedSave) => {
        eventBus.emit('save:completed', updatedSave);
        eventBus.emit('toast:message', {
          text: `Локальное сохранение записано (X: ${updatedSave.playerPosition.x}, Y: ${updatedSave.playerPosition.y})`,
          tone: 'cyan',
        });
      });
  }

  private updateAmbientParticles(time: number, dt: number): void {
    for (const mote of this.ashPool) {
      mote.sprite.x += (mote.vx + Math.sin(time * 0.0015 + mote.phase) * 8) * dt;
      mote.sprite.y += mote.vy * dt;
      if (mote.sprite.x < 0) mote.sprite.x = GAME_CONFIG.WORLD_WIDTH;
      if (mote.sprite.y < 0) mote.sprite.y = GAME_CONFIG.WORLD_HEIGHT - 80;
    }

    for (const p of this.dustPool) {
      if (p.life > 0) {
        p.life -= dt;
        p.graphic.x += p.vx * dt;
        p.graphic.y += p.vy * dt;
        const alpha = Math.max(0, (p.life / p.maxLife) * 0.7);
        p.graphic.setAlpha(alpha);
      }
    }
  }

  private emitTelemetry(
    time: number,
    precomputedNearest?: WaystoneSpec | null,
    force: boolean = false
  ): void {
    const nearest =
      precomputedNearest !== undefined
        ? precomputedNearest
        : findNearestWaystone(this.seeker.x, this.seeker.y);
    const dashRemaining = Math.max(0, this.dashCooldownUntil - time);
    const dashCooldownRatio = Number(
      (dashRemaining / GAME_CONFIG.PLAYER_DASH_COOLDOWN_MS).toFixed(1)
    );

    const rx = Math.round(this.seeker.x);
    const ry = Math.round(this.seeker.y);
    const grounded = this.seeker.body.blocked.down || this.seeker.body.touching.down;
    const nearestId = nearest ? nearest.id : null;

    // Throttle DOM updates: only emit when discrete visible values change
    const stateHash = `${rx}|${ry}|${grounded ? 1 : 0}|${this.isDashing ? 1 : 0}|${dashCooldownRatio}|${nearestId ?? ''}|${this.discoveredWaystonesCount}`;
    if (!force && stateHash === this.lastTelemetryHash) {
      return;
    }
    this.lastTelemetryHash = stateHash;

    eventBus.emit('telemetry:updated', {
      x: rx,
      y: ry,
      vx: Math.round(this.seeker.body.velocity.x),
      vy: Math.round(this.seeker.body.velocity.y),
      grounded,
      dashing: this.isDashing,
      dashCooldownRatio,
      facing: this.facing,
      nearestWaystoneId: nearestId,
      nearestWaystoneName: nearest ? nearest.name : null,
      discoveredCount: this.discoveredWaystonesCount,
      totalWaystones: THRESHOLD_WAYSTONES.length,
      zoneTitle: resolveZoneTitle(rx),
    });
  }
}
