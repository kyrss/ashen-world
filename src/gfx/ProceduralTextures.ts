import Phaser from 'phaser';
import { ASSET_KEYS, STAGE1_ASSET_MANIFEST } from './AssetManifest';

/**
 * Generates high-detail 2D Canvas textures for Stage 1 ("Пепельный Рубеж")
 * for any manifest entry configured as 'procedural' and not yet registered.
 */
export function registerProceduralTextures(scene: Phaser.Scene): number {
  let createdCount = 0;

  createSeekerTextures(scene, () => createdCount++);
  createStonePlatformTextures(scene, () => createdCount++);
  createWaystoneTextures(scene, () => createdCount++);
  createRuinPropTextures(scene, () => createdCount++);
  createParticleTextures(scene, () => createdCount++);

  return createdCount;
}

export function verifyAllManifestTexturesLoaded(scene: Phaser.Scene): boolean {
  for (const entry of STAGE1_ASSET_MANIFEST) {
    if (!scene.textures.exists(entry.key)) {
      return false;
    }
  }
  return true;
}

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  onCreated?: () => void
): void {
  if (scene.textures.exists(key)) return;
  const canvasTex = scene.textures.createCanvas(key, width, height);
  if (!canvasTex) return;
  const ctx = canvasTex.getContext();
  ctx.clearRect(0, 0, width, height);
  drawFn(ctx, width, height);
  canvasTex.refresh();
  onCreated?.();
}

function createSeekerTextures(scene: Phaser.Scene, onCreated: () => void): void {
  const poses: Array<{ key: string; legSpread: number; cloakWave: number; lean: number; glowBoost: number }> = [
    { key: ASSET_KEYS.SEEKER_IDLE, legSpread: 0, cloakWave: 0, lean: 0, glowBoost: 0 },
    { key: ASSET_KEYS.SEEKER_WALK_1, legSpread: 7, cloakWave: 5, lean: 2, glowBoost: 0.1 },
    { key: ASSET_KEYS.SEEKER_WALK_2, legSpread: -7, cloakWave: -4, lean: 2, glowBoost: 0.1 },
    { key: ASSET_KEYS.SEEKER_AIR, legSpread: 5, cloakWave: 10, lean: 4, glowBoost: 0.25 },
    { key: ASSET_KEYS.SEEKER_DASH, legSpread: 11, cloakWave: 16, lean: 8, glowBoost: 0.6 },
  ];

  for (const pose of poses) {
    createCanvasTexture(
      scene,
      pose.key,
      96,
      112,
      (ctx) => {
      ctx.save();
      ctx.translate(48 + pose.lean, 56);

      // Subtle ground/aura shadow
      const auraGrad = ctx.createRadialGradient(0, 12, 4, 0, 12, 38);
      auraGrad.addColorStop(0, `rgba(56, 189, 248, ${0.18 + pose.glowBoost * 0.25})`);
      auraGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, 12, 38, 0, Math.PI * 2);
      ctx.fill();

      // Back weathered cloak tail
      const cloakGrad = ctx.createLinearGradient(-22, -26, -28 - pose.cloakWave, 42);
      cloakGrad.addColorStop(0, '#1e2636');
      cloakGrad.addColorStop(0.6, '#141a26');
      cloakGrad.addColorStop(1, '#0b0f17');
      ctx.fillStyle = cloakGrad;
      ctx.beginPath();
      ctx.moveTo(-4, -24);
      ctx.quadraticCurveTo(-24 - pose.cloakWave * 0.6, 6, -26 - pose.cloakWave, 38);
      ctx.lineTo(-4 - pose.cloakWave * 0.4, 42);
      ctx.quadraticCurveTo(6, 16, 8, -20);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Boots & Greaves
      const drawBoot = (offsetX: number, offsetY: number, isFront: boolean) => {
        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.fillStyle = isFront ? '#27303f' : '#1b222e';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(-5, 16, 11, 26, 3);
        ctx.fill();
        ctx.stroke();

        // Armored knee plate
        ctx.fillStyle = '#475569';
        ctx.beginPath();
        ctx.roundRect(-6, 14, 12, 7, 2);
        ctx.fill();

        // Boot foot
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-5, 37, 15, 7, 2);
        ctx.fill();
        ctx.restore();
      };

      drawBoot(-4 - pose.legSpread * 0.6, 0, false);
      drawBoot(5 + pose.legSpread * 0.6, 0, true);

      // Armored Cuirass & Tunic
      const armorGrad = ctx.createLinearGradient(-12, -22, 14, 24);
      armorGrad.addColorStop(0, '#334155');
      armorGrad.addColorStop(0.5, '#1e293b');
      armorGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = armorGrad;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(-12, -18, 25, 36, 5);
      ctx.fill();
      ctx.stroke();

      // Glowing Rift Heart sigil on chestplate
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(2, -10);
      ctx.lineTo(7, -3);
      ctx.lineTo(2, 4);
      ctx.lineTo(-3, -3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Pauldron (Shoulder armor with gold-bronze trim)
      ctx.fillStyle = '#3b4659';
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(-2, -16, 13, 8, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Sheathed Runic Blade on back/hip
      ctx.save();
      ctx.rotate(-0.48);
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-24, -6, 38, 5, 2);
      ctx.fill();
      ctx.stroke();
      // Pommel & crossguard
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(11, -9, 4, 11);
      ctx.restore();

      // Hooded Head & Visor
      const hoodGrad = ctx.createLinearGradient(-12, -44, 12, -18);
      hoodGrad.addColorStop(0, '#293548');
      hoodGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = hoodGrad;
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-13, -20);
      ctx.quadraticCurveTo(-15, -42, 1, -44);
      ctx.quadraticCurveTo(16, -42, 14, -22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing eyes under hood shadow
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.ellipse(4, -30, 8, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#7dd3fc';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.ellipse(6, -30, 3.2, 1.8, -0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
      },
      onCreated
    );
  }
}

function createStonePlatformTextures(scene: Phaser.Scene, onCreated: () => void): void {
  // Carved basalt block texture (tileable 128x64)
  createCanvasTexture(
    scene,
    ASSET_KEYS.BASALT_PLATFORM_TILE,
    128,
    64,
    (ctx, w, h) => {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#2a3242');
      grad.addColorStop(0.18, '#1d2432');
      grad.addColorStop(1, '#0c1018');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Top weathered stone rim highlight
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 0, w, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(0, 0, w, 1.5);

      // Carved runic frieze line
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.32)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 12);
      ctx.lineTo(w, 12);
      ctx.stroke();

      // Stone masonry joints
      ctx.strokeStyle = '#090c12';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, 5);
      ctx.lineTo(64, 34);
      ctx.moveTo(0, 34);
      ctx.lineTo(w, 34);
      ctx.moveTo(32, 34);
      ctx.lineTo(32, h);
      ctx.moveTo(96, 34);
      ctx.lineTo(96, h);
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
        ctx.translate(60, 170);

        // Ambient halo
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

        // Stepped pedestal
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-38, -14, 76, 14, 3);
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.roundRect(-28, -26, 56, 13, 2);
        ctx.fill();
        ctx.stroke();

        // Main obelisk monolith spire
        const spireGrad = ctx.createLinearGradient(-22, -150, 22, -26);
        spireGrad.addColorStop(0, '#334155');
        spireGrad.addColorStop(0.5, '#1e2533');
        spireGrad.addColorStop(1, '#0f141e');
        ctx.fillStyle = spireGrad;
        ctx.strokeStyle = st.active ? '#f59e0b' : '#64748b';
        ctx.lineWidth = 1.8;

        ctx.beginPath();
        ctx.moveTo(-22, -26);
        ctx.lineTo(-16, -126);
        ctx.lineTo(0, -156);
        ctx.lineTo(16, -126);
        ctx.lineTo(22, -26);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Carved central rune channel & floating crystal core
        const runeColor = st.active ? '#fbbf24' : '#38bdf8';
        ctx.strokeStyle = runeColor;
        ctx.fillStyle = runeColor;
        ctx.shadowColor = runeColor;
        ctx.shadowBlur = st.active ? 14 : 5;
        ctx.lineWidth = 2.2;

        // Diamond rune sigil
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

        // Vertical energy conduit lines
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

function createRuinPropTextures(scene: Phaser.Scene, onCreated: () => void): void {
  // Ancient Sanctuary Archway
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_ARCHWAY,
    220,
    260,
    (ctx) => {
      ctx.save();
      ctx.translate(110, 256);

      const stoneGrad = ctx.createLinearGradient(-90, -240, 90, 0);
      stoneGrad.addColorStop(0, '#273042');
      stoneGrad.addColorStop(0.5, '#19202e');
      stoneGrad.addColorStop(1, '#0e131d');

      ctx.fillStyle = stoneGrad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;

      // Left & right columns
      ctx.fillRect(-86, -190, 30, 190);
      ctx.strokeRect(-86, -190, 30, 190);
      ctx.fillRect(56, -190, 30, 190);
      ctx.strokeRect(56, -190, 30, 190);

      // Pointed gothic arch crown
      ctx.beginPath();
      ctx.moveTo(-94, -185);
      ctx.quadraticCurveTo(-60, -248, 0, -252);
      ctx.quadraticCurveTo(60, -248, 94, -185);
      ctx.lineTo(56, -185);
      ctx.quadraticCurveTo(35, -216, 0, -220);
      ctx.quadraticCurveTo(-35, -216, -56, -185);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Subtle amber keystone inlay
      ctx.fillStyle = 'rgba(245, 158, 11, 0.55)';
      ctx.beginPath();
      ctx.moveTo(0, -246);
      ctx.lineTo(7, -232);
      ctx.lineTo(0, -222);
      ctx.lineTo(-7, -232);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
    onCreated
  );

  // Ruined Pillar
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_PILLAR,
    72,
    200,
    (ctx) => {
      ctx.save();
      ctx.translate(36, 196);
      const grad = ctx.createLinearGradient(-22, -180, 22, 0);
      grad.addColorStop(0, '#2c364a');
      grad.addColorStop(1, '#111622');
      ctx.fillStyle = grad;
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.6;

      // Fractured top column
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(-20, -162);
      ctx.lineTo(-6, -178);
      ctx.lineTo(8, -158);
      ctx.lineTo(20, -170);
      ctx.lineTo(20, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Fluted vertical grooves
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
      for (const gx of [-10, 0, 10]) {
        ctx.beginPath();
        ctx.moveTo(gx, -148);
        ctx.lineTo(gx, -12);
        ctx.stroke();
      }

      ctx.restore();
    },
    onCreated
  );

  // Sanctuary Brazier
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_BRAZIER,
    64,
    96,
    (ctx) => {
      ctx.save();
      ctx.translate(32, 92);

      // Flame glow
      const glow = ctx.createRadialGradient(0, -58, 2, 0, -58, 28);
      glow.addColorStop(0, 'rgba(251, 191, 36, 0.85)');
      glow.addColorStop(0.5, 'rgba(234, 88, 12, 0.35)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, -58, 28, 0, Math.PI * 2);
      ctx.fill();

      // Flame tongues
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(-10, -44);
      ctx.quadraticCurveTo(-4, -74, 0, -78);
      ctx.quadraticCurveTo(6, -70, 10, -44);
      ctx.closePath();
      ctx.fill();

      // Iron bowl & tripod stand
      ctx.fillStyle = '#1e293b';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, -44);
      ctx.lineTo(18, -44);
      ctx.lineTo(11, -30);
      ctx.lineTo(-11, -30);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillRect(-5, -30, 10, 28);
      ctx.fillRect(-14, -4, 28, 4);
      ctx.restore();
    },
    onCreated
  );

  // Rift Fissure (glowing ground crack)
  createCanvasTexture(
    scene,
    ASSET_KEYS.PROP_RIFT_FISSURE,
    160,
    90,
    (ctx) => {
      ctx.save();
      ctx.translate(80, 72);

      const glow = ctx.createRadialGradient(0, -18, 4, 0, -18, 64);
      glow.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, -15, 68, 34, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-54, 0);
      ctx.lineTo(-24, -14);
      ctx.lineTo(-4, -6);
      ctx.lineTo(18, -22);
      ctx.lineTo(52, -2);
      ctx.stroke();
      ctx.shadowBlur = 0;

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
      grad.addColorStop(0, 'rgba(226, 232, 240, 0.9)');
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
