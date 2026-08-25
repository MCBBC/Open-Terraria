// 风暴落雷生成器（WorldGen.SpawnStormLightning :72436-72575 + IsSafeFromRain
// :73537-73558 + TrySpawnLightningBolt :72577-72595,1.4.5 新机制——雷暴期天雷
// 劈下造成 500 基伤范围伤害,1091 号弹 AI_203 标记-落雷两段式,proj1457.StormLightning）。
// 吸雷方块集 = TileID.Sets.AttractsStormLightning（TileID.cs:423 全表,原版 sheet id
// 经 TILE_INTERNAL_OF_STABLE 换算为内部 id）。
import { TILE_INTERNAL_OF_STABLE } from '../data/tiles';
import type { GameHooks } from '../entities/types';

/** TileID.Sets.AttractsStormLightning（TileID.cs:423 原版 sheet id 全表）——
 *  各类矿石/金属/人工块/宝石/树等引雷面。初始化换算为内部 id 集合。 */
const ATTRACT_SHEET = [
  6, 7, 8, 9, 16, 22, 37, 45, 46, 47, 48, 49, 58, 76, 92, 96, 97, 99, 102, 107, 108,
  111, 121, 122, 132, 133, 134, 136, 139, 140, 142, 143, 144, 149, 150, 166, 167,
  168, 169, 173, 174, 175, 176, 177, 202, 204, 210, 211, 214, 221, 222, 223, 235,
  239, 247, 248, 249, 250, 272, 283, 284, 287, 301, 305, 306, 307, 314, 315, 325,
  330, 331, 332, 333, 346, 347, 348, 350, 356, 370, 372, 390, 406, 408, 409, 411,
  415, 416, 417, 418, 419, 420, 423, 424, 425, 429, 445, 462, 463, 472, 473, 489,
  490, 493, 499, 506, 546, 557, 560, 564, 565, 571, 617, 642, 646, 657, 658, 663,
  669, 670, 671, 672, 673, 674, 675, 676, 680, 681, 682, 684, 685, 686, 706, 720,
  721, 722, 725, 726, 733, 735, 739, 753,
];
/** 内部 id 集合（懒构建） */
let ATTRACT_INTERNAL: Set<number> | null = null;
function attractsInternal(): Set<number> {
  if (!ATTRACT_INTERNAL) {
    ATTRACT_INTERNAL = new Set();
    for (const s of ATTRACT_SHEET) {
      const internal = TILE_INTERNAL_OF_STABLE[s];
      if (internal) ATTRACT_INTERNAL.add(internal);
    }
  }
  return ATTRACT_INTERNAL;
}

/** Player.AFKTimeNeededForNoLuckyStars（Player.cs:809 AFK 5min=18000t）——
 *  挂机玩家不招天雷（防挂机刷怪）；本仓无 afkCounter,恒 0=活跃 */
const AFK_THRESHOLD = 18000;

/** IsSafeFromRain（:73537-73558）：从落点沿【雨水下落反向】上方 85 格画 4px 宽
 *  线,任一实心=有遮蔽=安全。雨速 = (windCurrent×18, 14)（Rain.cs:94-98）。 */
function isSafeFromRain(game: GameHooks, startX: number, startY: number): boolean {
  const st = game.world.store;
  const wind = game.world.weather.windSpeedCurrent;
  // Rain.GetRainFallVelocity = (wind×18, 14)——反向归一 = 上空方向
  const rvx = wind * 18, rvy = 14;
  const len = Math.hypot(rvx, rvy) || 1;
  const dx = -rvx / len, dy = -rvy / len;
  const px = startX * 16 + 8, py = startY * 16 + 8;
  const dist = 85 * 16;
  // PlotTileLine 宽 4px 近似：步进 8px,查步点 ±2px 四角
  const steps = Math.ceil(dist / 8);
  for (let i = 1; i <= steps; i++) {
    const cx = px + dx * 8 * i, cy = py + dy * 8 * i;
    for (const [ox, oy] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
      const tx = Math.floor((cx + ox) / 16), ty = Math.floor((cy + oy) / 16);
      if (tx < 0 || ty < 0 || tx >= st.w || ty >= st.h) return true;   // 出界=出地表=安全
      if (st.isSolid(tx, ty)) return true;
    }
  }
  return false;
}

/** 风暴落雷每 tick 入口（UpdateWorld :72073 SpawnStormLightning()）。 */
export function spawnStormLightningTick(game: GameHooks): void {
  const w = game.world;
  const sf = w.seedFlags ?? {};
  const more = sf.moreLightning === true;
  const no = sf.noLightning === true;
  if (no && !more) return;                                       // :72438-72440
  const moreOnly = more && !no;                                  // :72442
  // :72443-72445 门：非雷暴时（moreLightning 种子）须至少在下雨
  if (!w.weather.storming && (!moreOnly || !w.weather.raining)) return;
  // :72447-72449 基率 150;AnyDanger（boss 在场）×1.5
  let num = 150;
  if (game.anyBossDanger?.()) num = Math.trunc(1.5 * num);
  if (moreOnly) {
    let div = 2;
    if (!w.weather.storming) div = w.weather.cloudAlpha || 0.01;
    num = Math.trunc(num / (div * 1.0));
    if (num < 1) num = 1;
  }
  // ---- 安全区（:72455-72468）：每玩家 24×24 盒 ∪ 速度外推盒（vx 钳 ±5.75×60/16 格）
  const safespots: Array<{ x: number; y: number; w: number; h: number }> = [];
  const players: Array<{ x: number; y: number; w: number; h: number; vx: number; cy: number; zoneRain: boolean; zoneSnow: boolean; sleeping: boolean; fishing: boolean }> = [];
  const p = game.player;
  if (p && !p.dead) {
    players.push({
      x: p.x, y: p.y, w: p.w, h: p.h, vx: p.vx, cy: p.cy,
      zoneRain: !!game.world.scene?.zoneRain, zoneSnow: !!game.world.scene?.zoneSnow,
      sleeping: false, fishing: false,   // 睡眠/持竿系统未移植——倍率恒 1（登记）
    });
    const vxClamped = Math.max(-5.75, Math.min(5.75, p.vx));
    const offTiles = Math.trunc((vxClamped * 60) / 16);
    safespots.push({ x: p.x / 16 - 12, y: p.y / 16 - 12, w: 24, h: 24 });
    safespots.push({ x: p.x / 16 - 12 + offTiles, y: p.y / 16 - 12, w: 24, h: 24 });
  }
  // ---- 每玩家掷骰（:72471-72489）：ZoneRain && !ZoneSnow && 非 AFK → 1/num
  for (const pl of players) {
    if (!pl.zoneRain || pl.zoneSnow) continue;
    let n = num;
    if (pl.sleeping) n *= 2;
    if (pl.fishing) n *= 2;
    if (Math.floor(Math.random() * n) !== 0) continue;
    spawnStormLightningNearPlayer(game, safespots, pl);
  }
}

/** SpawnStormLightningNearPlayer（:72492-72531）：视口域 400 次尝试选落点。 */
function spawnStormLightningNearPlayer(
  game: GameHooks,
  safespots: Array<{ x: number; y: number; w: number; h: number }>,
  pl: { x: number; y: number },
): void {
  const st = game.world.store;
  // Utils.CenteredRectangle(player.Center, Zero).Inflate(MaxWorldViewSize/32)
  // （Main.cs:754-756：1920×1200 → ±60×±37.5 格）,钳世界（留 10 格边）
  const inflateX = Math.trunc(1920 / 32), inflateY = Math.trunc(1200 / 32);
  const left = Math.max(10, Math.floor(pl.x / 16) - inflateX);
  const right = Math.min(st.w - 10, Math.floor(pl.x / 16) + inflateX);
  const top = Math.max(10, Math.floor(pl.y / 16) - inflateY);
  const bottom = Math.min(st.h - 10, Math.floor(pl.y / 16) + inflateY);
  if (left >= right || top >= bottom) return;
  const attract = attractsInternal();
  for (let i = 0; i < 400; i++) {
    let x = left + Math.floor(Math.random() * (right - left + 1));
    let y = top + Math.floor(Math.random() * (bottom - top + 1));
    // :72510-72513 吸雷柱上行：上方格 IsLightningAttractor → 踏到柱顶
    while (y > 0 && isLightningAttractor(game, x, y - 1)) y--;
    if (i < 350) {
      // 前 350 次：必须落在吸雷面上（:72515-72518）
      if (!isLightningAttractor(game, x, y)) continue;
    } else {
      // 后 50 次：无液体非实心 → 跳过（=只劈地面/水面,任意点）
      const ti = st.idx(x, y);
      if (st.liquid[ti] === 0 && !st.isSolid(x, y)) continue;
    }
    // :72522-72524 落点上格须非液体（不在水下打雷）
    if (y <= 0 || st.liquid[st.idx(x, y - 1)] !== 0) continue;
    if (trySpawnLightningBolt(game, safespots, x, y)) break;
  }
}

/** IsLightningAttractor（:72539-72547）：nactive &&（GetsCheckedForLeaves 族 ||
 *  AttractsStormLightning）——叶检族（树冠）整株引雷。本仓叶表未建模,按吸雷集直判。 */
function isLightningAttractor(game: GameHooks, x: number, y: number): boolean {
  const st = game.world.store;
  if (!st.inBounds(x, y)) return false;
  const ti = st.idx(x, y);
  if (st.type[ti] === 0) return false;
  return attractsInternal().has(st.type[ti]);
}

/** TrySpawnLightningBolt（safespots 版,:72551-72575）：雨遮/安全区/800px 去重/
 *  CanHitTarget 四门 → 生成 1091。shouldSkipForThisPlayer = 800px 内已有雷。 */
function trySpawnLightningBolt(
  game: GameHooks,
  safespots: Array<{ x: number; y: number; w: number; h: number }>,
  x: number,
  y: number,
): boolean {
  if (isSafeFromRain(game, x, y - 1)) return false;
  for (const s of safespots) {
    if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return false;
  }
  const px = x * 16 + 8, py = y * 16 + 2;
  // :72563-72570 800px 去重：同屏已有 1091 → 本 tick 略（防多雷同帧扎堆）
  for (const pr of game.projectiles?.() ?? []) {
    const anyProj = pr as { projId?: number; dead?: boolean; x?: number; y?: number };
    if (!anyProj.dead && anyProj.projId === 1091
      && Math.hypot((anyProj.x ?? 0) + 8 - px, (anyProj.y ?? 0) + 8 - py) < 800) {
      return false;
    }
  }
  return trySpawnLightningBoltDirect(game, x, y);
}

/** TrySpawnLightningBolt（:72577-72595）：液体深度微调落点 + CanHitTarget
 *  （LightningGenerator.StormLightning 折线无遮蔽校验,种子即 bolt 形状种子）
 *  → NewProjectile(1091, 500 伤, ai0=-1, ai2=种子)。 */
function trySpawnLightningBoltDirect(game: GameHooks, x: number, y: number): boolean {
  const st = game.world.store;
  const seed = Math.floor(Math.random() * 4294967295) >>> 0;   // Next(MaxFloatInt+1)
  let yOff = 2;
  const liq = st.liquid[st.idx(x, y)];
  if (liq > 0) yOff += Math.trunc((16 * (255 - liq)) / 255);
  const vx = x * 16 + 8, vy = y * 16 + yOff;
  // CanHitTarget（LightningGenerator.cs:288-291）：Generate(calcPositions:false)
  // 的折线无 tile 碰撞 → 天空到落点无遮蔽（bolt 形状按种子确定性生成）
  const bolt = game.stormLightningBolt?.(seed, vx, vy);
  if (!bolt || bolt.collidedWithTile) return false;
  game.spawnStormBolt1091?.(vx, vy, seed);
  return true;
}
