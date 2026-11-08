import { GAME_CONFIG } from '../core/config';

export interface PlatformSpec {
  id: string;
  label: string;
  x: number; // center X in world coordinates
  y: number; // center Y in world coordinates
  width: number;
  height: number;
  kind: 'ground' | 'terrace' | 'step' | 'bridge' | 'monolith_wall';
  oneWayUp?: boolean; // allows jumping up through the underside onto elevated sanctuary tiers
}

export interface WaystoneSpec {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  y: number; // base Y on platform surface
  zoneTitle: string;
}

export interface RuinPropSpec {
  id: string;
  x: number;
  y: number;
  kind: 'archway' | 'pillar' | 'rift_fissure' | 'brazier' | 'statue_base';
  scale: number;
}

export interface ZoneBannerSpec {
  id: string;
  minX: number;
  maxX: number;
  title: string;
}

export const THRESHOLD_ZONES: ZoneBannerSpec[] = [
  { id: 'zone_gates', minX: 0, maxX: 1050, title: 'Врата Заката · Западный Бастион' },
  { id: 'zone_sanctuary', minX: 1050, maxX: 2180, title: 'Святилище Расколотого Свода' },
  { id: 'zone_ridge', minX: 2180, maxX: 3200, title: 'Восточный Карниз · Разлом Ветров' },
];

export const THRESHOLD_PLATFORMS: PlatformSpec[] = [
  // Main continuous lower ground strata (top surface Y = 740)
  {
    id: 'ground_west',
    label: 'Западная базальтовая плита',
    x: 580,
    y: 820,
    width: 1160,
    height: 160,
    kind: 'ground',
  },
  {
    id: 'ground_center',
    label: 'Центральное основание святилища',
    x: 1640,
    y: 820,
    width: 960,
    height: 160,
    kind: 'ground',
  },
  {
    id: 'ground_east',
    label: 'Восточное плато над разломом',
    x: 2660,
    y: 820,
    width: 1080,
    height: 160,
    kind: 'ground',
  },

  // Boundary monolith walls
  {
    id: 'wall_west_bound',
    label: 'Западный Пограничный Монолит',
    x: 28,
    y: 450,
    width: 56,
    height: 900,
    kind: 'monolith_wall',
  },
  {
    id: 'wall_east_bound',
    label: 'Восточный Пограничный Монолит',
    x: 3172,
    y: 450,
    width: 56,
    height: 900,
    kind: 'monolith_wall',
  },

  // Stepped terraces and elevated sanctuary platforms (all >= 36px thick for anti-tunneling)
  {
    id: 'step_west_1',
    label: 'Ступень Дозора I',
    x: 680,
    y: 658, // top = 640 (100px above ground 740)
    width: 196,
    height: 36,
    kind: 'step',
    oneWayUp: true,
  },
  {
    id: 'terrace_west_upper',
    label: 'Терраса Дозорных',
    x: 960,
    y: 578, // top = 558 (82px above step_west_1)
    width: 280,
    height: 40,
    kind: 'terrace',
    oneWayUp: true,
  },
  {
    id: 'bridge_chasm_1',
    label: 'Мост Эфирной Жилы',
    x: 1240,
    y: 642, // top = 624 (98px above ground / transition to sanctuary)
    width: 224,
    height: 36,
    kind: 'bridge',
    oneWayUp: true,
  },
  {
    id: 'terrace_sanctuary_main',
    label: 'Алтарь Расколотого Свода',
    x: 1580,
    y: 575, // top = 555 (69px above bridge_chasm_1)
    width: 420,
    height: 40,
    kind: 'terrace',
    oneWayUp: true,
  },
  {
    id: 'step_sanctuary_high',
    label: 'Верхний Архитрав Зодчих',
    x: 1580,
    y: 472, // top = 454 (101px above terrace_sanctuary_main 555 — well within 131.8px jump apex)
    width: 240,
    height: 36,
    kind: 'step',
    oneWayUp: true,
  },
  {
    id: 'step_east_1',
    label: 'Восточный уступ I',
    x: 1940,
    y: 658, // top = 640 (100px above ground 740)
    width: 210,
    height: 36,
    kind: 'step',
    oneWayUp: true,
  },
  {
    id: 'bridge_chasm_2',
    label: 'Карниз Пепельного Ветра',
    x: 2220,
    y: 568, // top = 550 (90px above step_east_1)
    width: 260,
    height: 36,
    kind: 'bridge',
    oneWayUp: true,
  },
  {
    id: 'terrace_east_observatory',
    label: 'Площадка Маяка Гряды',
    x: 2620,
    y: 648, // top = 628 (112px above ground 740)
    width: 340,
    height: 40,
    kind: 'terrace',
    oneWayUp: true,
  },
  {
    id: 'monolith_obstacle_1',
    label: 'Обрушенный пилон',
    x: 1460,
    y: 706, // top = 672 (68px above ground 740)
    width: 84,
    height: 68,
    kind: 'step',
  },
];

export const THRESHOLD_WAYSTONES: WaystoneSpec[] = [
  {
    id: 'waystone_west',
    name: 'Обелиск Врат Заката',
    subtitle: 'Первичный якорь памяти у западного входа в Пепельный Рубеж',
    x: 340,
    y: 740,
    zoneTitle: 'Врата Заката · Западный Бастион',
  },
  {
    id: 'waystone_sanctuary',
    name: 'Резонатор Расколотого Свода',
    subtitle: 'Центральный обелиск древнего святилища на возвышенном алтаре',
    x: 1580,
    y: 555,
    zoneTitle: 'Святилище Расколотого Свода',
  },
  {
    id: 'waystone_east',
    name: 'Маяк Пепельной Гряды',
    subtitle: 'Пограничный резонатор у обрыва Разлома Ветров',
    x: 2880,
    y: 740,
    zoneTitle: 'Восточный Карниз · Разлом Ветров',
  },
];

export const THRESHOLD_PROPS: RuinPropSpec[] = [
  { id: 'prop_arch_west', x: 230, y: 740, kind: 'archway', scale: 1.0 },
  { id: 'prop_brazier_1', x: 430, y: 740, kind: 'brazier', scale: 1.0 },
  { id: 'prop_pillar_1', x: 840, y: 740, kind: 'pillar', scale: 1.05 },
  { id: 'prop_rift_1', x: 1120, y: 790, kind: 'rift_fissure', scale: 1.1 },
  { id: 'prop_arch_center', x: 1580, y: 555, kind: 'archway', scale: 1.15 },
  { id: 'prop_brazier_2', x: 1430, y: 555, kind: 'brazier', scale: 0.95 },
  { id: 'prop_brazier_3', x: 1730, y: 555, kind: 'brazier', scale: 0.95 },
  { id: 'prop_pillar_2', x: 1820, y: 760, kind: 'pillar', scale: 1.0 },
  { id: 'prop_rift_2', x: 2130, y: 790, kind: 'rift_fissure', scale: 1.2 },
  { id: 'prop_pillar_3', x: 2510, y: 628, kind: 'pillar', scale: 0.9 },
  { id: 'prop_arch_east', x: 2990, y: 740, kind: 'archway', scale: 1.0 },
  { id: 'prop_brazier_4', x: 2790, y: 740, kind: 'brazier', scale: 1.0 },
];

export function resolveZoneTitle(x: number): string {
  for (const zone of THRESHOLD_ZONES) {
    if (x >= zone.minX && x <= zone.maxX) {
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
    const dy = ws.y - 44 - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      bestDistSq = distSq;
      closest = ws;
    }
  }
  return closest;
}

export function clampWorldPosition(
  x: number,
  y: number,
  halfWidth: number = 22,
  halfHeight: number = 38
): { x: number; y: number } {
  const minX = 56 + halfWidth;
  const maxX = GAME_CONFIG.WORLD_WIDTH - 56 - halfWidth;
  const minY = halfHeight;
  const maxY = GAME_CONFIG.GROUND_Y - halfHeight;
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
 * Verifies that every walkable elevated platform in THRESHOLD_PLATFORMS has at least one
 * lower supporting platform within horizontal reach whose vertical step height is
 * strictly less than 90% of the player's physical jump apex (v^2 / 2g).
 */
export function verifyAllPlatformsReachable(
  jumpVelocity: number = GAME_CONFIG.PLAYER_JUMP_VELOCITY,
  gravityY: number = GAME_CONFIG.GRAVITY_Y
): { reachable: boolean; maxJumpApexPx: number; unreachableIds: string[] } {
  const maxJumpApexPx = (jumpVelocity * jumpVelocity) / (2 * gravityY);
  const safeStepLimit = maxJumpApexPx * 0.9;
  const walkable = THRESHOLD_PLATFORMS.filter((p) => p.kind !== 'monolith_wall');
  const unreachableIds: string[] = [];

  for (const target of walkable) {
    if (target.kind === 'ground') continue;
    const targetTop = target.y - target.height * 0.5;
    const targetLeft = target.x - target.width * 0.5;
    const targetRight = target.x + target.width * 0.5;

    let hasStepFromBelow = false;
    for (const source of walkable) {
      if (source.id === target.id) continue;
      const sourceTop = source.y - source.height * 0.5;
      const verticalRise = sourceTop - targetTop;

      if (verticalRise > 0 && verticalRise <= safeStepLimit) {
        const sourceLeft = source.x - source.width * 0.5;
        const sourceRight = source.x + source.width * 0.5;
        const horizGap = Math.max(0, targetLeft - sourceRight, sourceLeft - targetRight);
        if (horizGap <= 280) {
          hasStepFromBelow = true;
          break;
        }
      }
    }

    if (!hasStepFromBelow) {
      unreachableIds.push(target.id);
    }
  }

  return {
    reachable: unreachableIds.length === 0,
    maxJumpApexPx: Number(maxJumpApexPx.toFixed(2)),
    unreachableIds,
  };
}
