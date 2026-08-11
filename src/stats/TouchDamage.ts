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

/** 触碰直接伤害值（TouchDamageImmediate;尖刺 48=60 木尖刺 232=80 荆棘 10/17 等） */
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
