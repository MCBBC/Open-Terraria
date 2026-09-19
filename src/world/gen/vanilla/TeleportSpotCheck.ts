// ★IIIII110b（2026-09-04）：Utils.CheckForGoodTeleportationSpot + 消费 Collision 谓词族
// 【逐句移植】——IIIII41-T3① 精简核（randomizeWorldSpawnCore 内联版）的省略件全补：
//   像素盒几何 / wall87 臂 / 地牢墙∧y>ws 臂 / strictRange 下坠逐格 Contains /
//   Wet·Lava·AnyHurtingTiles 像素盒 / 四向 TileCollision 16px 逃逸探针 /
//   mostlySolidFloor 双侧 !solidTop 判定。
// cs 锚：Terarria1458/Terraria/Utils.cs:518-647（CheckForGoodTeleportationSpot +
//   _CheckNoInvalidTiles :484-516）、Collision.cs SolidCollision :2713-2747 /
//   WetCollision :1575-1656 / LavaCollision :1657-1700 / TileCollision :2299-2415 /
//   AnyHurtingTiles→HurtTiles :3123-3217 / CanTileHurt :3219-3236。
// II41 精简核备案「SlopeCollision 逐帧下坠≈省略」定谳为【精确等价】：vanilla 调用
//   `Collision.SlopeCollision(vector, …)`（Utils.cs:571）——C# Vector2 按值传递且
//   返回值被丢弃 ⇒ 对调用方 vector 零效果（静态旗 sloping/stair 生成期无实体消费者）
//   ——本移植整段省略（非近似）。
// 坐标契约：本模块全部走【像素】域（Position.X/Y + Width/Height），格子语义
//   （active/type/wall/liquid/half/slope/frameY/致动位）从 TileStore 直读。
//   vanilla 类型静态表（Main.tileSolid/tileSolidTop/TileID.Sets.*）按 sheet 空间
//   建表再映射 internal id——同源表：U 批 DG_SOLID_TOP / BuriedChestsPass.PC_SOLID_TOP。
// RNG 纪律：attempt 掷序 = `Next(rect.Left, rect.Right+1)` + `Next(rect.Top,
//   rect.Bottom+1)`（Utils.cs:533-534，XNA Rectangle Right/Bottom = L+W/T+H，
//   Next 上界独占 ⇒ 值域含 rect.Right/rect.Bottom 一格——strictRange Contains
//   半开域随后把这多出的一列/行拒掉，但【掷流】必须照抄，否则全 attempt 序漂移）。
// 取证面：SW_RNDSPAWNLOG=1 时逐 attempt 落 R|seq|code|… 行（与 x86 rig 同構，
//   code：0=受理 1=strictRange 2=SolidCollision 3=墙/规避 4=strictRange 下坠越界
//   5=下坠耗尽 6=着陆规避 7=着陆底格避液 8=mostlySolidFloor 9=着陆终拒
//   10/11=X±16 探针 12=Y+16 探针 13=Y−16 探针）。
import { TILE_DEFS, PLATFORMS_SHEETS, SOLID_TOP_SHEETS, TILE_DUNGEON_IDS, WALL_DUNGEON_SHEETS } from '../../../data/tiles';
import { VAN_TILE_SOLID_EXTRA } from './GenSolid';
import type { TileStore } from '../../TileStore';

// ── sheet 空间静态表 ──────────────────────────────────────────────
// Main.tileSolidTop——★BJ187 收编单源 data/tiles.ts:SOLID_TOP_SHEETS(84 项,旧 79 项
// 副本漏 Main.cs:10125-10131 循环臂 435-439 队伍平台;落点实探消费面 SOLID_TOP_LUT:
// 旧值下落点踩队伍平台会被「误实心」拒,补臂后与 vanilla 一致放行)
const SHEET_SOLID_TOP = SOLID_TOP_SHEETS;
/** TileID.Sets.Platforms（TileID.cs:1307-1315） */
// ★BJ182b 收编单源 data/tiles.ts:PLATFORMS_SHEETS(sheet 域;逐值对拍全等,tests/tile-domain-sentinel §6d)
const SHEET_PLATFORMS = PLATFORMS_SHEETS;
/** CanTileHurt 门禁表（Collision.cs:3219-3236；TileID.cs:381-389） */
const SHEET_SUFFOCATE = new Set([53, 112, 116, 123, 224, 234]);
const SHEET_TOUCH_BLEEDING = new Set([48, 232, 750]);
const SHEET_TOUCH_IMMEDIATE_GT0 = new Set([32, 69, 80, 352, 655, 48, 232, 484, 750]);
const SHEET_TOUCH_HOT = new Set([37, 58, 76, 684, 230]);

// sheet → internal id（首个 v_ 定义；stats/TouchDamage.ts 同法）
const BY_SHEET = new Map<number, number>();
for (let id = 1; id < TILE_DEFS.length; id++) {
  const s = TILE_DEFS[id]?.vanilla?.sheet;
  if (s !== undefined && !BY_SHEET.has(s)) BY_SHEET.set(s, id);
}
// ★BJ182b:入参放宽 ReadonlySet(收编单源表均 ReadonlySet;只读遍历,语义零差)
const lutFromSheets = (set: ReadonlySet<number>): Uint8Array => {
  const lut = new Uint8Array(TILE_DEFS.length);
  for (const s of set) {
    const id = BY_SHEET.get(s);
    if (id !== undefined) lut[id] = 1;
  }
  return lut;
};
/** internal id → 原版 sheet（缺 sheet = -1） */
const SHEET_OF = (() => {
  const a = new Int32Array(TILE_DEFS.length).fill(-1);
  for (let id = 1; id < TILE_DEFS.length; id++) {
    const s = TILE_DEFS[id]?.vanilla?.sheet;
    if (typeof s === 'number') a[id] = s;
  }
  return a;
})();

const SOLID_TOP_LUT = lutFromSheets(SHEET_SOLID_TOP);      // Main.tileSolidTop
const PLATFORM_LUT = lutFromSheets(SHEET_PLATFORMS);       // TileID.Sets.Platforms
const SUFFOCATE_LUT = lutFromSheets(SHEET_SUFFOCATE);
const BLEEDING_LUT = lutFromSheets(SHEET_TOUCH_BLEEDING);
const IMMEDIATE_LUT = lutFromSheets(SHEET_TOUCH_IMMEDIATE_GT0);
const HOT_LUT = lutFromSheets(SHEET_TOUCH_HOT);

/** Main.wallDungeon（Main.cs:10734-10745；wall id 已是原版空间）——★BJ187 收编
 *  data/tiles.ts:WALL_DUNGEON_SHEETS 单源（9 项逐值全等） */
export const WALL_DUNGEON = WALL_DUNGEON_SHEETS;
/** Main.tileDungeon（Main.cs:8131-8136）→ internal id 集——★BJ187 收编
 *  data/tiles.ts:TILE_DUNGEON_IDS 单源（旧 BY_SHEET.map 习语逐值全等已对拍） */
export const DUNGEON_TILE_IDS = TILE_DUNGEON_IDS;
/** tileSolid∩tileSolidTop 九件套（TouchDamage.TILE_SOLID_TOP_FAMILY 同源）——TileCollision
 *  flag 门里该族 `flag=tileSolid` 恒真与 frameY 无关（TileStore.isPlatform 注①）。
 *  ★BJ187 批四（2026-09-19）收编 GenSolid.VAN_TILE_SOLID_EXTRA 单源（九件套权威;
 *  逐副本对拍等价——九 sheet 全单 def,lutFromSheets 首定义平移≡全 def 平移）。
 *  消费面=TileCollision flag 门(:285)与 vanTileSolid 导出(:615,SW-RB10a tile2 判定)。 */
const PLATFORM_FAMILY_LUT = lutFromSheets(VAN_TILE_SOLID_EXTRA);

const WIRE_ACTUATED = 32;                                  // TileStore.wire bit5 已致动(inActive)

/** R|seq|code|… 取证行（SW_RNDSPAWNLOG 门控；注入器由 WorldGen 侧装配，避免本模块反向依赖） */
let RSP: ((line: string) => void) | null = null;
/** @internal 取证钩装配（generateWorld 启动时按 env 一次性注入） */
export function setTeleportSpotTrace(fn: ((line: string) => void) | null): void {
  RSP = fn;
}
let rspSeq = 0;
function rsp(line: string): void {
  if (!RSP) return;
  rspSeq++;
  RSP(`R|${rspSeq}|${line}`);
}
/** 取证行出口（X 域/S 行在 SecretSeedDoEndsPass 侧产生，共用同一序号流） */
export function teleportSpotRspRaw(line: string): void {
  rsp(line);
}

/** CanTileHurt（Collision.cs:3219-3236）——player=null 通道（AnyHurtingTiles 调用位）。
 *  getGoodWorld/dontStarveWorld 两支照抄（zenith 组合下 230 可伤；本仓两旗由 seedFlags 供）。 */
function canTileHurt(t: number, getGoodWorld: boolean, dontStarveWorld: boolean): boolean {
  if (SHEET_OF[t] === 230 && !getGoodWorld) return false;
  if (SHEET_OF[t] === 80 && !dontStarveWorld) return false;
  if (BLEEDING_LUT[t] || SUFFOCATE_LUT[t] || IMMEDIATE_LUT[t]) return true;
  if (HOT_LUT[t]) return true;   // player==null ⇒ !fireWalk 恒真
  return false;
}

/** SolidCollision(Position,Width,Height)（Collision.cs:2713-2747）。acceptTopSurfaces
 *  重载 :2748-2808 在 allowSolidTopFloor=false 时与本体同判——本移植只接本体语义，
 *  allowSolidTopFloor=true 的分支（平台顶/PlatformProperTopFrame）无消费者不移植（备案）。 */
export function solidCollisionPx(st: TileStore, px: number, py: number, w: number, h: number, acceptTopSurfaces = false): boolean {
  const c = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
  let i0 = c(Math.trunc(px / 16) - 1, 0, st.w - 1);
  const i1 = c(Math.trunc((px + w) / 16) + 2, 0, st.w - 1);
  let j0 = c(Math.trunc(py / 16) - 1, 0, st.h - 40);
  const j1 = c(Math.trunc((py + h) / 16) + 2, 0, st.h - 40);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if ((st.flags[idx] & 1) === 0) continue;                     // active()
      if (st.wire[idx] & WIRE_ACTUATED) continue;                  // !inActive()
      const t = st.type[idx];
      if (acceptTopSurfaces) {
        // Collision.cs:2766-2772（allowSolidTopFloor=true 语义；当前消费者恒 false）
        let flag = TILE_DEFS[t]?.solid === true && !SOLID_TOP_LUT[t];
        if (PLATFORM_LUT[t]) flag = flag || false;                 // PlatformProperTopFrame 不移植（无消费者）
        else flag = flag || (SOLID_TOP_LUT[t] === 1 && st.frameY[idx] === 0);
        if (!flag) continue;
      } else {
        if (!TILE_DEFS[t]?.solid || SOLID_TOP_LUT[t]) continue;    // tileSolid && !tileSolidTop
      }
      let ty = j * 16;
      let th = 16;
      if (st.half[idx]) { ty += 8; th -= 8; }                      // halfBrick
      if (px + w > i * 16 && px < i * 16 + 16 && py + h > ty && py < ty + th) return true;
    }
  }
  return false;
}

/** WetCollision（Collision.cs:1575-1656）——中心收缩盒（num=min(10,W), num2=H/2 整除）
 *  + 液面高程偏移 drop=(256-liquid)/32*2；坡面含液支（坡格自身 liquid==0 但上格带液）。 */
export function wetCollisionPx(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  let cx = px + Math.trunc(w / 2);          // (float)(Width/2) 整除
  let cy = py + Math.trunc(h / 2);
  let num = 10;
  let num2 = Math.trunc(h / 2);
  if (num > w) num = w;
  if (num2 > h) num2 = h;
  cx -= Math.trunc(num / 2);
  cy -= Math.trunc(num2 / 2);
  const c = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
  const i0 = c(Math.trunc(px / 16) - 1, 0, st.w - 1);
  const i1 = c(Math.trunc((px + w) / 16) + 2, 0, st.w - 1);
  const j0 = c(Math.trunc(py / 16) - 1, 0, st.h - 40);
  const j1 = c(Math.trunc((py + h) / 16) + 2, 0, st.h - 40);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      const liq = st.liquid[idx];
      if (liq > 0) {
        let vy = j * 16;
        let vh = 16;
        const drop = (256 - liq) / 32;
        vy += drop * 2;
        vh -= Math.trunc(drop * 2);
        if (cx + num > i * 16 && cx < i * 16 + 16 && cy + num2 > vy && cy < vy + vh) return true;
      } else {
        // 坡面兜液支：active && slope!=0 && j>0 && 上格 liquid>0
        if ((st.flags[idx] & 1) === 0 || st.slope[idx] === 0 || j <= 0) continue;
        const up = st.idx(i, j - 1);
        if (st.liquid[up] <= 0) continue;
        if (cx + num > i * 16 && cx < i * 16 + 16 && cy + num2 > j * 16 && cy < j * 16 + 16) return true;
      }
    }
  }
  return false;
}

/** LavaCollision（Collision.cs:1657-1700）——liquidType()==2（JS LAVA=2 编码）+ 液面偏移。 */
export function lavaCollisionPx(st: TileStore, px: number, py: number, w: number, h: number): boolean {
  const c = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
  const i0 = c(Math.trunc(px / 16) - 1, 0, st.w - 1);
  const i1 = c(Math.trunc((px + w) / 16) + 2, 0, st.w - 1);
  const j0 = c(Math.trunc(py / 16) - 1, 0, st.h - 40);
  const j1 = c(Math.trunc((py + h) / 16) + 2, 0, st.h - 40);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if (st.liquid[idx] > 0 && st.liquidType[idx] === 2) {
        let vy = j * 16;
        let vh = 16;
        const drop = (256 - st.liquid[idx]) / 32;
        vy += drop * 2;
        vh -= Math.trunc(drop * 2);
        if (px + w > i * 16 && px < i * 16 + 16 && py + h > vy && py < vy + vh) return true;
      }
    }
  }
  return false;
}

/** AnyHurtingTiles（Collision.cs:3123-3126 → HurtTiles :3128-3217, player=null）。 */
export function anyHurtingTilesPx(st: TileStore, px: number, py: number, w: number, h: number,
  getGoodWorld = false, dontStarveWorld = false): boolean {
  const num = Math.max(0, Math.trunc(px / 16) - 1);
  let i1 = Math.trunc((px + w) / 16) + 2;
  const j0 = Math.max(0, Math.trunc(py / 16) - 1);
  let j1 = Math.trunc((py + h) / 16) + 2;
  if (i1 > st.w) i1 = st.w;                       // Collision.cs:3136-3142（num2>maxTilesX 钳 maxTilesX）
  if (j1 > st.h - 40) j1 = st.h - 40;
  for (let i = num; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if ((st.flags[idx] & 1) === 0) continue;    // !active
      if (st.wire[idx] & WIRE_ACTUATED) continue; // inActive()
      const t = st.type[idx];
      let ty = j * 16;
      let th = 16;
      if (st.half[idx]) { ty += 8; th -= 8; }
      const num6 = SUFFOCATE_LUT[t] ? 2 : 0;
      if (px + w - num6 < i * 16 || px + num6 > i * 16 + 16
        || py + h - num6 < ty - 0.5 || py + num6 > ty + th + 0.5
        || !canTileHurt(t, getGoodWorld, dontStarveWorld)) continue;
      const slope = st.slope[idx];
      if (slope > 0) {
        if (num6 > 0) continue;
        let num7 = 0;
        // Tile.cs:292-332：topSlope={1,2} bottomSlope={3,4} leftSlope={2,4} rightSlope={1,3}
        if ((slope === 1 || slope === 3) && px > i * 16) num7++;              // rightSlope
        if ((slope === 2 || slope === 4) && px + w < i * 16 + 16) num7++;      // leftSlope
        if ((slope === 3 || slope === 4) && py > ty) num7++;                   // bottomSlope
        if ((slope === 1 || slope === 2) && py + h < ty + th) num7++;          // topSlope
        if (num7 === 2) continue;
      }
      return true;
    }
  }
  return false;
}

/**
 * TileCollision（Collision.cs:2299-2415）——四向 16px 逃逸探针消费面。
 * fallThrough/fall2/ignoreDoors/ignoreAetheriumPlatforms 恒 false（调用位缺省），
 * hoik 缺省 true；gravDir=1。返回实际位移 [rx,ry]（与请求速度逐值相等=通路自由）。
 * ★up/down 静态旗为输出面，本调用位无消费者，不落。
 * 关键语义（决定探针通过性）：
 *   ①重叠门按【目标盒】（Position+Velocity）判——不与目标盒相交的格全跳过；
 *   ②四分支按几何位置二分（下方/右侧/左侧/上方），与起始盒重叠却不属四支的格
 *     （如 landing 盒内的 platform 顶段被 X 探针扫到）无支可落＝不拦截；
 *   ③下方支 num6 跟踪「最近拦断面」，result.Y 只在 num3!=num && !flag2 时覆写；
 *   ④X 支 `if (num3 == num) result.Y = vector.Y`（vector=请求速度）复位 Y。
 */
export function tileCollisionPx(st: TileStore, px: number, py: number, vx: number, vy: number,
  w: number, h: number, gravDir = 1, hoik = true): [number, number] {
  const tx = px + vx;                       // vector2 = Position + Velocity（目标位）
  const ty = py + vy;
  const c = (v: number, lo: number, hi: number): number => v < lo ? lo : v > hi ? hi : v;
  const i0 = c(Math.trunc(px / 16) - 1, 0, st.w - 1);
  const i1 = c(Math.trunc((px + w) / 16) + 2, 0, st.w - 1);
  const j0 = c(Math.trunc(py / 16) - 1, 0, st.h - 40);
  const j1 = c(Math.trunc((py + h) / 16) + 2, 0, st.h - 40);
  let num6 = (j1 + 3) * 16;                 // float num6 = (value4 + 3) * 16（cs:2320）
  let rx = vx;                              // result = Velocity 起
  let ry = vy;
  let num = -1;    // X 支列锚（cs num）
  let num2 = -1;   // X 支行锚（cs num2）
  let num3 = -1;   // down/up 支列锚（cs num3）
  let num4 = -1;   // down/up 支行锚（cs num4）
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if ((st.flags[idx] & 1) === 0) continue;                   // !active（:2330）
      if (st.wire[idx] & WIRE_ACTUATED) continue;                // !inActive（:2330）
      const t = st.type[idx];
      // flag = tileSolid || (tileSolidTop && frameY==0)（:2331-2333）
      //   ★平台九件套：vanilla tileSolid∩tileSolidTop ⇒ flag 恒真（本仓数据档 solid:false,
      //   见 TileStore.isPlatform 注①——不补此行平台族全体穿透）
      let flag = TILE_DEFS[t]?.solid === true || PLATFORM_FAMILY_LUT[t] === 1;
      if (SOLID_TOP_LUT[t] && st.frameY[idx] === 0) flag = true;
      if (!flag) continue;
      let tly = j * 16;                        // vector4.Y
      let tln = 16;                            // num7
      if (st.half[idx]) { tly += 8; tln -= 8; }
      // 重叠门（目标盒；:2341）
      if (!(tx + w > i * 16) || !(tx < i * 16 + 16) || !(ty + h > tly) || !(ty < tly + tln)) continue;
      let flag2 = false;   // 坡 1/2 让位
      let flag3 = false;   // 坡让位整体跳过
      const slope = st.slope[idx];
      if (slope > 2) {
        if (slope === 3 && py + Math.abs(vx) >= tly && px >= i * 16) flag3 = true;
        if (slope === 4 && py + Math.abs(vx) >= tly && px + w <= i * 16 + 16) flag3 = true;
      } else if (slope > 0) {
        flag2 = true;
        if (slope === 1 && py + h - Math.abs(vx) <= tly + tln && px >= i * 16) flag3 = true;
        if (slope === 2 && py + h - Math.abs(vx) <= tly + tln && px + w <= i * 16 + 16) flag3 = true;
      }
      if (flag3) continue;
      if (py + h <= tly) {
        // 下方支（:2372-2389）。fallThrough 恒 false ⇒ 首析取恒真（!(solidTop&false)）
        if (num6 > tly) {
          num3 = i;
          num4 = j;
          if (tln < 16) num4++;
          if (num3 !== num && !flag2) {
            ry = tly - (py + h) + (gravDir === -1 ? -0.01 : 0);
            num6 = tly;                        // num6 = vector4.Y
          }
        }
      } else if (px + w <= i * 16 && !SOLID_TOP_LUT[t]) {
        // 右侧支（:2390-2403）——hoik 门：左邻坡 2/4 让位
        const lslope = i >= 1 ? st.slope[st.idx(i - 1, j)] : 0;
        if (!hoik || i < 1 || (lslope !== 2 && lslope !== 4)) {
          num = i;
          num2 = j;
          if (num2 !== num4) rx = i * 16 - (px + w);
          if (num3 === num) ry = vy;           // result.Y = vector.Y（请求速度）
        }
      } else if (px >= i * 16 + 16 && !SOLID_TOP_LUT[t]) {
        // 左侧支（:2404-2417）——hoik 门：右邻坡 1/3 让位（原版无 i 上界钳,JS 防越界读）
        const rslope = i + 1 < st.w ? st.slope[st.idx(i + 1, j)] : 0;
        if (!hoik || (rslope !== 1 && rslope !== 3)) {
          num = i;
          num2 = j;
          if (num2 !== num4) rx = i * 16 + 16 - px;
          if (num3 === num) ry = vy;
        }
      } else if (py >= tly + tln && !SOLID_TOP_LUT[t]) {
        // 上方支（:2418-2426）
        num3 = i;
        num4 = j;
        ry = tly + tln - py + (gravDir === 1 ? 0.01 : 0);
        if (num4 === num2) rx = vx;
      }
    }
  }
  return [rx, ry];
}

// ═══════════════ CheckForGoodTeleportationSpot 主核 ═══════════════

/** RandomTeleportationAttemptSettings（Utils.cs:486-516）——本仓消费面子集
 *  （specializedConditions 在 randomSpawn/DemonConch/TeleportationPotion 各调用位
 *  均为 null，不移植；teleporteeVelocity/GravityDirection 仅喂 SlopeCollision=无效果）。 */
export interface TeleportationAttemptSettings {
  /** teleporteeSize.X/Y（像素；(int) 截断后为盒宽高） */
  teleporteeW: number;
  teleporteeH: number;
  avoidAnyLiquid?: boolean;
  avoidLava?: boolean;
  avoidHurtTiles?: boolean;
  avoidWalls?: boolean;
  mostlySolidFloor?: boolean;
  strictRange?: boolean;
  allowSolidTopFloor?: boolean;
  maximumFallDistanceFromOrignalPoint: number;
  attemptsBeforeGivingUp: number;
  /** 原版 tile id 表（-1=被种子旗删除）；tilesToAvoidRange>0 才启用 */
  tilesToAvoid?: readonly number[];
  tilesToAvoidRange?: number;
  /** WorldGen.RandomizeWorldSpawn 通道：teleporteeSize 20×42/velocity 0/gravDir 1 */
}

/** CheckForGoodTeleportationSpot_CheckNoInvalidTiles（Utils.cs:484-516）。
 *  avoidIds = 原版 id 集合（含 -1 不命中——ushort type 永不等于 -1）。 */
export function checkNoInvalidTiles(st: TileStore, tpx: number, tpy: number,
  avoidIds: ReadonlySet<number>, range: number): boolean {
  if (range > 0 && avoidIds.size > 0) {
    for (let i = -range; i <= range; i++) {
      for (let j = -range; j <= range; j++) {
        const x = tpx + i;
        const y = tpy + j;
        // WorldGen.InWorld(x, y, 2)（WorldGen.cs:9642-9649）
        if (x < 2 || y < 2 || x >= st.w - 2 || y >= st.h - 2) continue;
        const idx = st.idx(x, y);
        if ((st.flags[idx] & 1) === 0) continue;                    // null/!active
        if (avoidIds.has(SHEET_OF[st.type[idx]])) return false;
      }
    }
  }
  return true;
}

export interface TeleportSpotResult {
  canSpawn: boolean;
  /** 落点像素坐标（vanilla 返回的 vector；受理时 = (num4*16−2, (num5+num8)*16−42)） */
  x: number;
  y: number;
  /** 受证面：受理 attempt 锚格与下坠格数（x86 R|0 行同構） */
  attempt?: number;
  anchorX?: number;
  anchorY?: number;
  fall?: number;
}

/** Utils.CheckForGoodTeleportationSpot（Utils.cs:518-647）逐句移植。
 *  rng 走调用方 pass 流（生成期 genRand≡Main.rand 单流；vampire/randomSpawn 两臂
 *  同用本核）。掷骰：每 attempt 恰两次 `Next(L, R+1)`/`Next(T, B+1)`——失败重掷、
 *  受理即止。 */
export function checkForGoodTeleportationSpot(
  st: TileStore, rng: { nextIntRange(a: number, b: number): number },
  settings: TeleportationAttemptSettings,
  teleportStartX: number, teleportRangeX: number, teleportStartY: number, teleportRangeY: number,
  ctx: { worldSurface: number; rockLevel: number; downedPlantBoss: boolean; downedBoss3: boolean; dualDungeonsSeed: boolean;
    getGoodWorld: boolean; dontStarveWorld: boolean; unbreakableWallAt?: (x: number, y: number) => boolean },
): TeleportSpotResult {
  const num = Math.trunc(settings.teleporteeW);            // (int)teleporteeSize.X
  const num2 = Math.trunc(settings.teleporteeH);           // (int)teleporteeSize.Y
  // Rectangle(teleportStartX, teleportStartY, rangeX+1, rangeY+1)
  const rectL = teleportStartX;
  const rectT = teleportStartY;
  const rectR = teleportStartX + teleportRangeX + 1;       // XNA Right = L + Width
  const rectB = teleportStartY + teleportRangeY + 1;       // XNA Bottom = T + Height
  const offX = Math.trunc(-num / 2) + 8;                   // -num6/2+8（整除）
  const offY = -num2;
  const avoidIds = new Set(settings.tilesToAvoid ?? []);
  const avoidRange = settings.tilesToAvoidRange ?? 0;
  const maxFall = settings.maximumFallDistanceFromOrignalPoint;
  const strict = !!settings.strictRange;
  const allowTop = !!settings.allowSolidTopFloor;
  let canSpawn = false;
  let num4 = 0;
  let num5 = 0;
  let num8 = 0;
  let num3 = 0;
  let vx = 0 * 16 + offX;                                  // vector 初值（attempt 前）
  let vy = 0 * 16 + offY;
  rsp(`DOM|${teleportStartX}|${teleportRangeX}|${teleportStartY}|${teleportRangeY}|${settings.attemptsBeforeGivingUp}|${strict ? 1 : 0}|${num}|${num2}|${ctx.worldSurface}|${ctx.rockLevel}`);
  while (!canSpawn && num3 < settings.attemptsBeforeGivingUp) {
    num3++;
    num4 = rng.nextIntRange(rectL, rectR + 1);              // Next(Left, Right+1)
    num5 = rng.nextIntRange(rectT, rectB + 1);              // Next(Top, Bottom+1)
    num4 = Math.min(Math.max(num4, 45), st.w - 45);         // MathHelper.Clamp(·,45,maxTilesX-45)
    num5 = Math.min(Math.max(num5, 45), st.h - 45);
    if (strict && !(num4 >= rectL && num4 < rectR && num5 >= rectT && num5 < rectB)) {
      rsp(`1|${num3}|${num4}|${num5}`);
      continue;
    }
    vx = num4 * 16 + offX;
    vy = num5 * 16 + offY;
    if (solidCollisionPx(st, vx, vy, num, num2, allowTop)) {
      rsp(`2|${num3}|${num4}|${num5}`);
      continue;
    }
    {
      const idx = st.idx(num4, num5);
      const wallHere = st.wall[idx];
      if ((settings.avoidWalls && wallHere > 0)
        || (wallHere === 87 && !ctx.downedPlantBoss)
        || (WALL_DUNGEON.has(wallHere) && num5 > ctx.worldSurface && !ctx.downedBoss3)
        || !checkNoInvalidTiles(st, num4, num5, avoidIds, avoidRange)) {
        rsp(`3|${num3}|${num4}|${num5}|${wallHere}`);
        continue;
      }
    }
    // 下坠循环（Utils.cs:556-582）——strictRange Contains 逐格 + SolidCollision(h=H+1)
    //   + 锚格 full-solid 落底判定。SlopeCollision 调用（:571）返回值被丢弃且 vector
    //   按值传递 ⇒ 对调用方零效果，整段省略（见模块头定谳注）。
    let flag = false;
    num8 = 0;
    while (num8 < maxFall) {
      if (strict && !(num4 >= rectL && num4 < rectR && num5 + num8 >= rectT && num5 + num8 < rectB)) {
        flag = true;
        break;
      }
      vx = num4 * 16 + offX;
      vy = (num5 + num8) * 16 + offY;
      if (!solidCollisionPx(st, vx, vy, num, num2 + 1, allowTop)) {
        num8++;
        continue;
      }
      const i2 = st.idx(num4, num5 + num8);
      // ★SW-RB10a：tile2 判定 = Main.tileSolid[type]（Utils.cs:577）——vanilla tileSolid
      //  含平台九件套（19/239/380/427/435-439,本仓数据档 solid:false 由 PLATFORM_FAMILY_
      //  LUT 代偿,vanTileSolid 同源式）。旧刀裸读 TILE_DEFS.solid → 锚格=平台且盒内
      //  邻列实心触发 (H+1) 碰撞时,vanilla 按锚格实心 break+受理（standing on platform,
      //  终检 SolidCollision(H) 对 1px 掠带不触发）而本仓继续下坠/耗尽=拒。
      if ((st.flags[i2] & 1) !== 0 && (st.wire[i2] & WIRE_ACTUATED) === 0
        && vanTileSolid(st.type[i2])) break;                // active && !inActive && tileSolid
      num8++;
    }
    if (flag) {
      rsp(`4|${num3}|${num4}|${num5}|${num8}`);
      continue;
    }
    if (num8 >= maxFall) rsp(`5|${num3}|${num4}|${num5}|${num8}`);
    const num9 = Math.trunc(vx / 16);                        // (int)vector.X / 16
    const num10 = Math.trunc(vy / 16);                       // (int)vector.Y / 16
    if (!checkNoInvalidTiles(st, num9, num10, avoidIds, avoidRange)) {
      rsp(`6|${num3}|${num4}|${num5}|${num8}|${num9}|${num10}`);
      continue;
    }
    const num11 = Math.trunc((vx + num * 0.5) / 16);         // (int)(vector.X + W*0.5f)/16
    const num12 = Math.trunc((vy + num2) / 16);              // (int)(vector.Y + H)/16
    // tileSafely2 = (num11, num12)=着陆底行；tileSafely3/4 = 左/右邻；tileSafely = 着陆盒锚
    {
      const iFloor = st.idx(num11, num12);
      if (settings.avoidAnyLiquid && st.liquid[iFloor] > 0) {
        rsp(`7|${num3}|${num4}|${num5}|${num8}|${num11}|${num12}|${st.liquid[iFloor]}`);
        continue;
      }
    }
    if (settings.mostlySolidFloor) {
      const iL = st.idx(num11 - 1, num12);
      const iR = st.idx(num11 + 1, num12);
      const ok = (idx: number): boolean => (st.flags[idx] & 1) !== 0 && (st.wire[idx] & WIRE_ACTUATED) === 0
        && TILE_DEFS[st.type[idx]]?.solid === true && !SOLID_TOP_LUT[st.type[idx]];
      const flag2 = ok(iL);
      const flag3 = ok(iR);
      if (!flag2 && !flag3) {
        rsp(`8|${num3}|${num4}|${num5}|${num8}`);
        continue;
      }
    }
    {
      const iSafe = st.idx(num9, num10);
      const wallSafe = st.wall[iSafe];
      if ((settings.avoidWalls && wallSafe > 0)
        || (settings.avoidAnyLiquid && wetCollisionPx(st, vx, vy, num, num2))
        || (settings.avoidLava && lavaCollisionPx(st, vx, vy, num, num2))
        || (settings.avoidHurtTiles && anyHurtingTilesPx(st, vx, vy, num, num2, ctx.getGoodWorld, ctx.dontStarveWorld))
        || solidCollisionPx(st, vx, vy, num, num2, allowTop)
        || num8 >= maxFall - 1) {
        rsp(`9|${num3}|${num4}|${num5}|${num8}`);
        continue;
      }
    }
    {
      // 四向 16px 逃逸探针（Utils.cs:626-645）——位移与请求速度逐值相等才通过
      let p = tileCollisionPx(st, vx - 16, vy, 16, 0, num, num2);
      if (p[0] !== 16 || p[1] !== 0) {
        rsp(`10|${num3}|${num4}|${num5}|${num8}`);
        continue;
      }
      p = tileCollisionPx(st, vx + 16, vy, -16, 0, num, num2);
      if (p[0] !== -16 || p[1] !== 0) {
        rsp(`11|${num3}|${num4}|${num5}|${num8}`);
        continue;
      }
      p = tileCollisionPx(st, vx, vy - 16, 0, 16, num, num2);
      if (p[0] === 0 && p[1] === 16) {
        p = tileCollisionPx(st, vx, vy + 16, 0, -16, num, num2);
        if (p[0] === 0 && p[1] === -16
          && (!ctx.dualDungeonsSeed || !(ctx.unbreakableWallAt?.(num9, num10) ?? false))) {
          canSpawn = true;
          num5 += num8;
          rsp(`0|${num3}|${num4}|${num5}|${num8}|${num9}|${num10}|${num11}|${num12}|${vx}|${vy}`);
          break;
        }
        rsp(`13|${num3}|${num4}|${num5}|${num8}`);
      } else {
        rsp(`12|${num3}|${num4}|${num5}|${num8}`);
      }
    }
  }
  rsp(`F|${canSpawn ? 1 : 0}|${vx}|${vy}`);
  return { canSpawn, x: vx, y: vy, attempt: num3, anchorX: num4, anchorY: num5, fall: num8 };
}

// ═══════════════ GetRight/LeftMostDungeonTile（RandomizeWorldSpawn X 域） ═══════════════

/** 潜在地牢外域（DungeonBounds：半开 [l,r)×[t,b)，CreatePotentialDungeonBounds 产物） */
export interface DungeonBoundsLike { l: number; t: number; r: number; b: number }

/** WorldGen.GetRightMostDungeonTile（WorldGen.cs:24070-24089）——外域逐列扫 dungeon
 *  砖/墙，取【最右】命中列；无命中 = 域 Left。dungeonGenVars[0]==null 支（WorldGen.cs
 *  :24073-24076）在 JS 管线不可达（DungeonPass 恒回填），照抄返回 300。 */
export function getRightMostDungeonTile(st: TileStore, bounds: DungeonBoundsLike): number {
  let result = bounds.l;
  for (let i = bounds.l; i < bounds.r; i++) {
    for (let j = bounds.t; j < bounds.b; j++) {
      const idx = st.idx(i, j);
      if (((st.flags[idx] & 1) !== 0 && DUNGEON_TILE_IDS.has(st.type[idx])) || WALL_DUNGEON.has(st.wall[idx])) {
        result = i;
        break;
      }
    }
  }
  return result;
}

/** WorldGen.GetLeftMostDungeonTile（WorldGen.cs:24091-24132）——取【最左】命中列；
 *  无命中 = 域 Right（初值 num=Right）。dungeonGenVars[0]==null 支返回 maxTilesX-300。 */
export function getLeftMostDungeonTile(st: TileStore, bounds: DungeonBoundsLike): number {
  let num = bounds.r;
  for (let i = num; i > bounds.l; i--) {
    for (let j = bounds.t; j < bounds.b; j++) {
      const idx = st.idx(i, j);
      if (((st.flags[idx] & 1) !== 0 && DUNGEON_TILE_IDS.has(st.type[idx])) || WALL_DUNGEON.has(st.wall[idx])) {
        num = i;
        break;
      }
    }
  }
  return num;
}

// ═══════════════ ★IIIII110b：PlaceTile(4) 火把分支（PlaceTorchesAroundSpawn 消费） ═══════════════

/** TileID.Sets.NotReallySolid（TileID.cs:359） */
export const VAN_NOT_REALLY_SOLID = lutFromSheets(new Set([10, 387, 388]));
/** TileID.Sets.IsBeam（TileID.cs:239） */
export const VAN_IS_BEAM = lutFromSheets(new Set([124, 561, 574, 575, 576, 577, 578]));
/** TileID.Sets.IsATreeTrunk（TileID.cs:161，WorldGen.IsTreeType 消费） */
export const VAN_IS_TREE_TRUNK = lutFromSheets(new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]));
/** vanilla Main.tileSolid（=JS TILE_DEFS.solid ∪ 平台九件套——本仓数据档平台 solid:false，
 *  而 vanilla tileSolid[19/239/380/427/435-439]=true，见 TileStore.isPlatform 注①） */
export function vanTileSolid(t: number): boolean {
  return TILE_DEFS[t]?.solid === true || PLATFORM_FAMILY_LUT[t] === 1;
}

/** PlatformProperTopFrame（WorldGen.cs:70692-70705）——frameX/18 ∈ [0..7]∪[12..16]∪[25..26] */
export function platformProperTopFrame(frameX: number): boolean {
  const num = Math.trunc(frameX / 18);      // TileObjectData.PlatformFrameWidth()=18
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    return num >= 25 && num <= 26;
  }
  return true;
}

/** TopEdgeCanBeAttachedTo（WorldGen.cs:70919-70935）——附着面（下方格顶缘）。 */
export function topEdgeCanBeAttachedTo(st: TileStore, i: number, j: number): boolean {
  if (!st.inBounds(i, j)) return false;      // vanilla try/catch:OOB→false;null→true(JS 无 null 格)
  const idx = st.idx(i, j);
  if ((st.flags[idx] & 1) === 0) return false;
  const t = st.type[idx];
  if (!(vanTileSolid(t) || SOLID_TOP_LUT[t] === 1)) return false;
  const slope = st.slope[idx];
  const topSlope = slope === 1 || slope === 2;
  if (topSlope && !(PLATFORM_LUT[t] === 1 && platformProperTopFrame(st.frameX[idx]))) return false;
  if (st.half[idx]) return false;
  if (st.wire[idx] & WIRE_ACTUATED) return false;
  return true;
}

/** PlaceTile(4) 横向附着支（WorldGen.cs:60337-60344）。isLeft=true 消费 tile[i-1,j]
 *  支（slope 门 slope==0||slope%2!=1），否则 tile[i+1,j] 支（slope==0||slope%2!=0）。
 *  实心支 = tileSolid && !tileSolidTop && !NotReallySolid，或 IsBeam，或树干三连
 *  （本格+同列上下格皆 IsATreeTrunk——tile[i±1,j±1] 直读 type 无 active 门）。 */
export function torchSideAttachOK(st: TileStore, x: number, y: number, isLeft: boolean): boolean {
  if (!st.inBounds(x, y)) return false;
  const idx = st.idx(x, y);
  if ((st.flags[idx] & 1) === 0) return false;
  const slope = st.slope[idx];
  if (isLeft) {
    if (!(slope === 0 || slope % 2 !== 1)) return false;
  } else {
    if (!(slope === 0 || slope % 2 !== 0)) return false;
  }
  const t = st.type[idx];
  if (vanTileSolid(t) && SOLID_TOP_LUT[t] === 0 && VAN_NOT_REALLY_SOLID[t] === 0) return true;
  if (VAN_IS_BEAM[t] === 1) return true;
  if (VAN_IS_TREE_TRUNK[t] === 1 && st.inBounds(x, y - 1) && st.inBounds(x, y + 1)
    && VAN_IS_TREE_TRUNK[st.type[st.idx(x, y - 1)]] === 1
    && VAN_IS_TREE_TRUNK[st.type[st.idx(x, y + 1)]] === 1) return true;
  return false;
}

/** PlaceTile(4) 下方附着支（WorldGen.cs:60345-60347）——tile[i,j+1] 活性+tileSolid+
 *  （平台∧TopEdge 或 非solidTop（或 380 坡0）∧!NotReallySolid∧!halfBrick∧slope==0）。 */
export function torchBelowAttachOK(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const idx = st.idx(x, y);
  if ((st.flags[idx] & 1) === 0) return false;
  const t = st.type[idx];
  if (!vanTileSolid(t)) return false;
  if (PLATFORM_LUT[t] === 1) {
    if (topEdgeCanBeAttachedTo(st, x, y)) return true;
  }
  const slope = st.slope[idx];
  if ((SOLID_TOP_LUT[t] === 0 || (t === idOf380 && slope === 0))
    && VAN_NOT_REALLY_SOLID[t] === 0 && !st.half[idx] && slope === 0) return true;
  return false;
}

/** 380（花盆箱，Platforms 之外唯一 solidTop∧solid 族特典支）internal id */
const idOf380 = BY_SHEET.get(380) ?? -1;

/** PlaceTile(4) 完整附着门（WorldGen.cs:60333-60356 的 if 链）：
 *  `wall>0 || 左支 || 右支 || 下支`——门过才 active+type=4+frameY=22*style+SquareTileFrame；
 *  门败 PlaceTile 返回 false = 零写零掷（vanilla 火把臂 63 置位/70 拒绝,133 调用）。 */
export function canPlaceTorchAt(st: TileStore, x: number, y: number): boolean {
  if (st.wall[st.idx(x, y)] > 0) return true;
  return torchSideAttachOK(st, x - 1, y, true)
    || torchSideAttachOK(st, x + 1, y, false)
    || torchBelowAttachOK(st, x, y + 1);
}
