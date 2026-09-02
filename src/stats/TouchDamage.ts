// 原版接触伤害系统 1:1（Collision.cs HurtTiles:3128 / CanTileHurt:3209 +
// Player.cs GetHurtTile:28486 / ApplyTouchDamage:28507）。
// TileID.Sets（TileID.cs:381-389）：
//   TouchDamageDestroyTile {32,69,352,655}      —— 荆棘族,触碰即毁块
//   Suffocate {53,112,116,123,224,234}          —— 沙族,埋入窒息(20 HP/s)
//   TouchDamageHot {37,58,76,684,230}           —— 站上灼烧 Burning(0.33s 刷新)
//   TouchDamageBleeding {48,232,750}            —— 尖刺族,流血(停自然恢复)
//   TouchDamageImmediate {32:10,69:17,80:6,352:10,655:100,48:60,232:80,484:25,750:70}
// CanTileHurt 门禁:230 仅 ftw 种子 / 80(仙人掌) 仅饥荒种子 → 普通世界恒无效。
import { TILE_DEFS } from '../data/tiles';
import type { TileStore } from '../world/TileStore';

// sheet id → 本仓库 internal tile id（取首个 v_ 定义）
const BY_SHEET = new Map<number, number>();
for (let id = 1; id < TILE_DEFS.length; id++) {
  const s = TILE_DEFS[id]?.vanilla?.sheet;
  if (s !== undefined && !BY_SHEET.has(s)) BY_SHEET.set(s, id);
}
const tid = (sheet: number): number => BY_SHEET.get(sheet) ?? -1;
const setOf = (sheets: number[]) => new Set(sheets.map(tid).filter((v) => v >= 0));

/**
 * TileSolidTop ∩ TileSolid 可达族（平台行为族九件套,TileStore.isPlatform 注①）。
 * Main.tileSolidTop 是【类型静态表】（致动不变）——对 tileSolid 族的可达成员
 * 只有这九件（其余 solidTop 型均 tileSolid=false,被 tileSolid 项先行否决）。
 * 1457 字面（Main.cs,赋值即 tileSolidTop+tileSolid 同批成对）：
 *   19 平台 :8031-8032 / 239 矿锭 :9797-9798 / 380 花盆箱 :9799-9800 /
 *   427 红团队平台 :10118-10119 / 435-439 绿蓝黄粉白团队平台五色 :10126-10136
 *   （`for (num2 = 435; num2 <= 439; …)` 整批七旗,TileID.cs:1307-1315 五 const）。
 * ★潜伏雷说明（蓝队 F1,2026-09-01）：本仓 TILE_DEFS 口径下这九件当前【全
 *   solid:false】（platform 语义档,数据面未随 1457 置 tileSolid）→ 消费位
 *   `TILE_DEFS[t]?.solid &&` 先行否决,本表今日整体是死表;将来有人按原版把
 *   任一件（最可能是团队平台五色）tileSolid 改真时,豁免行判定位立即复活——
 *   本表已就位,九件一并豁免/solidTop 反豁免,不会漏件误放行。
 * DrownCollision 豁免行（Collision.cs:1418）tileSolidTop 项消费——不可用
 * TileStore.isPlatform 代替：其带 nactive() 致动闸,致动平台原版恒吃 tileSolidTop。
 */
const TILE_SOLID_TOP_FAMILY = setOf([19, 239, 380, 427, 435, 436, 437, 438, 439]);

/**
 * 触碰直接伤害【基准】值（TouchDamageImmediate;尖刺 48=60 木尖刺 232=80 荆棘 10/17 等）。
 * ★F4：此表为原版 TileID.Sets.TouchDamageImmediate 的静态原始值——消费端
 * ApplyTouchDamage（Player.cs:29205-29211）先过 `Main.DamageVar(num, −luck)` 单源
 * 掷骰再入 Hurt（Player.ts applyTouchDamage 经 stats/DamageVar.damageVarRoll 实施）,
 * 表内数值【不】是最终落地伤。
 */
export const TOUCH_IMMEDIATE = new Map<number, number>(
  ([[32, 10], [69, 17], [80, 6], [352, 10], [655, 100], [48, 60], [232, 80], [484, 25], [750, 70]] as Array<[number, number]>)
    .map(([s, d]) => [tid(s), d] as [number, number])
    .filter(([t]) => t >= 0),
);
/** 流血族（尖刺/木尖刺/锋利尖刺块）→ Bleeding 10-20s */
export const TOUCH_BLEEDING = setOf([48, 232, 750]);
/** 灼烧族（陨石/狱石/狱石砖/远古狱石砖）→ Burning 20t（0.33s,持续接触刷新） */
export const TOUCH_HOT = setOf([37, 58, 76, 684, 230]);
/** 窒息族（沙/沙岩/黑檀沙/珍珠沙/泥沙/猩红沙）→ 埋入 20 HP/s */
export const SUFFOCATE = setOf([53, 112, 116, 123, 224, 234]);
/** 触碰即毁族（腐化刺/丛林刺/猩红刺/世纪之花刺） */
export const TOUCH_DESTROY = setOf([32, 69, 352, 655]);

/**
 * CanTileHurt（Collision.cs:3209）。fireWalk = 黑曜石骷髅族（本作装备位），
 * 豁免灼烧族。仙人掌(80) 与 230 原版仅特殊种子有效——普通世界恒 false，
 * 故 80 入 IMMEDIATE 表但 HOT 的 230 仅 ftw——表内保留,伤害侧照常、
 * 230 因 TouchDamageHot 命中 fireWalk=false 会生效……原版被 CanTileHurt
 * 第一闸拦住,这里同闸:230 排除。
 */
export function canTileHurt(t: number, fireWalk: boolean): boolean {
  if (t === tid(230)) return false; // 仅 For-the-Worthy 种子,本作不支持
  if (t === tid(80)) return false;   // 仙人掌仅 The Constant 种子造成接触伤害(Collision.cs:3226-3228);旧"恒判可伤 6 点"与头注矛盾
  if (TOUCH_IMMEDIATE.has(t) || TOUCH_BLEEDING.has(t) || SUFFOCATE.has(t)) return true;
  if (TOUCH_HOT.has(t) && !fireWalk) return true;
  return false;
}

export interface HurtTile { type: number; x: number; y: number }

/**
 * Collision.LavaCollision / WetCollision（Collision.cs:1575-1690）盒判定:
 * 实体包围盒覆盖到任一液体格（liquid>0 且类型匹配）即命中。
 * liquidType: 1 水 / 2 岩浆 / 3 蜂蜜。
 */
export function liquidCollision(st: TileStore, px: number, py: number, pw: number, ph: number, liquidType: number): boolean {
  const TS = 16;
  const i0 = Math.max(0, Math.floor(px / TS));
  const i1 = Math.min(st.w - 1, Math.floor((px + pw - 0.01) / TS));
  const j0 = Math.max(0, Math.floor(py / TS));
  const j1 = Math.min(st.h - 1, Math.floor((py + ph - 0.01) / TS));
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const idx = st.idx(i, j);
      if (st.liquid[idx] > 0 && st.liquidType[idx] === liquidType) return true;
    }
  }
  return false;
}

/**
 * Collision.DrownCollision（Collision.cs:1385-1444）1:1——头部浸液判定。
 * 头部采样盒:X=px+trunc(pw/2)−trunc(num/2) 居中宽 num=min(10,pw),Y=py−2
 * （gravDir==−1 时 +trunc(ph/2)−6）,高 num2=min(12,ph)。
 * ★中心三项全是 C# `(float)(Width/2)` 式【整数除】（Collision.cs:1387/:1394/:1397）
 * ——奇数尺寸体浮点除即偏 0.5px（蓝队 F4③ 2026-09-01 定罪;WetCollision 同族坑
 * 与五处整除清单见 npcLiquid.ts:44-52）。
 * 命中条件:液体>0 且非岩浆(2)非微光(4)——**蜂蜜(3)也可淹**——且该格不在豁免行
 * (gravDir==1 取扫描首行,否则末行-1;豁免行若 active+solid+非 solidTop 则不计,
 * 即头顶贴实心块时该行液体不算;includeSlopes=true 时 blockType()!=0——半砖/坡面,
 * Tile.cs:204-216——反例计水)。
 * 液面高度:drop=(256-liquid)/32,表面 Y=j*16+drop*2,有效高 16-trunc(drop*2)。
 * 扫描窗钳制 0..maxTilesX−1 / 0..maxTilesY−40（Collision.cs:1404-1407）。
 * includeSlopes 实参对号（蓝队 F4②,2026-09-01）:NPC.cs:54361 AI_007 flag21 与
 * :54285 idle 起身传【true】（坡面/半砖带液计水触发溺逃）;玩家 Player.cs:23379
 * 与 NPC :96058 CheckDrowning/:56311 walkPrediction 缺省 false。
 */
export function drownCollision(
  st: TileStore, px: number, py: number, pw: number, ph: number,
  gravDir: 1 | -1, includeSlopes = false,
): boolean {
  const TS = 16;
  const num = Math.min(10, pw), num2 = Math.min(12, ph);
  const vx = px + Math.floor(pw / 2) - Math.floor(num / 2);   // (float)(Width/2)−(float)(num/2)
  const vy = py - 2 + (gravDir === -1 ? Math.floor(ph / 2) - 6 : 0);   // +Height/2−6 同整数除
  const i0 = Math.max(0, Math.floor(px / TS) - 1);
  const i1 = Math.min(st.w - 1, Math.floor((px + pw) / TS) + 2);
  const j0 = Math.max(0, Math.floor(py / TS) - 1);
  const j1 = Math.min(st.h - 40, Math.floor((py + ph) / TS) + 2);
  const topRow = gravDir === 1 ? j0 : j1 - 1; // 豁免判定行(原版 num4)
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      const liq = st.liquid[idx], lt = st.liquidType[idx];
      if (liq <= 0 || lt === 2 || lt === 4) continue; // !lava && !shimmer
      // 豁免行排除（Collision.cs:1418）：j==num4 且 tile.active()【纯在场位——
      //   ★L1 NX3 同位核正（2026-09-01）：原版无 inActive 检查,致动实心块头顶那行
      //   液体同样不计水;旧 isActive=nactive() 口径把致动实心放行成"淹水"】且
      //   tileSolid（Main.tileSolid 静态表——st.isSolid 带致动闸不可用）且
      //   非 tileSolidTop（静态族表,见 TILE_SOLID_TOP_FAMILY 注）且
      //   非（includeSlopes && blockType()!=0）→ 该行液体不计。
      //   ★F4②（2026-09-01）：includeSlopes 臂落地——NPC.cs:54361/:54285 传 true,
      //   坡面/半砖带液反例计水;blockType()=halfBrick?1:(slope?slope+1:0),
      //   !=0 ⇔ half||slope>0（Tile.cs:204-216）。
      const t = st.type[idx];
      // ★幽灵保域（2026-09-03）：active() 纯在场位补 flags bit0（原版 Collision.cs:1418
      //  `!tile.active()` 支）——幽灵实心格头顶那行液体照常计水（不豁免）
      if (j === topRow && t !== 0 && (st.flags[idx] & 1) !== 0 && !!TILE_DEFS[t]?.solid
        && !TILE_SOLID_TOP_FAMILY.has(t)
        && !(includeSlopes && (st.half[idx] !== 0 || st.slope[idx] > 0))) continue;
      const drop = (256 - liq) / 32;
      const surfY = j * TS + drop * 2;
      const surfH = TS - Math.trunc(drop * 2);
      if (vx + num > i * TS && vx < i * TS + TS && vy + num2 > surfY && vy < surfY + surfH) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Collision.StickyTiles（Collision.cs:3375）:盒内蛛网(51)/活木(229,无坡)命中。
 * 返回命中格（供 StickyMovement 挣断销毁）;未命中返回 null。
 */
export function stickyTiles(st: TileStore, px: number, py: number, pw: number, ph: number): HurtTile | null {
  const TS = 16;
  const bySheet = BY_SHEET;
  const WEB = bySheet.get(51) ?? -1;
  const LIVING = bySheet.get(229) ?? -1;
  const i0 = Math.max(0, Math.floor(px / TS) - 1);
  const i1 = Math.min(st.w, Math.floor((px + pw) / TS) + 2);
  const j0 = Math.max(0, Math.floor(py / TS) - 1);
  const j1 = Math.min(st.h - 40, Math.floor((py + ph) / TS) + 2);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if (!st.flags[idx]) continue;
      const t = st.type[idx];
      if (t !== WEB && !(t === LIVING && st.slope[idx] === 0)) continue;
      if (px + pw > i * TS && px < i * TS + TS && py + ph > j * TS && py < j * TS + 16.01) {
        return { type: t, x: i, y: j };
      }
    }
  }
  return null;
}

/**
 * HurtTiles（Collision.cs:3128）:实体包围盒外扩 1 tile 扫描,返回首个可伤块。
 * 半砖下移 8px;窒息族缩盒 2px(num6);坡面块走原版 num7 双对面命中判定
 * （仅坡上薄侧接触时跳过——本作坡面数据少,按原版比较式移植）。
 */
export function hurtTiles(
  st: TileStore, px: number, py: number, pw: number, ph: number, fireWalk: boolean,
): HurtTile | null {
  const TS = 16;
  const i0 = Math.max(0, Math.floor(px / TS) - 1);
  const i1 = Math.min(st.w, Math.floor((px + pw) / TS) + 2);
  const j0 = Math.max(0, Math.floor(py / TS) - 1);
  const j1 = Math.min(st.h - 40, Math.floor((py + ph) / TS) + 2);
  for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const idx = st.idx(i, j);
      if (!st.flags[idx]) continue;
      const t = st.type[idx];
      if (!canTileHurt(t, fireWalk)) continue;
      let ty = j * TS;
      let th = TS;
      if (st.half[idx]) { ty += 8; th -= 8; }
      const num6 = SUFFOCATE.has(t) ? 2 : 0;
      // 盒重叠（原版四向比较）
      if (px + pw - num6 < i * TS || px + num6 > i * TS + TS
        || py + ph - num6 < ty - 0.5 || py + num6 > ty + th + 0.5) continue;
      // 坡面:实体须与坡的"厚"侧重叠（num7==2 = 全在薄侧 → 跳过）
      const slope = st.slope[idx];
      if (slope > 0) {
        if (num6 > 0) continue; // 窒息族不与坡面交互（原版同款）
        let num7 = 0;
        if ((slope === 1 || slope === 4) && px > i * TS) num7++;          // 右高
        if ((slope === 2 || slope === 3) && px + pw < i * TS + TS) num7++; // 左高
        if ((slope === 3 || slope === 4) && py > ty) num7++;               // 下高(倒坡)
        if ((slope === 1 || slope === 2) && py + ph < ty + th) num7++;     // 上高
        if (num7 === 2) continue;
      }
      return { type: t, x: i, y: j };
    }
  }
  return null;
}
