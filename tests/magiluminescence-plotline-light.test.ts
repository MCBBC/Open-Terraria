// 荧光体 5107 手持光（2026-09-03 接线,登记销核）：
//   原版 = ApplyEquipFunctional case 5107（★1457 Player.cs:14663-14669;1456 :14087-14093），
//   经 UpdateEquips（:25830 Update 内逐 tick）无条件跑——地面门只在跑速四参数
//   （★1457 :26703-26704 hasMagiluminescence && velocity.Y==0;1456 :26188）。
//   DelegateMethods.v3_1=(0.9,0.8,0.5)（:14666）+ 两条宽 20px PlotTileLine：
//   ① Center→Center+velocity*6 ② Left→Right（:14667-14668）。
//   CastLightOpen（DelegateMethods.cs:729-748）=开放格 AddLight/实心格跳过但不截断,
//   界外截断。PlotTileLine/PlotLine = Utils.cs:2460-2487/:2359-2415 一比一。
// 实现落点：src/lighting/LightingEngine.ts（plotLine/plotTileLine 纯几何）+
//   src/entities/Player.ts（emitMagiluminescenceLight 布光臂）。
import { describe, it, expect } from 'vitest';
import { plotLine, plotTileLine } from '../src/lighting/LightingEngine';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import type { GameHooks } from '../src/entities/types';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];

// ================= 几何：PlotLine / PlotTileLine 对拍 =================

/** 参照系=反编译逐行转录（Utils.cs:2359-2415;唯一允许的二次实现,仅本测试用） */
function refPlotLine(x0: number, y0: number, x1: number, y1: number,
  plot: (x: number, y: number) => boolean, jump = true): boolean {
  const swap = (k: 'x0' | 'y0' | 'x1' | 'y1') => k; // noop,遮蔽 lint
  void swap;
  const S = <T,>(a: T, b: T): [T, T] => [b, a];
  if (x0 === x1 && y0 === y1) return plot(x0, y0);
  const flag = Math.abs(y1 - y0) > Math.abs(x1 - x0);
  if (flag) { [x0, y0] = S(x0, y0); [x1, y1] = S(x1, y1); }
  const num = Math.abs(x1 - x0);
  const num2 = Math.abs(y1 - y0);
  let num3 = Math.trunc(num / 2);
  let num4 = y0;
  const num5 = x0 < x1 ? 1 : -1;
  const num6 = y0 < y1 ? 1 : -1;
  for (let i = x0; i !== x1; i += num5) {
    if (flag) { if (!plot(num4, i)) return false; } else if (!plot(i, num4)) return false;
    num3 -= num2;
    if (num3 >= 0) continue;
    num4 += num6;
    if (!jump) { if (flag) { if (!plot(num4, i)) return false; } else if (!plot(i, num4)) return false; }
    num3 += num;
  }
  return true;
}

/** 参照系=Utils.PlotTileLine（:2460-2487 逐行;.NET (int)double.NaN=0x80000000 语义） */
function refPlotTileLine(sx: number, sy: number, ex: number, ey: number,
  width: number, plot: (x: number, y: number) => boolean): boolean {
  const num = width / 2.0;
  const vx = ex - sx, vy = ey - sy;
  const len = Math.hypot(vx, vy);
  const ux = vx / len, uy = vy / len;
  const px = -uy * num, py = ux * num;
  const tile = (v: number): number => (Number.isNaN(v) ? -2147483648 : Math.trunc(v / 16));
  const p1x = tile(sx - px), p1y = tile(sy - py);
  const p2x = tile(sx + px), p2y = tile(sy + py);
  const p3x = tile(sx), p3y = tile(sy);
  const p4x = tile(ex), p4y = tile(ey);
  const offMinX = p1x - p3x, offMinY = p1y - p3y;
  const offMaxX = p2x - p3x, offMaxY = p2y - p3y;
  return refPlotLine(p3x, p3y, p4x, p4y, (x, y) =>
    refPlotLine(x + offMinX, y + offMinY, x + offMaxX, y + offMaxY, plot, false));
}

const collect = (fn: (p: (x: number, y: number) => boolean) => boolean): Set<string> => {
  const seen = new Set<string>();
  fn((x, y) => { seen.add(`${x},${y}`); return true; });
  return seen;
};

describe('荧光体 5107①：Utils.PlotLine/PlotTileLine 几何一比一（Utils.cs:2359/:2460）', () => {
  it('PlotLine 金标：水平/垂直/陡线/浅线 终点格不落、jump=false 斜步双落点', () => {
    expect(collect((p) => plotLine(3, 3, 3, 3, p))).toEqual(new Set(['3,3']));
    expect(collect((p) => plotLine(2, 5, 8, 5, p))).toEqual(new Set(['2,5', '3,5', '4,5', '5,5', '6,5', '7,5']));   // 终点 8 不落
    expect(collect((p) => plotLine(5, 2, 5, 7, p))).toEqual(new Set(['5,2', '5,3', '5,4', '5,5', '5,6']));   // 陡线换轴
    // jump=true 斜线 vs jump=false 双落点
    const jumpA = collect((p) => plotLine(0, 0, 4, 2, p, true));
    const jumpB = collect((p) => plotLine(0, 0, 4, 2, p, false));
    expect(jumpB.size).toBeGreaterThan(jumpA.size);
    expect(collect((p) => refPlotLine(0, 0, 4, 2, p, false))).toEqual(jumpB);
  });

  it('plot 返 false 中断整线并返 false（CastLightOpen 界外截断语义）', () => {
    const gate = (x: number, y: number) => x < 5;
    expect(plotLine(0, 0, 20, 0, gate)).toBe(false);
    expect(plotLine(0, 0, 4, 0, gate)).toBe(true);
  });

  it('PlotTileLine 粗线 = 中线逐点 ±width/2 垂直短线（随机 200 段对拍参照转录）', () => {
    // 确定性 LCG（无 Main.rand 依赖）
    let s = 0x9e3779b9 >>> 0;
    const nxt = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
    for (let k = 0; k < 200; k++) {
      const sx = 100 + Math.floor(nxt() * 200), sy = 100 + Math.floor(nxt() * 200);
      const ex = 100 + Math.floor(nxt() * 300), ey = 100 + Math.floor(nxt() * 300);
      const width = [4, 8, 20, 40][Math.floor(nxt() * 4)];
      const a = collect((p) => plotTileLine(sx, sy, ex, ey, width, p));
      const b = collect((p) => refPlotTileLine(sx, sy, ex, ey, width, p));
      expect([...a].sort()).toEqual([...b].sort());
    }
  });

  it('零长线退化：velocity==0 臂 (int)NaN=INT_MIN 偏移 → emit 界外拒格整臂无光（原版行为）', () => {
    // CastLightOpen 界外返 false（:731-735）——内层垂直短线落 INT_MIN 垃圾格被拒,
    // 外层单点 lambda 返 false 整臂终止;有效格集为空
    const seen = collect((p) => plotTileLine(160, 304, 160, 304, 20,
      (x, y) => (x >= 0 && y >= 0 ? (seen.add(`${x},${y}`), true) : false)));
    expect(seen.size).toBe(0);
  });
});

// ================= 接线：emitMagiluminescenceLight =================

const W = 200, H = 120;

function mkPlayerWithHooks(solidRect?: { x0: number; y0: number; x1: number; y1: number }) {
  const store = new TileStore(W, H);
  if (solidRect) {
    for (let x = solidRect.x0; x <= solidRect.x1; x++) {
      for (let y = solidRect.y0; y <= solidRect.y1; y++) store.setTile(x, y, 1);
    }
  }
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const lights: Array<{ tx: number; ty: number; r: number; g: number; b: number }> = [];
  const hooks = {
    world: { store } as never,
    player: player as never,
    addLightAt: (x: number, y: number, r: number, g: number, b: number) => {
      lights.push({ tx: Math.floor(x / 16), ty: Math.floor(y / 16), r, g, b });
    },
  } as unknown as GameHooks;
  return { store, player, lights, hooks };
}

/** equipStats 覆写（accessory-1457-bodies 同款：getter 记忆化,实例自有属性遮蔽） */
function withEq(player: Player, patch: Record<string, unknown>): void {
  const merged = { ...(player.equipStats as unknown as Record<string, unknown>), ...patch };
  Object.defineProperty(player, 'equipStats', { get: () => merged, configurable: true });
}

const emit = (p: Player, g: GameHooks): void =>
  (p as unknown as { emitMagiluminescenceLight: (g: GameHooks) => void }).emitMagiluminescenceLight(g);

describe('荧光体 5107②：手持光布光臂（ApplyEquipFunctional case 5107 :14663-14669）', () => {
  it('在身每 tick 布光：色 (0.9,0.8,0.5)、Center+velocity*6 与 Left→Right 两臂并集', () => {
    const { player, lights, hooks } = mkPlayerWithHooks();
    withEq(player, { magiluminescence: true });
    player.vx = 0.5; player.vy = 0;   // 3px/t 前伸 → 与 Left→Right 臂同 Y 排
    emit(player, hooks);
    expect(lights.length).toBeGreaterThan(0);
    // 宽 20px 粗线：中心行 y=91 ± 10px 垂直偏移 → 跨 90/91 两行（PlotTileLine 粗线语义）
    const cy = 90 * 16 + 21;
    for (const L of lights) {
      expect([L.r, L.g, L.b]).toEqual([0.9, 0.8, 0.5]);
      expect([Math.floor((cy - 10) / 16), Math.floor((cy + 10) / 16)]).toContain(L.ty);
    }
    const txs = new Set(lights.map((L) => L.tx));
    expect(txs.has(Math.floor((60 * 16 + 10) / 16))).toBe(true);   // 中心格必亮
  });

  it('实心格跳过但不截断（CastLightOpen :738-742）；开放格照常布光', () => {
    // 玩家站 60,90;在 (52..68, 110..112) 铺实心墙——远离两臂,先验证开放域;
    // 再把墙铺到盒中心行 (60..66, 111) 上方一行的臂带上验证跳过
    const { store, player, lights, hooks } = mkPlayerWithHooks({ x0: 62, y0: 111, x1: 66, y1: 111 });
    withEq(player, { magiluminescence: true });
    player.vx = 0; player.vy = 0;   // 零速 → 速度臂无光（零长退化）,只剩横贯臂
    emit(player, hooks);
    const seen = new Set(lights.map((L) => `${L.tx},${L.ty}`));
    for (const k of seen) {
      const [tx, ty] = k.split(',').map(Number);
      expect(store.isActive(tx, ty) && store.isSolid(tx, ty)).toBe(false);   // 实心格无光
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it('站定帧只剩 Left→Right 横贯臂（零长速度臂原版即无光）+ 未佩戴零布光', () => {
    const { player, lights, hooks } = mkPlayerWithHooks();
    withEq(player, { magiluminescence: true });
    player.vx = 0; player.vy = 0;
    emit(player, hooks);
    const span = new Set(lights.map((L) => L.tx));
    expect(span.size).toBeGreaterThanOrEqual(1);
    // 横贯臂 = 碰撞盒 20px 宽 → 中心行 1-2 格
    expect(lights.every((L) => Math.abs(L.tx * 16 + 8 - (60 * 16 + 10)) <= 24)).toBe(true);

    const bare = mkPlayerWithHooks();
    emit(bare.player, bare.hooks);
    expect(bare.lights).toEqual([]);   // 未在身零布光（:14663 case 门）
  });
});
