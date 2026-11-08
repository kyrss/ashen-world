import { GAME_CONFIG } from '../core/config';

export interface WaystoneSpec {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number; // ground contact footY in 2D world coordinates
  zoneTitle: string;
  colliderWidth: number;
  colliderHeight: number;
}

export interface WorldInteractableSpec {
  id: string;
  name: string;
  roleTitle: string;
  kind: 'npc_warden' | 'npc_smith' | 'lore_shrine' | 'reliquary_chest' | 'campfire';
  x: number;
  y: number; // ground contact footY for Y-sorting
  actionLabel: string;
  dialogueLines: string[];
  xpReward: number;
  collider?: {
    width: number;
    height: number;
    offsetY?: number;
  };
}

export interface WorldPropSpec {
  id: string;
  x: number;
  y: number; // ground contact footY for Y-sorting
  kind:
    | 'archway'
    | 'pillar'
    | 'brazier'
    | 'ashen_tree'
    | 'boulder'
    | 'ruin_wall'
    | 'rift_fissure';
  scale: number;
  isGroundDecal?: boolean; // true for flat ground cracks that always stay below characters
  collider?: {
    width: number;
    height: number;
    offsetX?: number;
    offsetY?: number;
  };
}

export interface RoadPatchSpec {
  id: string;
  x: number; // center X
  y: number; // center Y
  width: number;
  height: number;
  surface: 'cobblestone' | 'sanctuary_mosaic';
}

export interface ZoneRegionSpec {
  id: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  title: string;
}

export const DEFAULT_SPAWN_POINT = {
  x: 490,
  y: 890,
} as const;

export const THRESHOLD_ZONES: ZoneRegionSpec[] = [
  {
    id: 'zone_gates',
    minX: 0,
    maxX: 860,
    minY: 0,
    maxY: 1600,
    title: 'Врата Заката · Западный Тракт',
  },
  {
    id: 'zone_sanctuary',
    minX: 860,
    maxX: 1660,
    minY: 0,
    maxY: 740,
    title: 'Святилище Расколотого Свода',
  },
  {
    id: 'zone_sentinel_camp',
    minX: 860,
    maxX: 1660,
    minY: 740,
    maxY: 1600,
    title: 'Лагерь Дозорных Вел\'Ариса',
  },
  {
    id: 'zone_ashen_grove',
    minX: 1660,
    maxX: 2400,
    minY: 0,
    maxY: 1600,
    title: 'Роща Пепельных Древ · Восточный Карниз',
  },
];

export const THRESHOLD_ROADS: RoadPatchSpec[] = [
  // Main West-East Ancient Cobblestone Road
  {
    id: 'road_west_east_main',
    x: 1200,
    y: 900,
    width: 1960,
    height: 150,
    surface: 'cobblestone',
  },
  // Sentinel Camp Central Courtyard
  {
    id: 'plaza_sentinel_camp',
    x: 1250,
    y: 960,
    width: 540,
    height: 340,
    surface: 'cobblestone',
  },
  // North-South Processional Avenue to Sanctuary
  {
    id: 'road_north_south_avenue',
    x: 1250,
    y: 660,
    width: 170,
    height: 540,
    surface: 'cobblestone',
  },
  // Upper Sanctuary Mosaic Plaza
  {
    id: 'plaza_sanctuary_mosaic',
    x: 1250,
    y: 410,
    width: 620,
    height: 340,
    surface: 'sanctuary_mosaic',
  },
  // West Gate Entry Plaza
  {
    id: 'plaza_west_gate',
    x: 420,
    y: 860,
    width: 340,
    height: 260,
    surface: 'cobblestone',
  },
  // Eastern Beacon Overlook Plaza
  {
    id: 'plaza_east_overlook',
    x: 2040,
    y: 890,
    width: 340,
    height: 260,
    surface: 'sanctuary_mosaic',
  },
];

export const THRESHOLD_WAYSTONES: WaystoneSpec[] = [
  {
    id: 'waystone_west',
    name: 'Обелиск Врат Заката',
    subtitle: 'Первичный якорь памяти у западного входа в Пепельный Рубеж',
    x: 420,
    y: 800,
    zoneTitle: 'Врата Заката · Западный Тракт',
    colliderWidth: 54,
    colliderHeight: 28,
  },
  {
    id: 'waystone_sanctuary',
    name: 'Резонатор Расколотого Свода',
    subtitle: 'Центральный обелиск древнего святилища Зодчих',
    x: 1250,
    y: 430,
    zoneTitle: 'Святилище Расколотого Свода',
    colliderWidth: 54,
    colliderHeight: 28,
  },
  {
    id: 'waystone_east',
    name: 'Маяк Пепельной Гряды',
    subtitle: 'Пограничный резонатор у Рощи Пепельных Древ',
    x: 2040,
    y: 840,
    zoneTitle: 'Роща Пепельных Древ · Восточный Карниз',
    colliderWidth: 54,
    colliderHeight: 28,
  },
];

export const THRESHOLD_INTERACTABLES: WorldInteractableSpec[] = [
  {
    id: 'npc_warden_kaelen',
    name: 'Хранитель Каэлен',
    roleTitle: 'Командор Заставы Вел\'Ариса',
    kind: 'npc_warden',
    x: 1120,
    y: 935,
    actionLabel: 'Говорить',
    dialogueLines: [
      '«Ты прошёл сквозь Пепельную Завесу живым, Страж. Редкое знамение в эти тёмные дни.»',
      '«Святилище на севере пробудилось после раскола Ядра. Осмотри Скрижаль Первого Разлома в верхнем зале и активируй три Путевых Обелиска.»',
    ],
    xpReward: 40,
    collider: { width: 42, height: 24, offsetY: -8 },
  },
  {
    id: 'npc_smith_thorn',
    name: 'Кузнец-Отшельник Торн',
    roleTitle: 'Мастер обсидиановой ковки',
    kind: 'npc_smith',
    x: 1395,
    y: 1035,
    actionLabel: 'Говорить',
    dialogueLines: [
      '«Обычная сталь крошится от дыхания Разлома. Здесь клинки закаляют в эфирной золе.»',
      '«Загляни в кованый ларь у восточной стены лагеря — я оставил там дорожные припасы и рунный фокус для твоего снаряжения.»',
    ],
    xpReward: 35,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
  {
    id: 'shrine_first_rift',
    name: 'Скрижаль Первого Разлома',
    roleTitle: 'Древний реликт Зодчих',
    kind: 'lore_shrine',
    x: 1250,
    y: 285,
    actionLabel: 'Изучить скрижаль',
    dialogueLines: [
      'На базальтовом монолите проступают светящиеся письмена Вел\'Ариса:',
      '«Когда Семь Печатей пали, эфир обратился пеплом. Лишь тот, кто удержит резонанс Обелисков, сможет пройти сквозь Врата Бездны.»',
    ],
    xpReward: 50,
    collider: { width: 58, height: 28, offsetY: -10 },
  },
  {
    id: 'chest_sentinel_reliquary',
    name: 'Кованый ларь Дозорных',
    roleTitle: 'Хранилище снаряжения заставы',
    kind: 'reliquary_chest',
    x: 1470,
    y: 875,
    actionLabel: 'Открыть ларь',
    dialogueLines: [
      'Вы отпираете тяжёлый окованный железом ларь заставы.',
      'Внутри найдены: «Малый эфирный кристалл», «Печать Дозорного Вел\'Ариса» и записи о тропах Восточного Карниза.',
    ],
    xpReward: 45,
    collider: { width: 52, height: 28, offsetY: -10 },
  },
  {
    id: 'campfire_west_watch',
    name: 'Походный костёр Дозора',
    roleTitle: 'Точка привала у тракта',
    kind: 'campfire',
    x: 680,
    y: 990,
    actionLabel: 'Отдохнуть у огня',
    dialogueLines: [
      'Тёплое пламя костра отгоняет ледяной пепельный туман.',
      'Силы и эфирный резерв полностью восстановлены.',
    ],
    xpReward: 25,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
];

export const THRESHOLD_PROPS: WorldPropSpec[] = [
  // Ancient Sanctuary & Road Archways (player walks around pillars / through or in front of arch)
  {
    id: 'prop_arch_west_gate',
    x: 270,
    y: 860,
    kind: 'archway',
    scale: 1.0,
    collider: { width: 170, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_arch_sanctuary_entry',
    x: 1250,
    y: 580,
    kind: 'archway',
    scale: 1.08,
    collider: { width: 64, height: 24, offsetX: -72, offsetY: -10 },
  },
  {
    id: 'prop_arch_east_grove',
    x: 1790,
    y: 860,
    kind: 'archway',
    scale: 1.0,
    collider: { width: 60, height: 24, offsetX: -68, offsetY: -10 },
  },

  // Sanctuary & Courtyard Pillars (Y-sorted so player walks behind and in front of columns)
  {
    id: 'prop_pillar_sanct_nw',
    x: 1010,
    y: 340,
    kind: 'pillar',
    scale: 1.05,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
  {
    id: 'prop_pillar_sanct_ne',
    x: 1490,
    y: 340,
    kind: 'pillar',
    scale: 1.05,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
  {
    id: 'prop_pillar_sanct_sw',
    x: 1010,
    y: 510,
    kind: 'pillar',
    scale: 1.05,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
  {
    id: 'prop_pillar_sanct_se',
    x: 1490,
    y: 510,
    kind: 'pillar',
    scale: 1.05,
    collider: { width: 44, height: 24, offsetY: -8 },
  },
  {
    id: 'prop_pillar_camp_w',
    x: 990,
    y: 840,
    kind: 'pillar',
    scale: 0.95,
    collider: { width: 40, height: 22, offsetY: -8 },
  },
  {
    id: 'prop_pillar_camp_e',
    x: 1510,
    y: 840,
    kind: 'pillar',
    scale: 0.95,
    collider: { width: 40, height: 22, offsetY: -8 },
  },

  // Burning Braziers along roads and plazas
  {
    id: 'prop_brazier_west_1',
    x: 360,
    y: 760,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_west_2',
    x: 360,
    y: 980,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_sanct_1',
    x: 1140,
    y: 410,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_sanct_2',
    x: 1360,
    y: 410,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_camp_1',
    x: 1140,
    y: 830,
    kind: 'brazier',
    scale: 0.95,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_camp_2',
    x: 1360,
    y: 830,
    kind: 'brazier',
    scale: 0.95,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_east_1',
    x: 1960,
    y: 780,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },
  {
    id: 'prop_brazier_east_2',
    x: 1960,
    y: 980,
    kind: 'brazier',
    scale: 1.0,
    collider: { width: 32, height: 20, offsetY: -6 },
  },

  // Gnarled Petrified Ashen Trees (tall canopies for clear Y-sorting demonstration)
  {
    id: 'prop_tree_west_north',
    x: 610,
    y: 690,
    kind: 'ashen_tree',
    scale: 1.1,
    collider: { width: 46, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_west_south',
    x: 560,
    y: 1130,
    kind: 'ashen_tree',
    scale: 1.05,
    collider: { width: 46, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_road_mid_n',
    x: 840,
    y: 730,
    kind: 'ashen_tree',
    scale: 1.0,
    collider: { width: 44, height: 24, offsetY: -10 },
  },
  {
    id: 'prop_tree_road_mid_s',
    x: 870,
    y: 1110,
    kind: 'ashen_tree',
    scale: 1.12,
    collider: { width: 48, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_sanct_west',
    x: 840,
    y: 420,
    kind: 'ashen_tree',
    scale: 1.15,
    collider: { width: 48, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_sanct_east',
    x: 1650,
    y: 430,
    kind: 'ashen_tree',
    scale: 1.15,
    collider: { width: 48, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_grove_1',
    x: 1760,
    y: 670,
    kind: 'ashen_tree',
    scale: 1.18,
    collider: { width: 48, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_grove_2',
    x: 2150,
    y: 660,
    kind: 'ashen_tree',
    scale: 1.1,
    collider: { width: 46, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_grove_3',
    x: 1820,
    y: 1120,
    kind: 'ashen_tree',
    scale: 1.08,
    collider: { width: 46, height: 26, offsetY: -10 },
  },
  {
    id: 'prop_tree_grove_4',
    x: 2160,
    y: 1100,
    kind: 'ashen_tree',
    scale: 1.15,
    collider: { width: 48, height: 26, offsetY: -10 },
  },

  // Ruined Stone Walls & Mossy Boulders
  {
    id: 'prop_wall_sanct_north_w',
    x: 1060,
    y: 230,
    kind: 'ruin_wall',
    scale: 1.0,
    collider: { width: 150, height: 32, offsetY: -12 },
  },
  {
    id: 'prop_wall_sanct_north_e',
    x: 1440,
    y: 230,
    kind: 'ruin_wall',
    scale: 1.0,
    collider: { width: 150, height: 32, offsetY: -12 },
  },
  {
    id: 'prop_wall_camp_south',
    x: 1250,
    y: 1210,
    kind: 'ruin_wall',
    scale: 1.1,
    collider: { width: 165, height: 34, offsetY: -12 },
  },
  {
    id: 'prop_boulder_west_1',
    x: 470,
    y: 630,
    kind: 'boulder',
    scale: 1.0,
    collider: { width: 68, height: 34, offsetY: -12 },
  },
  {
    id: 'prop_boulder_camp_w',
    x: 980,
    y: 1120,
    kind: 'boulder',
    scale: 0.95,
    collider: { width: 64, height: 32, offsetY: -12 },
  },
  {
    id: 'prop_boulder_grove_n',
    x: 1960,
    y: 560,
    kind: 'boulder',
    scale: 1.1,
    collider: { width: 74, height: 36, offsetY: -12 },
  },
  {
    id: 'prop_boulder_grove_e',
    x: 2230,
    y: 890,
    kind: 'boulder',
    scale: 1.05,
    collider: { width: 70, height: 34, offsetY: -12 },
  },

  // Glowing Aether Rift Fissures (flat decals on the ground)
  {
    id: 'prop_rift_west',
    x: 740,
    y: 780,
    kind: 'rift_fissure',
    scale: 1.0,
    isGroundDecal: true,
  },
  {
    id: 'prop_rift_sanctuary',
    x: 1250,
    y: 520,
    kind: 'rift_fissure',
    scale: 1.1,
    isGroundDecal: true,
  },
  {
    id: 'prop_rift_grove',
    x: 1920,
    y: 960,
    kind: 'rift_fissure',
    scale: 1.15,
    isGroundDecal: true,
  },
];

export function resolveZoneTitle(x: number, y: number = 900): string {
  for (const zone of THRESHOLD_ZONES) {
    if (x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY) {
      return zone.title;
    }
  }
  return THRESHOLD_ZONES[0].title;
}

export function findNearestWaystone(
  x: number,
  y: number,
  maxRadius: number = GAME_CONFIG.WAYSTONE_INTERACT_RADIUS
): WaystoneSpec | null {
  let closest: WaystoneSpec | null = null;
  let bestDistSq = maxRadius * maxRadius;

  for (const ws of THRESHOLD_WAYSTONES) {
    const dx = ws.x - x;
    const dy = ws.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      closest = ws;
    }
  }
  return closest;
}

export function findNearestInteractable(
  x: number,
  y: number,
  maxRadius: number = GAME_CONFIG.INTERACT_RADIUS
): WorldInteractableSpec | null {
  let closest: WorldInteractableSpec | null = null;
  let bestDistSq = maxRadius * maxRadius;

  for (const item of THRESHOLD_INTERACTABLES) {
    const dx = item.x - x;
    const dy = item.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      closest = item;
    }
  }
  return closest;
}

export function clampWorldPosition(
  x: number,
  y: number,
  halfWidth: number = 22,
  halfHeight: number = 20
): { x: number; y: number } {
  const minX = GAME_CONFIG.WORLD_MARGIN + halfWidth;
  const maxX = GAME_CONFIG.WORLD_WIDTH - GAME_CONFIG.WORLD_MARGIN - halfWidth;
  const minY = GAME_CONFIG.WORLD_MARGIN + 80 + halfHeight;
  const maxY = GAME_CONFIG.WORLD_HEIGHT - GAME_CONFIG.WORLD_MARGIN - halfHeight;
  return {
    x: Math.round(Math.max(minX, Math.min(maxX, x))),
    y: Math.round(Math.max(minY, Math.min(maxY, y))),
  };
}

export interface AABB {
  x: number; // center X
  y: number; // center Y
  width: number;
  height: number;
}

export function checkAABBOverlap(a: AABB, b: AABB): boolean {
  const halfW = (a.width + b.width) * 0.5;
  const halfH = (a.height + b.height) * 0.5;
  return Math.abs(a.x - b.x) < halfW && Math.abs(a.y - b.y) < halfH;
}

/**
 * Collects all static obstacle AABBs in the 2D RPG world (waystones, solid props, NPCs/interactables).
 */
export function getAllWorldObstacleAABBs(): AABB[] {
  const boxes: AABB[] = [];

  for (const ws of THRESHOLD_WAYSTONES) {
    boxes.push({
      x: ws.x,
      y: ws.y - 10,
      width: ws.colliderWidth,
      height: ws.colliderHeight,
    });
  }

  for (const item of THRESHOLD_INTERACTABLES) {
    if (item.collider) {
      boxes.push({
        x: item.x,
        y: item.y + (item.collider.offsetY ?? -8),
        width: item.collider.width,
        height: item.collider.height,
      });
    }
  }

  for (const prop of THRESHOLD_PROPS) {
    if (prop.collider) {
      boxes.push({
        x: prop.x + (prop.collider.offsetX ?? 0),
        y: prop.y + (prop.collider.offsetY ?? -8),
        width: prop.collider.width,
        height: prop.collider.height,
      });
    }
  }

  return boxes;
}

/**
 * Checks whether a given 2D foot position (x, y) is free of any static world obstacle collision.
 */
export function isPositionWalkable(
  x: number,
  y: number,
  footWidth: number = 32,
  footHeight: number = 22
): boolean {
  const clamped = clampWorldPosition(x, y);
  if (Math.abs(clamped.x - x) > 2 || Math.abs(clamped.y - y) > 2) {
    return false;
  }

  const playerBox: AABB = { x, y, width: footWidth, height: footHeight };
  const obstacles = getAllWorldObstacleAABBs();
  for (const obs of obstacles) {
    if (checkAABBOverlap(playerBox, obs)) {
      return false;
    }
  }
  return true;
}

/**
 * Resolves a safe, non-overlapping walkable position for spawning or migrating a save record.
 */
export function resolveSafeWalkablePosition(rawX: number, rawY: number): { x: number; y: number } {
  const clamped = clampWorldPosition(rawX, rawY);
  if (isPositionWalkable(clamped.x, clamped.y)) {
    return clamped;
  }

  // Spiral search outwards for the nearest clear cobblestone coordinate
  for (let radius = 24; radius <= 240; radius += 24) {
    for (let angleDeg = 0; angleDeg < 360; angleDeg += 45) {
      const rad = (angleDeg * Math.PI) / 180;
      const testX = Math.round(clamped.x + Math.cos(rad) * radius);
      const testY = Math.round(clamped.y + Math.sin(rad) * radius);
      if (isPositionWalkable(testX, testY)) {
        return { x: testX, y: testY };
      }
    }
  }

  return { ...DEFAULT_SPAWN_POINT };
}
