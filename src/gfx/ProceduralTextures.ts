import Phaser from 'phaser';
import { ALL_FACING_DIRECTIONS, type FacingDirection } from '../core/config';
import {
  ASSET_KEYS,
  ASSET_MANIFEST,
  getHeroAnimationFrameIndices,
  getHeroAnimKey,
  HERO_FRAME_HEIGHT,
  HERO_FRAME_WIDTH,
  HERO_FRAMES_PER_ROW,
} from './AssetManifest';

/**
 * Generates high-detail painted 2D RPG textures and the 48-frame 8-directional Hero Spritesheet
 * for Stage 2 ("Пепельный Рубеж — Классическая 2D RPG").
 */
export function registerProceduralTextures(scene: Phaser.Scene): number {
  let createdCount = 0;

  createHeroSpritesheetTexture(scene, () => createdCount++);
  createTerrainTextures(scene, () => createdCount++);
  createWaystoneTextures(scene, () => createdCount++);
  createRuinAndNaturePropTextures(scene, () => createdCount++);
  createNpcAndInteractableTextures(scene, () => createdCount++);
  createParticleTextures(scene, () => createdCount++);

  registerHeroAnimations(scene);

  return createdCount;
}

export function verifyAllManifestTexturesLoaded(scene: Phaser.Scene): boolean {
  for (const entry of ASSET_MANIFEST) {
    if (!scene.textures.exists(entry.key)) {
      return false;
    }
  }
  return true;
}

/**
 * Registers all 16 directional animations (8 Idle + 8 Walk) in Phaser's AnimationManager.
 */
export function registerHeroAnimations(scene: Phaser.Scene): void {
  for (const dir of ALL_FACING_DIRECTIONS) {
    const indices = getHeroAnimationFrameIndices(dir);
    const idleKey = getHeroAnimKey('idle', dir);
    const walkKey = getHeroAnimKey('walk', dir);

    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({
        key: idleKey,
        frames: indices.idleFrames.map((frame) => ({
          key: ASSET_KEYS.HERO_SPRITESHEET,
          frame,
        })),
        frameRate: 3,
        repeat: -1,
      });
    }

    if (!scene.anims.exists(walkKey)) {
      scene.anims.create({
        key: walkKey,
        frames: indices.walkFrames.map((frame) => ({
          key: ASSET_KEYS.HERO_SPRITESHEET,
          frame,
        })),
        frameRate: 8,
        repeat: -1,
      });
    }
  }
}

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  onCreated?: () => void
): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(key)) {
    return scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  }
  const canvasTex = scene.textures.createCanvas(key, width, height);
  if (!canvasTex) return null;
  const ctx = canvasTex.getContext();
  ctx.clearRect(0, 0, width, height);
  drawFn(ctx, width, height);
  canvasTex.refresh();
  onCreated?.();
  return canvasTex;
}

/**
 * Renders the 48-frame (6 cols x 8 rows) 8-directional Hero Spritesheet ("Эйден, Страж Разлома")
 * and slices each 96x112 cell into numbered spritesheet frames (0..47).
 */
function createHeroSpritesheetTexture(scene: Phaser.Scene, onCreated: () => void): void {
  const sheetW = HERO_FRAME_WIDTH * HERO_FRAMES_PER_ROW;
  const sheetH = HERO_FRAME_HEIGHT * ALL_FACING_DIRECTIONS.length;

  const canvasTex = createCanvasTexture(
    scene,
    ASSET_KEYS.HERO_SPRITESHEET,
    sheetW,
    sheetH,
    (ctx) => {
      for (let row = 0; row < ALL_FACING_DIRECTIONS.length; row++) {
        const dir = ALL_FACING_DIRECTIONS[row];
        for (let col = 0; col < HERO_FRAMES_PER_ROW; col++) {
          const isWalk = col >= 2;
          const phaseIndex = isWalk ? col - 2 : col; // 0..1 for idle, 0..3 for walk
          ctx.save();
          ctx.translate(col * HERO_FRAME_WIDTH, row * HERO_FRAME_HEIGHT);
          drawHeroDirectionalFrame(ctx, dir, isWalk, phaseIndex);
          ctx.restore();
        }
      }
    },
    onCreated
  );

  if (canvasTex) {
    let frameIndex = 0;
    for (let row = 0; row < ALL_FACING_DIRECTIONS.length; row++) {
      for (let col = 0; col < HERO_FRAMES_PER_ROW; col++) {
        if (!canvasTex.has(String(frameIndex))) {
          canvasTex.add(
            frameIndex,
            0,
            col * HERO_FRAME_WIDTH,
            row * HERO_FRAME_HEIGHT,
            HERO_FRAME_WIDTH,
            HERO_FRAME_HEIGHT
          );
        }
        frameIndex++;
      }
    }
  }
}

function drawHeroDirectionalFrame(
  ctx: CanvasRenderingContext2D,
  dir: FacingDirection,
  isWalk: boolean,
  phase: number
): void {
  // Center anchor of 96x112 frame: feet touch Y = 96, head crown around Y = 22
  const cx = 48;
  const baseFootY = 94;

  // Stride and bobbing kinematics
  const strideAngles = [0, 1, 0, -1];
  const stride = isWalk ? strideAngles[phase % 4] : 0;
  const bodyBobY = isWalk ? (phase % 2 === 1 ? -2.5 : 0.5) : phase === 1 ? -1.2 : 0;
  const breathScale = !isWalk && phase === 1 ? 1.02 : 1;

  // Directional orientation vectors (-1..1)
  const dirVecMap: Record<FacingDirection, { fx: number; fy: number }> = {
    s: { fx: 0, fy: 1 },
    se: { fx: 0.72, fy: 0.72 },
    e: { fx: 1, fy: 0 },
    ne: { fx: 0.72, fy: -0.72 },
    n: { fx: 0, fy: -1 },
    nw: { fx: -0.72, fy: -0.72 },
    w: { fx: -1, fy: 0 },
    sw: { fx: -0.72, fy: 0.72 },
  };
  const { fx, fy } = dirVecMap[dir];
  const isNorthHalf = fy < -0.1;

  ctx.save();

  // 1. Ground contact shadow + subtle aether resonance ring under feet
  ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
  ctx.beginPath();
  ctx.ellipse(cx, baseFootY, 21, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, baseFootY, 17, 7, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.translate(cx, baseFootY + bodyBobY);
  ctx.scale(breathScale, 1);

  // 2. If facing South / SE / SW / E / W, draw back cloak layer behind torso first
  if (!isNorthHalf) {
    drawCloakLayer(ctx, fx, fy, stride, false);
    drawBackScabbardLayer(ctx, fx, false);
  }

  // 3. Animated Armored Greaves & Boots (Left & Right legs in 3/4 perspective)
  const legOffsetX = Math.abs(fx) > 0.85 ? 3 : 6.5;
  const leftLegSwingX = fx * stride * 6.5;
  const leftLegSwingY = (Math.abs(fy) > 0.2 ? stride * 4.5 : Math.abs(stride) * -2.5);
  const rightLegSwingX = -fx * stride * 6.5;
  const rightLegSwingY = (Math.abs(fy) > 0.2 ? -stride * 4.5 : Math.abs(stride) * -1.5);

  const drawLeg = (lx: number, ly: number, bright: boolean) => {
    ctx.save();
    ctx.translate(lx, ly);
    // Armored greave shin
    ctx.fillStyle = bright ? '#2c3648' : '#1c2433';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(-5, -24, 10, 19, 3);
    ctx.fill();
    ctx.stroke();

    // Knee guard with bronze rivet
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(-5.5, -25, 11, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(-1.5, -23, 3, 2);

    // Heavy leather & steel boot
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.roundRect(-5.5 + fx * 1.5, -8, 11, 8, 2.5);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  if (fy >= 0) {
    drawLeg(-legOffsetX + leftLegSwingX, leftLegSwingY, false);
    drawLeg(legOffsetX + rightLegSwingX, rightLegSwingY, true);
  } else {
    drawLeg(legOffsetX + rightLegSwingX, rightLegSwingY, false);
    drawLeg(-legOffsetX + leftLegSwingX, leftLegSwingY, true);
  }

  // 4. Belt Tassets & Crimson-Ash Surcoat Skirt
  const skirtGrad = ctx.createLinearGradient(0, -34, 0, -14);
  skirtGrad.addColorStop(0, '#7f1d1d');
  skirtGrad.addColorStop(1, '#3f1116');
  ctx.fillStyle = skirtGrad;
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-12, -32);
  ctx.lineTo(12, -32);
  ctx.lineTo(14 - stride * 1.5, -15);
  ctx.lineTo(-14 - stride * 1.5, -15);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 5. Back arm (drawn behind torso in side/3-4 views)
  const armSwing = stride * 6;
  drawGauntletArm(ctx, -fx * 10 - (1 - Math.abs(fx)) * 13, -44 + armSwing * 0.6, false);

  // 6. Armored Cuirass Torso
  const torsoGrad = ctx.createLinearGradient(-14, -56, 14, -26);
  torsoGrad.addColorStop(0, '#364359');
  torsoGrad.addColorStop(0.5, '#1e293b');
  torsoGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = torsoGrad;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(-13 + fx * 1.5, -55, 26, 28, 5);
  ctx.fill();
  ctx.stroke();

  // Gold-bronze war belt & buckle
  ctx.fillStyle = '#1e1b18';
  ctx.fillRect(-13 + fx * 1.5, -33, 26, 5);
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(-3 + fx * 3, -34, 6, 7);

  // Chest Rift Sigil (visible when not facing North)
  if (!isNorthHalf) {
    const sigilX = fx * 5;
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(sigilX, -50);
    ctx.lineTo(sigilX + 5, -43);
    ctx.lineTo(sigilX, -36);
    ctx.lineTo(sigilX - 5, -43);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // 7. If facing North / NE / NW, cloak and runic scabbard render on top of the back torso
  if (isNorthHalf) {
    drawCloakLayer(ctx, fx, fy, stride, true);
    drawBackScabbardLayer(ctx, fx, true);
  }

  // 8. Layered Shoulder Pauldrons
  const pauldronSpan = Math.abs(fx) > 0.85 ? 6 : 13;
  const drawPauldron = (px: number, py: number) => {
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(px, py, 9.5, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  };
  drawPauldron(-pauldronSpan + fx * 2, -53);
  drawPauldron(pauldronSpan + fx * 2, -53);

  // 9. Front arm (drawn in front of torso)
  drawGauntletArm(ctx, fx * 8 + (1 - Math.abs(fx)) * 13, -44 - armSwing * 0.6, true);

  // 10. Hooded Head, Faceplate & Glowing Aether Eyes
  const headX = fx * 2.5;
  const headY = -68;
  const hoodGrad = ctx.createLinearGradient(headX - 13, headY - 14, headX + 13, headY + 12);
  hoodGrad.addColorStop(0, '#334155');
  hoodGrad.addColorStop(0.55, '#1e2638');
  hoodGrad.addColorStop(1, '#0f1420');
  ctx.fillStyle = hoodGrad;
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(headX - 13, headY + 11);
  ctx.quadraticCurveTo(headX - 15, headY - 11, headX, headY - 15);
  ctx.quadraticCurveTo(headX + 15, headY - 11, headX + 13, headY + 11);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bronze hood trim crest
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(headX, headY - 15);
  ctx.lineTo(headX + fx * 4, headY - 3);
  ctx.stroke();

  if (!isNorthHalf) {
    // Shadowed hood opening & glowing eyes
    const visorX = headX + fx * 4.5;
    const visorY = headY + 1;
    ctx.fillStyle = '#070a12';
    ctx.beginPath();
    ctx.ellipse(visorX, visorY, 8.5 - Math.abs(fx) * 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7dd3fc';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 5;
    if (Math.abs(fx) > 0.85) {
      // Profile single visible glowing eye
      ctx.beginPath();
      ctx.ellipse(visorX + fx * 2, visorY, 2.6, 1.7, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Two glowing eyes in S / SE / SW views
      ctx.beginPath();
      ctx.ellipse(visorX - 3.2, visorY, 2.3, 1.6, 0, 0, Math.PI * 2);
      ctx.ellipse(visorX + 3.2, visorY, 2.3, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  } else {
    // Back of hood stitching detail for N / NE / NW
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(headX, headY - 13);
    ctx.lineTo(headX - fx * 3, headY + 9);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCloakLayer(
  ctx: CanvasRenderingContext2D,
  fx: number,
  _fy: number,
  stride: number,
  isBackView: boolean
): void {
  const wave = stride * 4.5 - fx * 5;
  const cloakGrad = ctx.createLinearGradient(-18, -54, 18, -12);
  cloakGrad.addColorStop(0, isBackView ? '#263147' : '#1b2333');
  cloakGrad.addColorStop(0.65, '#151c2b');
  cloakGrad.addColorStop(1, '#0c101a');

  ctx.fillStyle = cloakGrad;
  ctx.strokeStyle = isBackView ? '#64748b' : 'rgba(100, 116, 139, 0.45)';
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.moveTo(-12, -53);
  ctx.lineTo(12, -53);
  ctx.quadraticCurveTo(18 + wave * 0.5, -32, 16 + wave, -12);
  ctx.lineTo(-16 + wave, -12);
  ctx.quadraticCurveTo(-18 + wave * 0.5, -32, -12, -53);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (isBackView) {
    // Golden Vel'Aris emblem embroidered on the back of the cloak
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(wave * 0.4, -44);
    ctx.lineTo(6 + wave * 0.4, -33);
    ctx.lineTo(wave * 0.4, -22);
    ctx.lineTo(-6 + wave * 0.4, -33);
    ctx.closePath();
    ctx.stroke();
  }
}

function drawBackScabbardLayer(
  ctx: CanvasRenderingContext2D,
  fx: number,
  isFrontOfCloak: boolean
): void {
  ctx.save();
  ctx.translate(fx * -2, -42);
  ctx.rotate(-0.62);
  ctx.fillStyle = isFrontOfCloak ? '#334155' : '#1e293b';
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(-24, -3, 44, 6, 2);
  ctx.fill();
  ctx.stroke();

  // Golden crossguard & sapphire pommel
  ctx.fillStyle = '#f59e0b';
  ctx.fillRect(16, -8, 4, 16);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(23, 0, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGauntletArm(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  isForeground: boolean
): void {
  ctx.save();
  ctx.translate(ax, ay);
  ctx.fillStyle = isForeground ? '#334155' : '#1e293b';
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.roundRect(-4, -6, 8, 15, 3);
  ctx.fill();
  ctx.stroke();

  // Bronze cuff & armored gauntlet fist
  ctx.fillStyle = '#d97706';
  ctx.fillRect(-4, 2, 8, 2.5);
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(0, 8, 3.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Generates rich 128x128 tileable 2D RPG terrain textures.
 */
function createTerrainTextures(scene: Phaser.Scene, onCreated: () => void): void {
  // 1. Ashen Turf & Dark Slate Moss Ground (TERRAIN_ASHEN_TURF)
  createCanvasTexture(
    scene,
    ASSET_KEYS.TERRAIN_ASHEN_TURF,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#121822';
      ctx.fillRect(0, 0, w, h);

      // Subtle organic soil & dark moss patches with soft radial blending
      const patches = [
        { x: 24, y: 28, r: 28, c: 'rgba(26, 38, 52, 0.45)' },
        { x: 92, y: 36, r: 32, c: 'rgba(28, 41, 56, 0.42)' },
        { x: 58, y: 84, r: 36, c: 'rgba(22, 33, 46, 0.48)' },
        { x: 108, y: 104, r: 26, c: 'rgba(30, 44, 60, 0.4)' },
        { x: 18, y: 102, r: 30, c: 'rgba(25, 36, 50, 0.44)' },
      ];
      for (const p of patches) {
        const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.r);
        grad.addColorStop(0, p.c);
        grad.addColorStop(1, 'rgba(18, 24, 34, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Small pebbles and dry ash grass tufts
      ctx.fillStyle = '#263244';
      const pebbles = [
        [14, 18],
        [44, 12],
        [78, 22],
        [114, 62],
        [34, 64],
        [82, 114],
        [62, 48],
      ];
      for (const [px, py] of pebbles) {
        ctx.beginPath();
        ctx.ellipse(px, py, 3.5, 2.2, 0.2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.strokeStyle = '#2d3d4f';
      ctx.lineWidth = 1.2;
      const tufts = [
        [28, 42],
        [96, 74],
        [48, 108],
        [112, 24],
      ];
      for (const [tx, ty] of tufts) {
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx - 3, ty - 6);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + 1, ty - 7);
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + 4, ty - 5);
        ctx.stroke();
      }
    },
    onCreated
  );

  // 2. Ancient Flagstone Road (TERRAIN_COBBLESTONE)
  createCanvasTexture(
    scene,
    ASSET_KEYS.TERRAIN_COBBLESTONE,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#1b2230';
      ctx.fillRect(0, 0, w, h);

      const stones = [
        { x: 4, y: 4, sw: 56, sh: 36, c: '#283244' },
        { x: 64, y: 4, sw: 60, sh: 36, c: '#242d3d' },
        { x: 4, y: 44, sw: 38, sh: 38, c: '#232c3b' },
        { x: 46, y: 44, sw: 52, sh: 38, c: '#2b364a' },
        { x: 102, y: 44, sw: 22, sh: 38, c: '#252f40' },
        { x: 4, y: 86, sw: 62, sh: 38, c: '#293346' },
        { x: 70, y: 86, sw: 54, sh: 38, c: '#242e3e' },
      ];

      for (const s of stones) {
        ctx.fillStyle = s.c;
        ctx.strokeStyle = '#10151f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(s.x, s.y, s.sw, s.sh, 5);
        ctx.fill();
        ctx.stroke();

        // Top bevel highlight
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(s.x + 4, s.y + 2);
        ctx.lineTo(s.x + s.sw - 4, s.y + 2);
        ctx.stroke();
      }
    },
    onCreated
  );

  // 3. Sanctuary Mosaic Floor (TERRAIN_SANCTUARY_MOSAIC)
  createCanvasTexture(
    scene,
    ASSET_KEYS.TERRAIN_SANCTUARY_MOSAIC,
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#1d2536';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = '#0f141f';
      ctx.lineWidth = 2;
      ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.beginPath();
      ctx.moveTo(64, 0);
      ctx.lineTo(64, h);
      ctx.moveTo(0, 64);
      ctx.lineTo(w, 64);
      ctx.stroke();

      // Runic gold-amber diamond inlay in center of tile
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(64, 18);
      ctx.lineTo(110, 64);
      ctx.lineTo(64, 110);
      ctx.lineTo(18, 64);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
      ctx.beginPath();
      ctx.arc(64, 64, 14, 0, Math.PI * 2);
      ctx.stroke();
    },
    onCreated
  );
}

function createWaystoneTextures(scene: Phaser.Scene, onCreated: () => void): void {
  const states: Array<{ key: string; active: boolean }> = [
    { key: ASSET_KEYS.WAYSTONE_DORMANT, active: false },
    { key: ASSET_KEYS.WAYSTONE_ACTIVE, active: true },
  ];

  for (const st of states) {
    createCanvasTexture(
      scene,
      st.key,
      120,
      180,
      (ctx) => {
        ctx.save();
        ctx.translate(60, 166);

        // Ground shadow ellipse in 3/4 perspective
        ctx.fillStyle = 'rgba(5, 8, 15, 0.65)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 44, 16, 0, 0, Math.PI * 2);
        ctx.fill();

        if (st.active) {
          const halo = ctx.createRadialGradient(0, -75, 6, 0, -75, 56);
          halo.addColorStop(0, 'rgba(245, 158, 11, 0.42)');
          halo.addColorStop(0.55, 'rgba(56, 189, 248, 0.18)');
          halo.addColorStop(1, 'rgba(15, 23, 42, 0)');
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(0, -75, 56, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3/4 Stepped octagon pedestal
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = st.active ? '#d97706' : '#475569';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.roundRect(-36, -18, 72, 18, 4);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(-28, -30, 56, 14, 3);
        ctx.fill();
        ctx.stroke();

        // Obelisk spire
        const spireGrad = ctx.createLinearGradient(-22, -150, 22, -26);
        spireGrad.addColorStop(0, '#334155');
        spireGrad.addColorStop(0.5, '#1e2533');
        spireGrad.addColorStop(1, '#0f141e');
        ctx.fillStyle = spireGrad;
        ctx.strokeStyle = st.active ? '#f59e0b' : '#64748b';
        ctx.lineWidth = 1.8;

        ctx.beginPath();
        ctx.moveTo(-22, -28);
        ctx.lineTo(-16, -126);
        ctx.lineTo(0, -154);
        ctx.lineTo(16, -126);
        ctx.lineTo(22, -28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        const runeColor = st.active ? '#fbbf24' : '#38bdf8';
        ctx.strokeStyle = runeColor;
        ctx.fillStyle = runeColor;
        ctx.shadowColor = runeColor;
        ctx.shadowBlur = st.active ? 14 : 6;
        ctx.lineWidth = 2.2;

        ctx.beginPath();
        ctx.moveTo(0, -122);
        ctx.lineTo(10, -96);
        ctx.lineTo(0, -70);
        ctx.lineTo(-10, -96);
        ctx.closePath();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, -96, st.active ? 4.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(0, -70);
        ctx.lineTo(0, -34);
        ctx.moveTo(-6, -56);
        ctx.lineTo(6, -56);
        ctx.moveTo(-8, -44);
        ctx.lineTo(8, -44);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.restore();
      },
      onCreated
    );
  }
}

function createRuinAndNaturePropTextures(scene: Phaser.Scene, onCreated: () => void): void {
  // 1. Ancient Sanctuary Archway (220x260)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_ARCHWAY,
    220,
    260,
    (ctx) => {
      ctx.save();
      ctx.translate(110, 248);

      // Column base shadows
      ctx.fillStyle = 'rgba(5, 8, 15, 0.55)';
      ctx.beginPath();
      ctx.ellipse(-70, 0, 26, 10, 0, 0, Math.PI * 2);
      ctx.ellipse(70, 0, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      const stoneGrad = ctx.createLinearGradient(-90, -240, 90, 0);
      stoneGrad.addColorStop(0, '#2c364a');
      stoneGrad.addColorStop(0.5, '#1b2232');
      stoneGrad.addColorStop(1, '#0f141f');

      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;

      ctx.fillRect(-86, -190, 32, 190);
      ctx.strokeRect(-86, -190, 32, 190);
      ctx.fillRect(54, -190, 32, 190);
      ctx.strokeRect(54, -190, 32, 190);

      ctx.beginPath();
      ctx.moveTo(-94, -185);
      ctx.quadraticCurveTo(-60, -244, 0, -246);
      ctx.quadraticCurveTo(60, -244, 94, -185);
      ctx.lineTo(54, -185);
      ctx.quadraticCurveTo(35, -214, 0, -218);
      ctx.quadraticCurveTo(-35, -214, -54, -185);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -240);
      ctx.lineTo(8, -228);
      ctx.lineTo(0, -218);
      ctx.lineTo(-8, -228);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
    onCreated
  );

  // 2. Ruined Pillar (72x200)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_PILLAR,
    72,
    200,
    (ctx) => {
      ctx.save();
      ctx.translate(36, 188);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      const grad = ctx.createLinearGradient(-22, -175, 22, 0);
      grad.addColorStop(0, '#334155');
      grad.addColorStop(1, '#111827');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.6;

      ctx.beginPath();
      ctx.roundRect(-24, -14, 48, 14, 3);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-20, -14);
      ctx.lineTo(-20, -156);
      ctx.lineTo(-6, -172);
      ctx.lineTo(8, -152);
      ctx.lineTo(20, -164);
      ctx.lineTo(20, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      for (const gx of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(gx, -144);
        ctx.lineTo(gx, -20);
        ctx.stroke();
      }

      ctx.restore();
    },
    onCreated
  );

  // 3. Sanctuary Brazier (64x96)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_BRAZIER,
    64,
    96,
    (ctx) => {
      ctx.save();
      ctx.translate(32, 86);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 20, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      const glow = ctx.createRadialGradient(0, -54, 2, 0, -54, 28);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.9)');
      glow.addColorStop(0.5, 'rgba(234, 88, 12, 0.4)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -54, 28, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-10, -40);
      ctx.quadraticCurveTo(-4, -70, 0, -74);
      ctx.quadraticCurveTo(6, -66, 10, -40);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, -40);
      ctx.lineTo(18, -40);
      ctx.lineTo(12, -26);
      ctx.lineTo(-12, -26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillRect(-6, -26, 12, 22);
      ctx.fillRect(-14, -4, 28, 4);
      ctx.restore();
    },
    onCreated
  );

  // 4. Petrified Ashen Tree with Glowing Canopy (160x210)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_ASHEN_TREE,
    160,
    210,
    (ctx) => {
      ctx.save();
      ctx.translate(80, 194);

      // Ground shadow ellipse
      ctx.fillStyle = 'rgba(5, 8, 15, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 44, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      // Gnarled trunk & roots
      const trunkGrad = ctx.createLinearGradient(-20, -110, 20, 0);
      trunkGrad.addColorStop(0, '#2a3140');
      trunkGrad.addColorStop(0.5, '#1c222e');
      trunkGrad.addColorStop(1, '#10141d');
      ctx.fillStyle = trunkGrad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      ctx.moveTo(-26, 2);
      ctx.quadraticCurveTo(-16, -24, -14, -82);
      ctx.lineTo(-38, -116);
      ctx.lineTo(-26, -124);
      ctx.lineTo(-6, -96);
      ctx.lineTo(4, -128);
      ctx.lineTo(16, -124);
      ctx.lineTo(10, -92);
      ctx.lineTo(36, -114);
      ctx.lineTo(42, -104);
      ctx.lineTo(14, -76);
      ctx.quadraticCurveTo(16, -24, 26, 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing amber sap veins inside bark
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-4, -10);
      ctx.lineTo(-2, -64);
      ctx.lineTo(-18, -94);
      ctx.moveTo(-2, -64);
      ctx.lineTo(14, -86);
      ctx.stroke();

      // Layered dark-fantasy twilight foliage clusters
      const clusters = [
        { x: -34, y: -124, rx: 34, ry: 24, c1: '#1e293b', c2: '#0f172a' },
        { x: 34, y: -120, rx: 36, ry: 25, c1: '#1e293b', c2: '#0f172a' },
        { x: -16, y: -148, rx: 40, ry: 28, c1: '#263449', c2: '#131c2b' },
        { x: 20, y: -144, rx: 38, ry: 26, c1: '#263449', c2: '#131c2b' },
        { x: 0, y: -162, rx: 44, ry: 28, c1: '#334155', c2: '#192336' },
      ];

      for (const cl of clusters) {
        const g = ctx.createRadialGradient(cl.x, cl.y - 8, 4, cl.x, cl.y, cl.rx);
        g.addColorStop(0, cl.c1);
        g.addColorStop(1, cl.c2);
        ctx.fillStyle = g;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(cl.x, cl.y, cl.rx, cl.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Glowing ember & cyan aether leaves in canopy
      const sparks = [
        { x: -24, y: -152, c: '#fbbf24' },
        { x: 14, y: -166, c: '#38bdf8' },
        { x: 32, y: -132, c: '#fbbf24' },
        { x: -38, y: -122, c: '#38bdf8' },
        { x: -4, y: -136, c: '#fbbf24' },
      ];
      for (const sp of sparks) {
        ctx.fillStyle = sp.c;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
    onCreated
  );

  // 5. Mossy Basalt Boulder Cluster (110x84)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_BOULDER,
    110,
    84,
    (ctx) => {
      ctx.save();
      ctx.translate(55, 74);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 44, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      const rockGrad = ctx.createLinearGradient(-38, -56, 38, 0);
      rockGrad.addColorStop(0, '#3b475c');
      rockGrad.addColorStop(0.55, '#222b3a');
      rockGrad.addColorStop(1, '#111621');
      ctx.fillStyle = rockGrad;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.8;

      ctx.beginPath();
      ctx.moveTo(-40, 0);
      ctx.lineTo(-34, -36);
      ctx.lineTo(-10, -56);
      ctx.lineTo(18, -48);
      ctx.lineTo(38, -24);
      ctx.lineTo(42, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing rune carving on boulder face
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-6, -38);
      ctx.lineTo(4, -26);
      ctx.lineTo(-4, -14);
      ctx.stroke();

      ctx.restore();
    },
    onCreated
  );

  // 6. Ruined Stone Bastion Wall (180x110)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_RUIN_WALL,
    180,
    110,
    (ctx) => {
      ctx.save();
      ctx.translate(90, 96);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 78, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      const wallGrad = ctx.createLinearGradient(0, -82, 0, 0);
      wallGrad.addColorStop(0, '#334155');
      wallGrad.addColorStop(0.3, '#242e40');
      wallGrad.addColorStop(1, '#121824');
      ctx.fillStyle = wallGrad;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.roundRect(-78, -76, 156, 76, 4);
      ctx.fill();
      ctx.stroke();

      // Top parapet stone blocks
      ctx.fillStyle = '#475569';
      ctx.fillRect(-78, -76, 42, 12);
      ctx.fillRect(-18, -76, 46, 12);
      ctx.fillRect(40, -76, 38, 12);

      // Gold runic trim band
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-74, -48);
      ctx.lineTo(74, -48);
      ctx.stroke();

      ctx.restore();
    },
    onCreated
  );

  // 7. Rift Fissure (160x90)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_RIFT_FISSURE,
    160,
    90,
    (ctx) => {
      ctx.save();
      ctx.translate(80, 54);

      const glow = ctx.createRadialGradient(0, -6, 4, 0, -6, 64);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.48)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, -6, 68, 32, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.6;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-54, 4);
      ctx.lineTo(-24, -10);
      ctx.lineTo(-4, -2);
      ctx.lineTo(18, -18);
      ctx.lineTo(52, 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.restore();
    },
    onCreated
  );
}

/**
 * Generates NPC sprites and interactive world objects (Lore Shrine, Reliquary Chests, Campfire).
 */
function createNpcAndInteractableTextures(scene: Phaser.Scene, onCreated: () => void): void {
  // 1. NPC Warden Kaelen (96x112)
  createCanvasTexture(
    scene,
    ASSET_KEYS.NPC_WARDEN,
    96,
    112,
    (ctx) => {
      ctx.save();
      ctx.translate(48, 96);

      // Ground shadow + golden NPC indicator ring
      ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Royal Azure & Gold Cloak
      ctx.fillStyle = '#1e3a5f';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-14, -56);
      ctx.lineTo(14, -56);
      ctx.lineTo(18, -10);
      ctx.lineTo(-18, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Heavy Sentinel Plate Armor
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#fbbf24';
      ctx.beginPath();
      ctx.roundRect(-13, -55, 26, 32, 5);
      ctx.fill();
      ctx.stroke();

      // Sunburst Emblem on Chest
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, -41, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Crested Sentinel Helm
      ctx.fillStyle = '#64748b';
      ctx.strokeStyle = '#fbbf24';
      ctx.beginPath();
      ctx.roundRect(-11, -78, 22, 22, 6);
      ctx.fill();
      ctx.stroke();

      // Golden plume & visor slit
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(0, -88);
      ctx.quadraticCurveTo(10, -84, 6, -74);
      ctx.lineTo(-6, -74);
      ctx.quadraticCurveTo(-10, -84, 0, -88);
      ctx.fill();

      ctx.fillStyle = '#090d16';
      ctx.fillRect(-7, -68, 14, 4);
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-5, -67, 4, 2);
      ctx.fillRect(1, -67, 4, 2);

      // Sentinel Halberd held in right hand
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(19, 2);
      ctx.lineTo(19, -86);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(19, -92);
      ctx.lineTo(28, -76);
      ctx.lineTo(19, -66);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    },
    onCreated
  );

  // 2. NPC Blacksmith Thorn (96x112)
  createCanvasTexture(
    scene,
    ASSET_KEYS.NPC_SMITH,
    96,
    112,
    (ctx) => {
      ctx.save();
      ctx.translate(48, 96);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.stroke();

      // Heavy Leather Forge Apron & Tunic
      ctx.fillStyle = '#451a03';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-14, -54, 28, 38, 5);
      ctx.fill();
      ctx.stroke();

      // Broad Shoulders & Beard
      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.roundRect(-11, -76, 22, 20, 6);
      ctx.fill();

      // Braided silver-ash beard
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(-8, -62);
      ctx.lineTo(8, -62);
      ctx.lineTo(4, -44);
      ctx.lineTo(-4, -44);
      ctx.closePath();
      ctx.fill();

      // Glowing forge goggles
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(-4, -67, 2.8, 0, Math.PI * 2);
      ctx.arc(4, -67, 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Runic Forge Hammer
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-18, -8);
      ctx.lineTo(-18, -64);
      ctx.stroke();

      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-28, -72, 20, 12, 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    },
    onCreated
  );

  // 3. Ancient Lore Shrine / Runic Tablet (96x128)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_LORE_SHRINE,
    96,
    128,
    (ctx) => {
      ctx.save();
      ctx.translate(48, 114);

      ctx.fillStyle = 'rgba(5, 8, 15, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 32, 12, 0, 0, Math.PI * 2);
      ctx.fill();

      const glow = ctx.createRadialGradient(0, -52, 4, 0, -52, 42);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.35)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -52, 42, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.roundRect(-26, -16, 52, 16, 3);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.moveTo(-20, -16);
      ctx.lineTo(-18, -84);
      ctx.lineTo(0, -98);
      ctx.lineTo(18, -84);
      ctx.lineTo(20, -16);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing script lines on tablet
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.6;
      for (const ry of [-74, -62, -50, -38]) {
        ctx.beginPath();
        ctx.moveTo(-10, ry);
        ctx.lineTo(10, ry);
        ctx.stroke();
      }

      ctx.restore();
    },
    onCreated
  );

  // 4. Reliquary Chest Closed & Open (72x64)
  const chestStates = [
    { key: ASSET_KEYS.PROP_CHEST_CLOSED, open: false },
    { key: ASSET_KEYS.PROP_CHEST_OPEN, open: true },
  ];
  for (const st of chestStates) {
    createCanvasTexture(
      scene,
      st.key,
      72,
      64,
      (ctx) => {
        ctx.save();
        ctx.translate(36, 54);

        ctx.fillStyle = 'rgba(5, 8, 15, 0.58)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 28, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        // Chest base
        ctx.fillStyle = '#451a03';
        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(-22, -26, 44, 24, 3);
        ctx.fill();
        ctx.stroke();

        if (st.open) {
          // Glowing treasure interior
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 10;
          ctx.fillRect(-16, -24, 32, 8);
          ctx.shadowBlur = 0;

          // Raised lid
          ctx.fillStyle = '#291002';
          ctx.beginPath();
          ctx.roundRect(-22, -40, 44, 14, 3);
          ctx.fill();
          ctx.stroke();
        } else {
          // Closed arched lid with gold lockplate
          ctx.fillStyle = '#5c2406';
          ctx.beginPath();
          ctx.roundRect(-23, -36, 46, 14, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-4, -28, 8, 10);
        }

        ctx.restore();
      },
      onCreated
    );
  }

  // 5. Sentinel Campfire (84x76)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_CAMPFIRE,
    84,
    76,
    (ctx) => {
      ctx.save();
      ctx.translate(42, 60);

      const glow = ctx.createRadialGradient(0, -12, 4, 0, -12, 38);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.78)');
      glow.addColorStop(0.55, 'rgba(234, 88, 12, 0.32)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -12, 38, 0, Math.PI * 2);
      ctx.fill();

      // Ring of stones
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        ctx.beginPath();
        ctx.ellipse(Math.cos(a) * 20, Math.sin(a) * 8, 6, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Charred logs
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(-14, 2);
      ctx.lineTo(14, -8);
      ctx.moveTo(-14, -8);
      ctx.lineTo(14, 2);
      ctx.stroke();

      // Bright campfire flames
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.quadraticCurveTo(-4, -34, 0, -38);
      ctx.quadraticCurveTo(6, -32, 12, -2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.moveTo(-6, -2);
      ctx.quadraticCurveTo(-2, -22, 0, -26);
      ctx.quadraticCurveTo(4, -20, 6, -2);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
    onCreated
  );
}

function createParticleTextures(scene: Phaser.Scene, onCreated: () => void): void {
  createCanvasTexture(
    scene,
    ASSET_KEYS.ASH_MOTE,
    16,
    16,
    (ctx) => {
      const grad = ctx.createRadialGradient(8, 8, 1, 8, 8, 7);
      grad.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
      grad.addColorStop(0.5, 'rgba(148, 163, 184, 0.45)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(8, 8, 7, 0, Math.PI * 2);
      ctx.fill();
    },
    onCreated
  );
}
