/**
 * Unified Asset Manifest for ASHEN WORLD.
 * Decouples logical texture/sprite keys used by game scenes from how those assets are loaded.
 * In Stage 1, entries use procedural Canvas generation ('procedural').
 * In future stages, any entry can be switched to 'image', 'spritesheet', or 'atlas' with a file URL
 * without changing scene or physics logic.
 */

export const ASSET_KEYS = {
  SEEKER_IDLE: 'seeker_idle',
  SEEKER_WALK_1: 'seeker_walk_1',
  SEEKER_WALK_2: 'seeker_walk_2',
  SEEKER_AIR: 'seeker_air',
  SEEKER_DASH: 'seeker_dash',
  BASALT_PLATFORM_TILE: 'basalt_platform_tile',
  WAYSTONE_DORMANT: 'waystone_dormant',
  WAYSTONE_ACTIVE: 'waystone_active',
  PROP_ARCHWAY: 'prop_archway',
  PROP_PILLAR: 'prop_pillar',
  PROP_BRAZIER: 'prop_brazier',
  PROP_RIFT_FISSURE: 'prop_rift_fissure',
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

export const STAGE1_ASSET_MANIFEST: readonly AssetDescriptor[] = [
  { key: ASSET_KEYS.SEEKER_IDLE, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.SEEKER_WALK_1, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.SEEKER_WALK_2, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.SEEKER_AIR, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.SEEKER_DASH, sourceType: 'procedural', width: 96, height: 112 },
  { key: ASSET_KEYS.BASALT_PLATFORM_TILE, sourceType: 'procedural', width: 128, height: 64 },
  { key: ASSET_KEYS.WAYSTONE_DORMANT, sourceType: 'procedural', width: 120, height: 180 },
  { key: ASSET_KEYS.WAYSTONE_ACTIVE, sourceType: 'procedural', width: 120, height: 180 },
  { key: ASSET_KEYS.PROP_ARCHWAY, sourceType: 'procedural', width: 220, height: 260 },
  { key: ASSET_KEYS.PROP_PILLAR, sourceType: 'procedural', width: 72, height: 200 },
  { key: ASSET_KEYS.PROP_BRAZIER, sourceType: 'procedural', width: 64, height: 96 },
  { key: ASSET_KEYS.PROP_RIFT_FISSURE, sourceType: 'procedural', width: 160, height: 90 },
  { key: ASSET_KEYS.ASH_MOTE, sourceType: 'procedural', width: 16, height: 16 },
] as const;
