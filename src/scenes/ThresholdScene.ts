import Phaser from 'phaser';
import {
  computeYSortDepth,
  GAME_CONFIG,
  resolveFacingDirection,
  type FacingDirection,
  type GameShellState,
} from '../core/config';
import { eventBus } from '../core/EventBus';
import { ASSET_KEYS, getHeroAnimKey } from '../gfx/AssetManifest';
import { inputController } from '../input/InputController';
import { bindLiveSceneSaveHandler, saveManager } from '../save/SaveManager';
import { soundFX } from '../audio/SoundFX';
import {
  findNearestInteractable,
  findNearestWaystone,
  resolveZoneTitle,
  THRESHOLD_INTERACTABLES,
  THRESHOLD_PROPS,
  THRESHOLD_ROADS,
  THRESHOLD_WAYSTONES,
  type WaystoneSpec,
  type WorldInteractableSpec,
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
  private obstaclesGroup!: Phaser.Physics.Arcade.StaticGroup;
  private seeker!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private turfTile!: Phaser.GameObjects.TileSprite;

  private waystoneSprites = new Map<string, Phaser.GameObjects.Image>();
  private waystoneRings = new Map<string, Phaser.GameObjects.Ellipse>();
  private interactableSprites = new Map<string, Phaser.GameObjects.Image>();
  private interactableRings = new Map<string, Phaser.GameObjects.Ellipse>();

  private facing: FacingDirection = 'e';
  private currentAnimKey = 'hero-idle-e';
  private walkDistanceAccumulator = 0;
  private stepSoundAccumulator = 0;

  private ashPool: AshMote[] = [];
  private dustPool: DustParticle[] = [];
  private tourAngle = 0;
  private sessionPlayTimeSec = 0;
  private autosaveTimerSec = 0;
  private discoveredWaystones = new Set<string>();
  private discoveredInteractables = new Set<string>();
  private lastTelemetryHash = '';

  private unsubscribeState?: () => void;
  private unsubscribeReset?: () => void;
  private unsubscribeSaveReq?: () => void;

  constructor() {
    super({ key: 'ThresholdScene' });
  }

  create(): void {
    this.ashPool = [];
    this.dustPool = [];
    this.waystoneSprites.clear();
    this.waystoneRings.clear();
    this.interactableSprites.clear();
    this.interactableRings.clear();
    this.lastTelemetryHash = '';

    const save = saveManager.getCurrentSave();
    this.sessionPlayTimeSec = save.playTimeSeconds;
    this.facing = save.playerPosition.facing;
    this.discoveredWaystones = new Set(save.discoveredWaystones);
    this.discoveredInteractables = new Set(save.discoveredInteractables);

    // 1. Configure 2D top-down RPG world bounds (zero gravity)
    this.physics.world.gravity.set(0, 0);
    this.physics.world.setBounds(
      GAME_CONFIG.WORLD_MARGIN,
      GAME_CONFIG.WORLD_MARGIN + 60,
      GAME_CONFIG.WORLD_WIDTH - GAME_CONFIG.WORLD_MARGIN * 2,
      GAME_CONFIG.WORLD_HEIGHT - GAME_CONFIG.WORLD_MARGIN * 2 - 60
    );

    this.cameras.main.setBounds(0, 0, GAME_CONFIG.WORLD_WIDTH, GAME_CONFIG.WORLD_HEIGHT);
    this.cameras.main.setBackgroundColor('#0c1018');

    this.obstaclesGroup = this.physics.add.staticGroup();

    // 2. Build 2D RPG terrain, roads, sanctuary mosaic plazas & perimeter walls
    this.createTerrainAndRoads();

    // 3. Create Y-sorted world architecture, trees, boulders & braziers
    this.createWorldProps();

    // 4. Create interactive Waystone Obelisks
    this.createWaystones();

    // 5. Create NPCs, Lore Shrines, Reliquary Chest & Campfire
    this.createInteractables();

    // 6. Create Stage 2 8-directional Hero ("Эйден, Страж Разлома")
    this.createHero(save.playerPosition.x, save.playerPosition.y);

    // 7. Create pooled ash and footstep dust particles
    this.createParticlePools();

    // 8. Apply initial shell state
    const initialState = (document.body.dataset.state as GameShellState) || 'title';
    this.applyShellState(initialState, true);

    this.unsubscribeState = eventBus.on('state:changed', (nextState) => {
      this.applyShellState(nextState, false);
    });

    this.unsubscribeReset = eventBus.on('save:reset', (freshSave) => {
      this.sessionPlayTimeSec = freshSave.playTimeSeconds;
      this.facing = freshSave.playerPosition.facing;
      this.discoveredWaystones = new Set(freshSave.discoveredWaystones);
      this.discoveredInteractables = new Set(freshSave.discoveredInteractables);
      this.seeker.setPosition(freshSave.playerPosition.x, freshSave.playerPosition.y);
      this.seeker.body.setVelocity(0, 0);
      this.playHeroAnimation('idle', this.facing);
      this.seeker.setDepth(computeYSortDepth(this.seeker.y));
      this.refreshWorldDiscoveryVisuals();
      this.emitTelemetry(undefined, undefined, true);
    });

    this.unsubscribeSaveReq = bindLiveSceneSaveHandler({
      getLiveState: () => ({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        playTimeSeconds: this.sessionPlayTimeSec,
      }),
      onSaved: (updatedSave, nearestWaystone) => {
        soundFX.playWaystoneAttune();
        this.discoveredWaystones = new Set(updatedSave.discoveredWaystones);
        this.discoveredInteractables = new Set(updatedSave.discoveredInteractables);
        if (nearestWaystone) {
          this.spawnDustBurst(nearestWaystone.x, nearestWaystone.y - 12, 12, 0xfbbf24);
        }
        this.refreshWorldDiscoveryVisuals();
        this.emitTelemetry(nearestWaystone, undefined, true);
      },
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribeState?.();
      this.unsubscribeReset?.();
      this.unsubscribeSaveReq?.();
      this.ashPool = [];
      this.dustPool = [];
      this.waystoneSprites.clear();
      this.waystoneRings.clear();
      this.interactableSprites.clear();
      this.interactableRings.clear();
    });
  }

  private createTerrainAndRoads(): void {
    // Viewport-sized dark-fantasy turf synced to camera scroll (4.2x lower pixel fill-rate)
    this.turfTile = this.add.tileSprite(
      0,
      0,
      GAME_CONFIG.LOGICAL_WIDTH,
      GAME_CONFIG.LOGICAL_HEIGHT,
      ASSET_KEYS.TERRAIN_ASHEN_TURF
    );
    this.turfTile.setOrigin(0, 0);
    this.turfTile.setScrollFactor(0);
    this.turfTile.setDepth(-2000);

    // Paved cobblestone roads & sanctuary mosaic plazas
    const roadFrameGraphics = this.add.graphics();
    roadFrameGraphics.setDepth(-1850);

    for (const patch of THRESHOLD_ROADS) {
      const texKey =
        patch.surface === 'sanctuary_mosaic'
          ? ASSET_KEYS.TERRAIN_SANCTUARY_MOSAIC
          : ASSET_KEYS.TERRAIN_COBBLESTONE;

      const tile = this.add.tileSprite(patch.x, patch.y, patch.width, patch.height, texKey);
      tile.setDepth(-1900);

      // Carved stone curbing border around roads and plazas
      const borderColor = patch.surface === 'sanctuary_mosaic' ? 0xd97706 : 0x334155;
      roadFrameGraphics.lineStyle(2.5, borderColor, 0.55);
      roadFrameGraphics.strokeRoundedRect(
        patch.x - patch.width * 0.5,
        patch.y - patch.height * 0.5,
        patch.width,
        patch.height,
        10
      );
    }

    // Perimeter stone cliff border frame
    const borderGfx = this.add.graphics();
    borderGfx.setDepth(-1750);
    borderGfx.fillStyle(0x080b11, 0.92);
    const m = GAME_CONFIG.WORLD_MARGIN;
    borderGfx.fillRect(0, 0, GAME_CONFIG.WORLD_WIDTH, m);
    borderGfx.fillRect(0, GAME_CONFIG.WORLD_HEIGHT - m, GAME_CONFIG.WORLD_WIDTH, m);
    borderGfx.fillRect(0, 0, m, GAME_CONFIG.WORLD_HEIGHT);
    borderGfx.fillRect(GAME_CONFIG.WORLD_WIDTH - m, 0, m, GAME_CONFIG.WORLD_HEIGHT);

    borderGfx.lineStyle(3, 0x475569, 0.7);
    borderGfx.strokeRect(
      m,
      m,
      GAME_CONFIG.WORLD_WIDTH - m * 2,
      GAME_CONFIG.WORLD_HEIGHT - m * 2
    );
  }

  private addStaticFootprintCollider(
    centerX: number,
    centerY: number,
    width: number,
    height: number
  ): void {
    const zone = this.add.zone(centerX, centerY, width, height);
    this.physics.add.existing(zone, true);
    this.obstaclesGroup.add(zone);
  }

  private createWorldProps(): void {
    const ambientLights = this.add.graphics();
    ambientLights.setDepth(-1700);

    for (const prop of THRESHOLD_PROPS) {
      let texKey: string = ASSET_KEYS.PROP_PILLAR;
      let originY = 0.92;

      switch (prop.kind) {
        case 'archway':
          texKey = ASSET_KEYS.PROP_ARCHWAY;
          originY = 0.95;
          break;
        case 'pillar':
          texKey = ASSET_KEYS.PROP_PILLAR;
          originY = 0.94;
          break;
        case 'brazier':
          texKey = ASSET_KEYS.PROP_BRAZIER;
          originY = 0.9;
          ambientLights.fillStyle(0xf59e0b, 0.08);
          ambientLights.fillCircle(prop.x, prop.y - 12, 85);
          break;
        case 'ashen_tree':
          texKey = ASSET_KEYS.PROP_ASHEN_TREE;
          originY = 0.92;
          break;
        case 'boulder':
          texKey = ASSET_KEYS.PROP_BOULDER;
          originY = 0.88;
          break;
        case 'ruin_wall':
          texKey = ASSET_KEYS.PROP_RUIN_WALL;
          originY = 0.88;
          break;
        case 'rift_fissure':
          texKey = ASSET_KEYS.PROP_RIFT_FISSURE;
          originY = 0.6;
          break;
      }

      const img = this.add.image(prop.x, prop.y, texKey);
      img.setOrigin(0.5, originY);
      img.setScale(prop.scale);

      if (prop.isGroundDecal) {
        img.setDepth(-1600);
      } else {
        img.setDepth(computeYSortDepth(prop.y));
      }

      if (prop.collider) {
        this.addStaticFootprintCollider(
          prop.x + (prop.collider.offsetX ?? 0),
          prop.y + (prop.collider.offsetY ?? -8),
          prop.collider.width,
          prop.collider.height
        );
      }
    }
  }

  private createWaystones(): void {
    for (const ws of THRESHOLD_WAYSTONES) {
      const isDiscovered = this.discoveredWaystones.has(ws.id);

      const ring = this.add.ellipse(ws.x, ws.y - 4, 108, 46, 0xf59e0b, 0.08);
      ring.setStrokeStyle(1.8, isDiscovered ? 0xf59e0b : 0x38bdf8, 0.55);
      ring.setDepth(-1500);
      this.waystoneRings.set(ws.id, ring);

      const sprite = this.add.image(
        ws.x,
        ws.y,
        isDiscovered ? ASSET_KEYS.WAYSTONE_ACTIVE : ASSET_KEYS.WAYSTONE_DORMANT
      );
      sprite.setOrigin(0.5, 0.92);
      sprite.setDepth(computeYSortDepth(ws.y));
      this.waystoneSprites.set(ws.id, sprite);

      const label = this.add.text(ws.x, ws.y - 162, ws.name, {
        fontFamily: 'Cinzel, serif',
        fontSize: '12px',
        color: '#fde68a',
        backgroundColor: 'rgba(9, 12, 20, 0.78)',
        padding: { x: 6, y: 2 },
      });
      label.setOrigin(0.5, 1);
      label.setDepth(computeYSortDepth(ws.y, 15));

      this.addStaticFootprintCollider(ws.x, ws.y - 10, ws.colliderWidth, ws.colliderHeight);
    }
  }

  private createInteractables(): void {
    for (const item of THRESHOLD_INTERACTABLES) {
      const isDiscovered = this.discoveredInteractables.has(item.id);

      let texKey: string = ASSET_KEYS.PROP_LORE_SHRINE;
      let labelOffsetY = -98;

      switch (item.kind) {
        case 'npc_warden':
          texKey = ASSET_KEYS.NPC_WARDEN;
          labelOffsetY = -98;
          break;
        case 'npc_smith':
          texKey = ASSET_KEYS.NPC_SMITH;
          labelOffsetY = -96;
          break;
        case 'lore_shrine':
          texKey = ASSET_KEYS.PROP_LORE_SHRINE;
          labelOffsetY = -108;
          break;
        case 'reliquary_chest':
          texKey = isDiscovered ? ASSET_KEYS.PROP_CHEST_OPEN : ASSET_KEYS.PROP_CHEST_CLOSED;
          labelOffsetY = -56;
          break;
        case 'campfire':
          texKey = ASSET_KEYS.PROP_CAMPFIRE;
          labelOffsetY = -58;
          break;
      }

      const ring = this.add.ellipse(item.x, item.y - 3, 72, 30, 0x38bdf8, 0.07);
      ring.setStrokeStyle(1.4, isDiscovered ? 0x10b981 : 0xf59e0b, 0.5);
      ring.setDepth(-1500);
      this.interactableRings.set(item.id, ring);

      const sprite = this.add.image(item.x, item.y, texKey);
      sprite.setOrigin(0.5, 0.88);
      sprite.setDepth(computeYSortDepth(item.y));
      this.interactableSprites.set(item.id, sprite);

      const nameTag = this.add.text(item.x, item.y + labelOffsetY, item.name, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '11px',
        color: '#f3ede0',
        backgroundColor: 'rgba(13, 18, 29, 0.82)',
        padding: { x: 5, y: 2 },
      });
      nameTag.setOrigin(0.5, 1);
      nameTag.setDepth(computeYSortDepth(item.y, 12));

      if (item.collider) {
        this.addStaticFootprintCollider(
          item.x,
          item.y + (item.collider.offsetY ?? -8),
          item.collider.width,
          item.collider.height
        );
      }
    }
  }

  private refreshWorldDiscoveryVisuals(): void {
    for (const ws of THRESHOLD_WAYSTONES) {
      const active = this.discoveredWaystones.has(ws.id);
      const sprite = this.waystoneSprites.get(ws.id);
      if (sprite) {
        sprite.setTexture(active ? ASSET_KEYS.WAYSTONE_ACTIVE : ASSET_KEYS.WAYSTONE_DORMANT);
      }
      const ring = this.waystoneRings.get(ws.id);
      if (ring) {
        ring.setStrokeStyle(1.8, active ? 0xf59e0b : 0x38bdf8, 0.6);
      }
    }

    for (const item of THRESHOLD_INTERACTABLES) {
      const done = this.discoveredInteractables.has(item.id);
      if (item.kind === 'reliquary_chest') {
        const sprite = this.interactableSprites.get(item.id);
        if (sprite) {
          sprite.setTexture(done ? ASSET_KEYS.PROP_CHEST_OPEN : ASSET_KEYS.PROP_CHEST_CLOSED);
        }
      }
      const ring = this.interactableRings.get(item.id);
      if (ring) {
        ring.setStrokeStyle(1.4, done ? 0x10b981 : 0xf59e0b, 0.55);
      }
    }
  }

  private createHero(startX: number, startY: number): void {
    this.seeker = this.physics.add.sprite(startX, startY, ASSET_KEYS.HERO_SPRITESHEET, 0);
    // Anchor at feet (48, 94 inside 96x112 frame -> origin (0.5, 0.84))
    this.seeker.setOrigin(0.5, 0.84);
    this.seeker.setCollideWorldBounds(true);

    // Compact ground footprint collider around the hero's boots
    this.seeker.body.setSize(32, 22);
    this.seeker.body.setOffset(32, 74);

    this.playHeroAnimation('idle', this.facing);
    this.seeker.setDepth(computeYSortDepth(this.seeker.y));

    this.physics.add.collider(this.seeker, this.obstaclesGroup);
  }

  private playHeroAnimation(mode: 'idle' | 'walk', dir: FacingDirection): void {
    const key = getHeroAnimKey(mode, dir);
    if (this.currentAnimKey !== key || !this.seeker.anims.isPlaying) {
      this.currentAnimKey = key;
      this.seeker.play(key, true);
    }
  }

  private createParticlePools(): void {
    for (let i = 0; i < 36; i++) {
      const sprite = this.add.image(
        Math.random() * GAME_CONFIG.WORLD_WIDTH,
        Math.random() * GAME_CONFIG.WORLD_HEIGHT,
        ASSET_KEYS.ASH_MOTE
      );
      sprite.setDepth(18000);
      sprite.setAlpha(0.22 + Math.random() * 0.45);
      sprite.setScale(0.45 + Math.random() * 0.7);
      this.ashPool.push({
        sprite,
        vx: -14 - Math.random() * 20,
        vy: -8 - Math.random() * 14,
        phase: Math.random() * Math.PI * 2,
      });
    }

    for (let i = 0; i < 16; i++) {
      const graphic = this.add.circle(-100, -100, 3.5, 0x94a3b8, 0);
      graphic.setDepth(-1400);
      this.dustPool.push({
        graphic,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0.3,
      });
    }
  }

  private spawnDustBurst(x: number, y: number, count: number, color: number): void {
    let spawned = 0;
    for (const p of this.dustPool) {
      if (p.life <= 0) {
        p.graphic.setPosition(x + (Math.random() - 0.5) * 18, y + (Math.random() - 0.5) * 8);
        p.graphic.setFillStyle(color, 0.72);
        p.graphic.setScale(0.7 + Math.random() * 0.5);
        p.vx = (Math.random() - 0.5) * 90;
        p.vy = (Math.random() - 0.5) * 60 - 15;
        p.maxLife = 0.24 + Math.random() * 0.14;
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
        this.cameras.main.scrollX = 610;
        this.cameras.main.scrollY = 420;
      }
    } else if (nextState === 'playing') {
      this.physics.world.resume();
      this.cameras.main.startFollow(
        this.seeker,
        true,
        GAME_CONFIG.CAMERA_LERP_X,
        GAME_CONFIG.CAMERA_LERP_Y,
        0,
        0
      );
      this.emitTelemetry(undefined, undefined, true);
    } else if (nextState === 'paused') {
      this.physics.world.pause();
    }
  }

  update(time: number, rawDeltaMs: number): void {
    const dt = Math.min(rawDeltaMs / 1000, 0.05);

    this.updateAmbientParticles(time, dt);

    if (this.shellState === 'title') {
      this.tourAngle += dt * 0.24;
      const targetX = 620 + Math.sin(this.tourAngle) * 340;
      const targetY = 380 + Math.cos(this.tourAngle * 0.8) * 210;
      this.cameras.main.scrollX += (targetX - this.cameras.main.scrollX) * 0.04;
      this.cameras.main.scrollY += (targetY - this.cameras.main.scrollY) * 0.04;
      this.turfTile.tilePositionX = this.cameras.main.scrollX;
      this.turfTile.tilePositionY = this.cameras.main.scrollY;
      return;
    }

    this.turfTile.tilePositionX = this.cameras.main.scrollX;
    this.turfTile.tilePositionY = this.cameras.main.scrollY;

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
    const isMoving = input.magnitude > 0.04;

    if (isMoving) {
      const vx = input.moveX * GAME_CONFIG.PLAYER_MOVE_SPEED;
      const vy = input.moveY * GAME_CONFIG.PLAYER_MOVE_SPEED;
      body.setVelocity(vx, vy);

      this.facing = resolveFacingDirection(input.moveX, input.moveY, this.facing);
      this.playHeroAnimation('walk', this.facing);

      const frameSpeed = Math.hypot(body.velocity.x, body.velocity.y);
      this.walkDistanceAccumulator += frameSpeed * dt;
      this.stepSoundAccumulator += frameSpeed * dt;

      if (this.stepSoundAccumulator >= 88) {
        this.stepSoundAccumulator = 0;
        soundFX.playStep();
        this.spawnDustBurst(this.seeker.x, this.seeker.y + 2, 2, 0x64748b);
      }
    } else {
      body.setVelocity(0, 0);
      this.playHeroAnimation('idle', this.facing);
    }

    // Dynamic Y-sorting based on hero's live ground-contact Y coordinate
    this.seeker.setDepth(computeYSortDepth(this.seeker.y));

    const nearestWaystone = findNearestWaystone(this.seeker.x, this.seeker.y);
    const nearestInteractable = findNearestInteractable(this.seeker.x, this.seeker.y);

    if (input.interactJustPressed) {
      if (nearestWaystone) {
        this.attuneWaystone(nearestWaystone);
      } else if (nearestInteractable) {
        this.interactWithWorldObject(nearestInteractable);
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

    this.emitTelemetry(nearestWaystone, nearestInteractable, false);
  }

  private attuneWaystone(ws: WaystoneSpec): void {
    soundFX.playWaystoneAttune();
    this.spawnDustBurst(ws.x, ws.y - 10, 12, 0xfbbf24);

    const isFirstDiscovery = !this.discoveredWaystones.has(ws.id);
    const xpGain = isFirstDiscovery ? 35 : 0;

    void saveManager
      .saveGame({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        activeWaystoneId: ws.id,
        discoveredWaystoneId: ws.id,
        xpGain,
        restoreVitals: true,
        playTimeSeconds: this.sessionPlayTimeSec,
      })
      .then((updatedSave) => {
        this.discoveredWaystones = new Set(updatedSave.discoveredWaystones);
        this.refreshWorldDiscoveryVisuals();
        eventBus.emit('waystone:attuned', { id: ws.id, name: ws.name, save: updatedSave });
        eventBus.emit('save:completed', updatedSave);
        eventBus.emit('toast:message', {
          text: isFirstDiscovery
            ? `Обелиск пробуждён: ${ws.name} (+${xpGain} ОП) · Здоровье и эфир восстановлены`
            : `Резонанс с обелиском: ${ws.name} · Прогресс сохранён`,
          tone: 'amber',
        });
        this.emitTelemetry(ws, undefined, true);
      })
      .catch((err: unknown) => {
        const reason =
          err instanceof Error ? err.message : 'Не удалось записать активацию обелиска';
        eventBus.emit('save:failed', { reason });
      });
  }

  private interactWithWorldObject(item: WorldInteractableSpec): void {
    soundFX.playWaystoneAttune();
    this.spawnDustBurst(item.x, item.y - 8, 8, 0x38bdf8);

    const isFirstTime = !this.discoveredInteractables.has(item.id);
    const xpGranted = isFirstTime ? item.xpReward : 0;

    void saveManager
      .saveGame({
        x: this.seeker.x,
        y: this.seeker.y,
        facing: this.facing,
        discoveredInteractableId: item.id,
        xpGain: xpGranted,
        restoreVitals: item.kind === 'campfire',
        playTimeSeconds: this.sessionPlayTimeSec,
      })
      .then((updatedSave) => {
        this.discoveredInteractables = new Set(updatedSave.discoveredInteractables);
        this.refreshWorldDiscoveryVisuals();
        eventBus.emit('save:completed', updatedSave);
        eventBus.emit('world:interacted', {
          id: item.id,
          speakerName: item.name,
          roleTitle: item.roleTitle,
          lines: item.dialogueLines,
          xpGranted,
        });
        this.emitTelemetry(undefined, item, true);
      })
      .catch((err: unknown) => {
        const reason =
          err instanceof Error ? err.message : 'Не удалось сохранить взаимодействие с миром';
        eventBus.emit('save:failed', { reason });
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
      })
      .catch((err: unknown) => {
        const reason =
          err instanceof Error ? err.message : 'Не удалось записать локальное сохранение';
        eventBus.emit('save:failed', { reason });
      });
  }

  private updateAmbientParticles(time: number, dt: number): void {
    for (const mote of this.ashPool) {
      mote.sprite.x += (mote.vx + Math.sin(time * 0.0015 + mote.phase) * 8) * dt;
      mote.sprite.y += mote.vy * dt;
      if (mote.sprite.x < 0) mote.sprite.x = GAME_CONFIG.WORLD_WIDTH;
      if (mote.sprite.y < 0) mote.sprite.y = GAME_CONFIG.WORLD_HEIGHT;
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
    precomputedWaystone?: WaystoneSpec | null,
    precomputedInteractable?: WorldInteractableSpec | null,
    force: boolean = false
  ): void {
    const nearestWs =
      precomputedWaystone !== undefined
        ? precomputedWaystone
        : findNearestWaystone(this.seeker.x, this.seeker.y);
    const nearestInter =
      precomputedInteractable !== undefined
        ? precomputedInteractable
        : findNearestInteractable(this.seeker.x, this.seeker.y);

    const rx = Math.round(this.seeker.x);
    const ry = Math.round(this.seeker.y);
    const vx = Math.round(this.seeker.body.velocity.x);
    const vy = Math.round(this.seeker.body.velocity.y);
    const moving = Math.hypot(vx, vy) > 4;
    const wsId = nearestWs ? nearestWs.id : '';
    const interId = nearestInter ? nearestInter.id : '';
    const save = saveManager.getCurrentSave();

    const stateHash = `${rx}|${ry}|${moving ? 1 : 0}|${this.facing}|${this.currentAnimKey}|${wsId}|${interId}|${this.discoveredWaystones.size}|${this.discoveredInteractables.size}|${save.heroStats.level}|${save.heroStats.xp}|${save.heroStats.hp}`;
    if (!force && stateHash === this.lastTelemetryHash) {
      return;
    }
    this.lastTelemetryHash = stateHash;

    const actionLabel = nearestWs
      ? 'Резонанс'
      : nearestInter
        ? nearestInter.actionLabel
        : 'Сохранить';

    eventBus.emit('telemetry:updated', {
      x: rx,
      y: ry,
      vx,
      vy,
      moving,
      facing: this.facing,
      animationKey: this.currentAnimKey,
      nearestWaystoneId: nearestWs ? nearestWs.id : null,
      nearestWaystoneName: nearestWs ? nearestWs.name : null,
      nearestInteractableId: nearestInter ? nearestInter.id : null,
      nearestInteractableName: nearestInter ? nearestInter.name : null,
      nearestInteractableRole: nearestInter ? nearestInter.roleTitle : null,
      nearestActionLabel: actionLabel,
      discoveredWaystonesCount: this.discoveredWaystones.size,
      totalWaystones: THRESHOLD_WAYSTONES.length,
      discoveredInteractablesCount: this.discoveredInteractables.size,
      totalInteractables: THRESHOLD_INTERACTABLES.length,
      zoneTitle: resolveZoneTitle(rx, ry),
      heroStats: save.heroStats,
    });
  }
}
