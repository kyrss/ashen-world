import { ALL_FACING_DIRECTIONS, type FacingDirection } from '../core/config';

/**
 * Unified Asset Manifest for ASHEN WORLD (Stage 2 — 2D Top-Down / 3/4 Perspective RPG).
 * Decouples logical texture/spritesheet keys used by game scenes from how those assets are loaded.
 */

export const ASSET_KEYS = {
  HERO_SPRITESHEET: 'hero_spritesheet',
  TERRAIN_ASHEN_TURF: 'terrain_ashen_turf',
  TERRAIN_COBBLESTONE: 'terrain_cobblestone',
  TERRAIN_SANCTUARY_MOSAIC: 'terrain_sanctuary_mosaic',
  WAYSTONE_DORMANT: 'waystone_dormant',
  WAYSTONE_ACTIVE: 'waystone_active',
  PROP_ARCHWAY: 'prop_archway',
  PROP_PILLAR: 'prop_pillar',
  PROP_BRAZIER: 'prop_brazier',
  PROP_ASHEN_TREE: 'prop_ashen_tree',
  PROP_BOULDER: 'prop_boulder',
  PROP_RUIN_WALL: 'prop_ruin_wall',
  PROP_RIFT_FISSURE: 'prop_rift_fissure',
  NPC_WARDEN: 'npc_warden',
  NPC_SMITH: 'npc_smith',
  PROP_LORE_SHRINE: 'prop_lore_shrine',
  PROP_CHEST_CLOSED: 'prop_chest_closed',
  PROP_CHEST_OPEN: 'prop_chest_open',
  PROP_CAMPFIRE: 'prop_campfire',
  ASH_MOTE: 'ash_mote',
} as const;

export type AssetKey = (typeof ASSET_KEYS)[keyof typeof ASSET_KEYS];

export type AssetSourceType = 'procedural' | 'image' | 'spritesheet' | 'atlas';

export interface AssetDescriptor {
  key: AssetKey;
  sourceType: AssetSourceType;
  width: number;
  height: number;
  url?: string;
  atlasJsonUrl?: string;
  frameConfig?: {
    frameWidth: number;
    frameHeight: number;
  };
}

export const HERO_FRAME_WIDTH = 96;
export const HERO_FRAME_HEIGHT = 112;
export const HERO_FRAMES_PER_ROW = 6; // 2 idle frames + 4 walk cycle frames per direction

/**
 * Computes frame indices inside HERO_SPRITESHEET for any of the 8 facing directions.
 */
export function getHeroAnimationFrameIndices(facing: FacingDirection): {
  row: number;
  idleFrames: [number, number];
  walkFrames: [number, number, number, number];
} {
  const rowIndex = Math.max(0, ALL_FACING_DIRECTIONS.indexOf(facing));
  const base = rowIndex * HERO_FRAMES_PER_ROW;
  return {
    row: rowIndex,
    idleFrames: [base, base + 1],
    walkFrames: [base + 2, base + 3, base + 4, base + 5],
  };
}

export function getHeroAnimKey(mode: 'idle' | 'walk', facing: FacingDirection): string {
  return `hero-${mode}-${facing}`;
}

export const ASSET_MANIFEST: readonly AssetDescriptor[] = [
  {
    key: ASSET_KEYS.HERO_SPRITESHEET,
    sourceType: 'procedural',
    width: HERO_FRAME_WIDTH * HERO_FRAMES_PER_ROW, // 576
    height: HERO_FRAME_HEIGHT * ALL_FACING_DIRECTIONS.length, // 896
    frameConfig: {
      frameWidth: HERO_FRAME_WIDTH,
      frameHeight: HERO_FRAME_HEIGHT,
    },
  },
  { key: ASSET_KEYS.TERRAIN_ASHEN_TURF, sourceType: 'procedural', width: 128, height: 128 },
  { key: ASSET_KEYS.TERRAIN_COBBLESTONE, sourceType: 'procedural', width: 128, height: 128 },
  { key: ASSET_KEYS.TERRAIN_SANCTUARY_MOSAIC, sourceType: 'procedural', width: 128, height: 128 },
  { key: ASSET_KEYS.WAYSTONE_DORMANT, sourceType: 'procedural', width: 120, height: 180 },
  { key: ASSET_KEYS.WAYSTONE_ACTIVE, sourceType: 'procedural', width: 120, height: 180 },
  { key: ASSET_KEYS.PROP_ARCHWAY, sourceType: 'procedural', width: 220, height: 260 },
  { key: ASSET_KEYS.PROP_PILLAR, sourceType: 'procedural', width: 72, height: 200 },
  { key: ASSET_KEYS.PROP_BRAZIER, sourceType: 'procedural', width: 64, height: 96 },
  { key: ASSET_KEYS.PROP_ASHEN_TREE, sourceType: 'procedural', width: 160, height: 210 },
  { key: ASSET_KEYS.PROP_BOULDER, sourceType: 'procedural', width: 110, height: 84 },
  { key: ASSET_KEYS.PROP_RUIN_WALL, sourceType: 'procedural', width: 180, height: 110 },
  { key: ASSET_KEYS.PROP_RIFT_FISSURE, sourceType: 'procedural', width: 160, height: 90 },
  { key: ASSET_KEYS.NPC_WARDEN, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.NPC_SMITH, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.PROP_LORE_SHRINE, sourceType: 'procedural', width: 96, height: 128 },
  { key: ASSET_KEYS.PROP_CHEST_CLOSED, sourceType: 'procedural', width: 72, height: 64 },
  { key: ASSET_KEYS.PROP_CHEST_OPEN, sourceType: 'procedural', width: 72, height: 64 },
  { key: ASSET_KEYS.PROP_CAMPFIRE, sourceType: 'procedural', width: 84, height: 76 },
  { key: ASSET_KEYS.ASH_MOTE, sourceType: 'procedural', width: 16, height: 16 },
] as const;

export const STAGE1_ASSET_MANIFEST = ASSET_MANIFEST;
