// 风摆动系统核心数学 1:1 验证（TileDrawing.cs :7800/:377 + WindGrid.cs）
import { describe, it, expect, beforeEach } from 'vitest';
import { windSway, getWindCycle, swayBakeSkip, _windSwayInternals } from '../src/render/WindSway';
import { options } from '../src/core/Options';
import { TILE_DEFS } from '../src/data/tiles';

const { counters, windGrid, windGridPush, inAPlaceWithWind, SWAY_REC } = _windSwayInternals;

/** 造最小 TileStore 形状（inAPlaceWithWind 只读 inBounds/idx/liquid/wall） */
function fakeStore(w = 8, h = 8) {
  const liquid = new Uint8Array(w * h);
  const wall = new Uint8Array(w * h);
  return {
    w, h, liquid, wall,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
  } as never;
}

describe('wind-sway 相位钟（TileDrawing.Update :377-380）', () => {
  beforeEach(() => {
    options.data.swayInWind = true;
    counters.tree = 0; counters.grass = 0; counters.sunflower = 0; counters.vine = 0;
  });

  it('无风时四钟以基础速率推进', () => {
    windSway.update(0, null, 4, 4);
    expect(counters.tree).toBeCloseTo(1 / 240, 12);
    expect(counters.grass).toBeCloseTo(1 / 180, 12);
    expect(counters.sunflower).toBeCloseTo(1 / 420, 12);
    expect(counters.vine).toBeCloseTo(1 / 120, 12);
  });

  it('满风(|w|=1.2+)时各钟加速倍率正确', () => {
    windSway.update(1.2, null, 4, 4); // lerp(0.08,1.2,1.2)=1
    expect(counters.tree).toBeCloseTo((1 / 240) * 3, 10);   // 1 + 1*2
    expect(counters.grass).toBeCloseTo((1 / 180) * 5, 10);  // 1 + 1*4
    expect(counters.sunflower).toBeCloseTo((1 / 420) * 6, 10); // 1 + 1*5
    expect(counters.vine).toBeCloseTo((1 / 120) * 1.4000000059604645, 8); // 1 + 1*0.4（原版 float 字面量）
  });

  it('设置关闭时 wind 归零（GetWindCycle 恒 0）', () => {
    options.data.swayInWind = false;
    windSway.update(0.5, null, 4, 4);
    expect(windSway.wind).toBe(0);
    expect(getWindCycle(0, 10, counters.grass, 100)).toBe(0);
    options.data.swayInWind = true;
  });
});

describe('getWindCycle（:7800-7822）', () => {
  beforeEach(() => { options.data.swayInWind = true; windSway.wind = 0.5; });

  it('微风(<0.08)恒 0——无风门 lerp(0.08,0.18)', () => {
    windSway.wind = 0.07;
    expect(Math.abs(getWindCycle(3, 10, 0.25, 100))).toBe(0);
  });

  it('相位随格位偏移（相邻格不同步；y/100 整除段内同相位）', () => {
    const a = getWindCycle(0, 10, 0, 200);
    const b = getWindCycle(1, 10, 0, 200);
    const c = getWindCycle(0, 60, 0, 200); // floor(60/100)=0 与 y=10 同段
    const d = getWindCycle(0, 110, 0, 200); // floor(110/100)=1 → 相位 +0.5
    expect(a).not.toBe(b);
    expect(a).toBe(c);
    expect(a).not.toBe(d);
  });

  it('地下(y>=worldSurface)恒 0', () => {
    expect(getWindCycle(0, 100, 0.25, 100)).toBe(0);
    expect(getWindCycle(0, 99, 0.25, 100)).not.toBe(0);
  });

  it('公式：cos(counter·2π+phase)·0.5+wind 后乘 lerp 门', () => {
    windSway.wind = 0.18; // 门全开 = 1
    const phase = 4 * 0.5 + Math.floor(20 / 100) * 0.5;
    const expect0 = (Math.cos(0.3 * 6.2831854820251465 + phase) * 0.5 + 0.18) * 1;
    expect(getWindCycle(4, 20, 0.3, 100)).toBeCloseTo(expect0, 6);
  });
});

describe('WindGrid（WindGrid.cs）', () => {
  beforeEach(() => { options.data.swayInWind = true; });

  it('移动玩家打风、静止不打（ScanPlayer :113-126）', () => {
    const g = windGrid;
    g.ensure(4, 4);
    const mover = { x: 16, y: 16, w: 20, h: 42, vx: 3, vy: 0 };
    g.scan(mover); // 标记 (1,1)-(2,3)，dir=(1,0)
    let [elapsed, dx, dy] = g.windTime(1, 1, 20);
    expect([elapsed, dx, dy]).toEqual([0, 1, 0]); // 刚标记 elapsed=0
    g.scan({ ...mover, vx: 0, vy: 0 }); // 静止不打
    [elapsed] = g.windTime(1, 1, 20);
    expect(elapsed).toBe(1); // 时间流逝但标记未刷新
    // 玩家盒外（盒 x=1..2）——未标记格在 threshold 窗口内有原版同款"网格 origin"幽灵值
    //（WindCoord.Time 默认 0 → 前 20 帧返回 gameTime-0；超窗归 0）
    for (let i = 0; i < 21; i++) g.scan(null);
    const [t0] = g.windTime(3, 3, 20);
    expect(t0).toBe(0);
    const [t1] = g.windTime(1, 1, 20);
    expect(t1).toBe(0); // 标记同样超窗过期
  });

  it('三角波脉冲：elapsed 过半转降、超时归零（GetWindGridPush :8711）', () => {
    const g = windGrid;
    g.ensure(4, 4);
    const p = { x: 16, y: 16, w: 20, h: 42, vx: 2, vy: 0 };
    g.scan(p); // 标记 (1,1)
    const vals: number[] = [];
    for (let i = 0; i < 24; i++) {
      vals.push(windGridPush(1, 1, 20, 0.35));
      g.scan(null); // gameTime++ 不刷新
    }
    // elapsed=0 → 0；峰在半程 elapsed=10 → (20-10)*0.35=3.5；
    // 过半走 t*force 降支；elapsed>20 归 0
    expect(vals[0]).toBe(0);
    expect(vals[10]).toBeCloseTo(3.5, 6);
    expect(vals[11]).toBeCloseTo(9 * 0.35, 6);
    expect(vals[23]).toBe(0);
  });
});

describe('inAPlaceWithWind（WorldGen.cs:87603）', () => {
  it('地表+空墙放行；液体/挡风墙拒绝', () => {
    const st = fakeStore();
    expect(inAPlaceWithWind(st, 0, 0, 1, 1, 10)).toBe(true);
    (st as unknown as { liquid: Uint8Array }).liquid[0] = 1;
    expect(inAPlaceWithWind(st, 0, 0, 1, 1, 10)).toBe(false);
    (st as unknown as { liquid: Uint8Array }).liquid[0] = 0;
    (st as unknown as { wall: Uint8Array }).wall[0] = 1; // 石墙不在 AllowsWind
    expect(inAPlaceWithWind(st, 0, 0, 1, 1, 10)).toBe(false);
    (st as unknown as { wall: Uint8Array }).wall[0] = 107; // 栅栏 AllowsWind
    expect(inAPlaceWithWind(st, 0, 0, 1, 1, 10)).toBe(true);
  });
  it('地下恒 false（DoesWindBlowAtThisHeight）', () => {
    expect(inAPlaceWithWind(fakeStore(), 0, 10, 1, 1, 10)).toBe(false);
  });
});

describe('烘焙摘除（swayBakeSkip，路由 :536-728 例外语义）', () => {
  it('摆动图块全摘除，530/705 高段与 227 排除帧保留烘焙', () => {
    let sheet3 = -1, sheet530 = -1, sheet227 = -1;
    for (const [id, r] of SWAY_REC) {
      if (r.sheet === 3 && sheet3 < 0) sheet3 = id;
      if (r.sheet === 530) sheet530 = id;
      if (r.sheet === 227) sheet227 = id;
    }
    expect(sheet3).toBeGreaterThanOrEqual(0);
    expect(swayBakeSkip(sheet3, 0)).toBe(true);
    // 530：fx<270 摘除、fx>=270 烘焙
    expect(swayBakeSkip(sheet530, 0)).toBe(true);
    expect(swayBakeSkip(sheet530, 270)).toBe(false);
    // 227：排除帧烘焙（原版走 DrawSingleTile）
    expect(swayBakeSkip(sheet227, 204)).toBe(false);
    expect(swayBakeSkip(sheet227, 0)).toBe(true);
  });

  it('非摆动图块（泥土/树干）不摘除', () => {
    const dirt = TILE_DEFS.findIndex((d) => d.key === 'dirt');
    expect(swayBakeSkip(dirt, 0)).toBe(false);
    const tree = TILE_DEFS.findIndex((d) => d.key === 'tree');
    expect(swayBakeSkip(tree, 0)).toBe(false);
  });

  it('摆动集合覆盖关键族（草/藤/药草/吊挂/多格草）', () => {
    const sheets = new Set<number>();
    for (const r of SWAY_REC.values()) sheets.add(r.sheet);
    for (const s of [3, 24, 73, 74, 83, 84, 110, 184, 27, 52, 549, 34, 42, 521]) {
      expect(sheets.has(s), `sheet ${s} 未注册摆动`).toBe(true);
    }
  });
});
