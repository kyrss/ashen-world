import Phaser from 'phaser';
import { STAGE1_ASSET_MANIFEST } from '../gfx/AssetManifest';
import {
  registerProceduralTextures,
  verifyAllManifestTexturesLoaded,
} from '../gfx/ProceduralTextures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // Support future external images, sprite sheets, and atlases declared in STAGE1_ASSET_MANIFEST
    for (const asset of STAGE1_ASSET_MANIFEST) {
      if (this.textures.exists(asset.key)) continue;

      if (asset.sourceType === 'image' && asset.url) {
        this.load.image(asset.key, asset.url);
      } else if (asset.sourceType === 'spritesheet' && asset.url && asset.frameConfig) {
        this.load.spritesheet(asset.key, asset.url, asset.frameConfig);
      } else if (asset.sourceType === 'atlas' && asset.url && asset.atlasJsonUrl) {
        this.load.atlas(asset.key, asset.url, asset.atlasJsonUrl);
      }
    }
  }

  create(): void {
    // Generate procedural fallback textures for any manifest entry not loaded from external files
    registerProceduralTextures(this);
    verifyAllManifestTexturesLoaded(this);
    this.scene.start('ThresholdScene');
  }
}
