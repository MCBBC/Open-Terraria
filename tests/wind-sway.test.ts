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

// ============ 二轮补齐（变体表/药草/落叶/水型/LitNature） ============
import { litNatureVisibility, isAlchemyPlantHarvestable, type SwayEnv } from '../src/render/WindSway';
import { getTreeLeaf, dripGoreFor, leafEmits } from '../src/render/NatureParticles';
import { Clock } from '../src/world/World';

describe('MultiTileVine 变体表（:9430-9532 全量）', () => {
  const mv = _windSwayInternals.multiVineVariant;
  it('34/126 key 变体逐条（key = fy/54 + fx/108*37）', () => {
    const at = (key: number) => mv(34, Math.floor(key / 37) * 108, (key % 37) * 54); // key = fy/54 + fx/108*37
    expect(at(9)).toMatchObject({ num3: null, num5: -1, num2Mul: 0.3, flag2: true });
    expect(at(11)).toMatchObject({ num2Mul: 0.5 });
    expect(at(12)).toMatchObject({ num3: null, num5: -1 });
    expect(at(18)).toMatchObject({ num3: null, num5: -1 });
    expect(at(21)).toMatchObject({ num3: null, num5: -1 });
    expect(at(23)).toMatchObject({ num3: 0 });
    expect(at(25)).toMatchObject({ num3: null, num5: -1, flag2: true });
    expect(at(32)).toMatchObject({ num2Mul: 0.5 });
    expect(at(35)).toMatchObject({ num3: 0 });
    expect(at(36)).toMatchObject({ num3: null, num5: -1, flag2: true });
    expect(at(37)).toMatchObject({ num3: null, num5: -1, flag2: true, num2Mul: 0.5 });
    expect(at(39)).toMatchObject({ num3: null, num5: -1, flag2: true });
    expect(at(40)).toMatchObject({ num3: null, num5: -2, flag2: true, num2Mul: 0.5 });
    expect(at(43)).toMatchObject({ num3: null, num5: -2, flag2: true, num2Mul: 0.5 });
    expect(at(44)).toMatchObject({ num3: null, num5: -3 });
    expect(at(54)).toMatchObject({ num3: 0 });
    expect(at(70)).toMatchObject({ num3: 0 });
    expect(at(0)).toMatchObject({ num3: 1, num5: 0, num2Mul: 1, flag2: false });
  });
  it('42 行变体（key = fy/36）', () => {
    const at = (row: number) => mv(42, 0, row * 36);
    expect(at(0)).toMatchObject({ num3: null, num5: -1 });
    expect(at(9)).toMatchObject({ num3: 0 });
    expect(at(30)).toMatchObject({ num3: 0 });
    expect(at(39)).toMatchObject({ num3: null, num5: -1, flag2: true });
    expect(at(43)).toMatchObject({ num3: null, num5: -1, flag2: true });
    expect(at(70)).toMatchObject({ num3: 0 });
    expect(at(5)).toMatchObject({ num3: 1, num5: 0 });
  });
  it('其余类型基础值：95 族 num5=0；591/592 nx=0.5,num5=-2；698 offX=-10；91/465 默认 -4', () => {
    expect(mv(95, 0, 0)).toMatchObject({ num3: 1, num5: 0 });
    expect(mv(591, 0, 0)).toMatchObject({ nx: 0.5, num5: -2 });
    expect(mv(592, 0, 0)).toMatchObject({ nx: 0.5, num5: -2 });
    expect(mv(698, 0, 0)).toMatchObject({ nx: 0.5, num5: -1, offX: -10 });
    expect(mv(91, 0, 0)).toMatchObject({ num3: null, num5: -4 });
    expect(mv(465, 0, 0)).toMatchObject({ num3: null, num5: -4 });
  });
});

describe('isAlchemyPlantHarvestable（WorldGen.cs:66198）', () => {
  const setEnv = (e: Partial<SwayEnv['zones']> & Partial<SwayEnv>) => {
    // 模块级 ENV 由 drawWindSwayTiles 注入；测试经 internals 暴露面改写
    const internal = _windSwayInternals as unknown as { setEnv?: (e: Partial<SwayEnv>) => void };
    void internal; void e;
  };
  void setEnv;
  it('style0 昼熟 / style1 夜熟 / style3 血月或满月夜熟', () => {
    // ENV 默认 dayTime=true：style0 熟
    expect(isAlchemyPlantHarvestable(0, 100)).toBe(true);
    expect(isAlchemyPlantHarvestable(1, 100)).toBe(false); // 夜草昼不熟
    expect(isAlchemyPlantHarvestable(2, 100)).toBe(false); // 原版即不判 style2
    expect(isAlchemyPlantHarvestable(6, 100)).toBe(false);
  });
});

describe('落叶（GetTreeLeaf / EmitTreeLeaves 频率）', () => {
  it('树型直选：596→1248 / 616→1257 / 634→1278 / 宝石树 1249+', () => {
    expect(getTreeLeaf(0, 22, 198, 596, 2)).toBe(1248);
    expect(getTreeLeaf(0, 22, 198, 616, 2)).toBe(1257);
    expect(getTreeLeaf(0, 22, 198, 634, 2)).toBe(1278);
    expect(getTreeLeaf(0, 22, 198, 583, 2)).toBe(1249);
    expect(getTreeLeaf(0, 22, 198, 589, 2)).toBe(1255);
  });
  it('草型映射：森林 910 / 丛林 914 / 蘑菇 912 / 沙 915/916 / 雪 911 / 神圣 919', () => {
    expect(getTreeLeaf(0, 22, 198, 5, 2)).toBe(910);
    expect(getTreeLeaf(0, 22, 198, 5, 60)).toBe(914);
    expect(getTreeLeaf(0, 22, 198, 5, 70)).toBe(912);
    expect(getTreeLeaf(0, 22, 198, 5, 112)).toBe(915);
    expect(getTreeLeaf(0, 22, 198, 5, 199)).toBe(916);
    expect(getTreeLeaf(0, 22, 198, 5, 53)).toBe(911);
    expect(getTreeLeaf(0, 22, 198, 5, 116)).toBe(919);
    expect(getTreeLeaf(0, 22, 198, 5, 147)).toBe(913);
  });
  it('未知草型不出叶（原版 switch 无 default → passStyle=-1）', () => {
    expect(getTreeLeaf(0, 22, 198, 5, 0)).toBe(-1);
    expect(getTreeLeaf(0, 22, 198, 5, 999)).toBe(-1);
  });
  it('109/492 中空树：x%3 错帧 → 917-925（style!=20 支）', () => {
    const ids = new Set<number>();
    for (let x = 0; x < 24; x++) ids.add(getTreeLeaf(x, 22, 198, 5, 109));
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(917);
      expect(id).toBeLessThanOrEqual(925);
    }
    expect(ids.size).toBeGreaterThan(1); // 错帧产生了不同叶型
  });
  it('喷出排除：912/913/1278/-1 不出叶', () => {
    expect(leafEmits(912)).toBe(false);
    expect(leafEmits(913)).toBe(false);
    expect(leafEmits(1278)).toBe(false);
    expect(leafEmits(-1)).toBe(false);
    expect(leafEmits(910)).toBe(true);
    expect(leafEmits(1113)).toBe(true);
  });
  it('UpdateLeafFrequency 档位 + ×7 尾乘', () => {
    windSway.update(0.05, null, 8, 8);   // ≤0.1 → 2000×7
    expect(windSway.leafFreq).toBe(14000);
    windSway.update(0.8, null, 8, 8);    // ≤0.8 → 50×7
    expect(windSway.leafFreq).toBe(350);
    windSway.update(1.5, null, 8, 8);    // >1.1 → 10×7
    expect(windSway.leafFreq).toBe(70);
    windSway.update(0, null, 8, 8);
  });
});

describe('dripGoreFor 水型映射（TileDrawing :7749-7785）', () => {
  const Z = { corrupt: false, crimson: false, hallow: false };
  it('基础/水型/叶型', () => {
    expect(dripGoreFor(373, 0, Z)).toBe(706);
    expect(dripGoreFor(373, 5, Z)).toBe(710);
    expect(dripGoreFor(373, 12, Z)).toBe(1147);
    expect(dripGoreFor(373, 13, Z)).toBe(706);
    expect(dripGoreFor(374, 0, Z)).toBe(716);
    expect(dripGoreFor(375, 0, Z)).toBe(717);
    expect(dripGoreFor(709, 0, Z)).toBe(1383);
  });
  it('461 按群系：默认 943 / 腐化 1160 / 猩红 1161 / 神圣 1162', () => {
    expect(dripGoreFor(461, 0, Z)).toBe(943);
    expect(dripGoreFor(461, 0, { corrupt: true, crimson: false, hallow: false })).toBe(1160);
    expect(dripGoreFor(461, 0, { corrupt: true, crimson: true, hallow: false })).toBe(1161);
    expect(dripGoreFor(461, 0, { corrupt: false, crimson: false, hallow: true })).toBe(1162);
  });
});

describe('litNatureVisibility（NextNatureRenderer :117-147）', () => {
  it('夜/正午为 0；晨窗与昏窗内 >0', () => {
    const mk = (t: number) => { const c = new Clock(60000); c.timeOfDay = t; return c; };
    expect(litNatureVisibility(mk(0.5))).toBe(0);           // 正午
    expect(litNatureVisibility(mk(0.1))).toBe(0);           // 夜
    // 晨窗：time=1200-7200 → t = 0.25 + time/54000*0.5；取 time=3000 → t≈0.278
    expect(litNatureVisibility(mk(0.25 + 3000 / 54000 * 0.5))).toBeGreaterThan(0);
    // 昏窗：time=43200-53400；取 48000 → t≈0.694
    expect(litNatureVisibility(mk(0.25 + 48000 / 54000 * 0.5))).toBeGreaterThan(0);
    // 日食清零
    const ec = mk(0.25 + 3000 / 54000 * 0.5); ec.eclipse = true;
    expect(litNatureVisibility(ec)).toBe(0);
  });
});

// ============ 月亮周期补齐（六轮） ============
import { fishingPowerMultiplier } from '../src/data/vanillaFishing';

describe('Fishing_GetPowerMultiplier（Player.cs:41560-41605）', () => {
  const base = { raining: false, cloudBGAlpha: 0, dayTime: true, time: 10000, moonPhase: 2, bloodMoon: false }; // 10000=上午中性段（无时段乘区）
  it('基准恒等（晴昼无月相修正）', () => {
    expect(fishingPowerMultiplier({ ...base, moonPhase: 2 })).toBeCloseTo(1, 6);
  });
  it('雨×1.2 / 云×1.1 叠乘', () => {
    expect(fishingPowerMultiplier({ ...base, raining: true })).toBeCloseTo(1.2, 6);
    expect(fishingPowerMultiplier({ ...base, raining: true, cloudBGAlpha: 0.5 })).toBeCloseTo(1.32, 6);
  });
  it('晨昏×1.3 / 正午×0.8 / 前半夜×0.8', () => {
    expect(fishingPowerMultiplier({ ...base, time: 3000 })).toBeCloseTo(1.3, 6);
    expect(fishingPowerMultiplier({ ...base, time: 50000 })).toBeCloseTo(1.3, 6);
    expect(fishingPowerMultiplier({ ...base, time: 30000 })).toBeCloseTo(0.8, 6);
    expect(fishingPowerMultiplier({ ...base, dayTime: false, time: 10000 })).toBeCloseTo(0.8, 6);
  });
  it('月相：满月×1.1 / 1,7 ×1.05 / 3,5 ×0.95 / 新月×0.9 / 血月×1.1', () => {
    expect(fishingPowerMultiplier({ ...base, moonPhase: 0 })).toBeCloseTo(1.1, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 1 })).toBeCloseTo(1.05, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 7 })).toBeCloseTo(1.05, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 3 })).toBeCloseTo(0.95, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 5 })).toBeCloseTo(0.95, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 4 })).toBeCloseTo(0.9, 6);
    expect(fishingPowerMultiplier({ ...base, moonPhase: 4, bloodMoon: true })).toBeCloseTo(0.99, 6);
  });
});

// ============ 依赖子系统接入（七轮） ============
import { rollRarities } from '../src/data/vanillaFishing';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';

describe('钓鱼稀有档（FishingCheck_RollDropLevels :20106-20167）', () => {
  it('下限钳制：L≥750 时 legendary 恒 1/6', () => {
    let hit = 0;
    for (let i = 0; i < 1200; i++) if (rollRarities(800).legendary) hit++;
    expect(hit / 1200).toBeGreaterThan(1 / 7);
    expect(hit / 1200).toBeLessThan(1 / 5);
  });
  it('低钓鱼力 legendary 稀（L=30 → 1/150 邻域）', () => {
    let hit = 0;
    for (let i = 0; i < 3000; i++) if (rollRarities(30).legendary) hit++;
    expect(hit).toBeLessThan(60); // 远低于 1/60
  });
  it('各档独立可同时命中（veryrare 不依赖 legendary）', () => {
    let both = 0;
    for (let i = 0; i < 4000; i++) {
      const r = rollRarities(500);
      if (r.legendary && r.veryrare) both++;
    }
    expect(both).toBeGreaterThan(0); // 独立 roll 允许同时
  });
});

describe('种子旗标（血月 1/6 十周年 / drunkWorld 翻转）', () => {
  it('celebrationmk10 → tenthAnniversary；05162020 → drunkWorld', () => {
    expect(parseSeed('celebrationmk10').flags.tenthAnniversary).toBe(true);
    expect(parseSeed('05162020').flags.drunkWorld).toBe(true);
    expect(parseSeed('12345').flags.tenthAnniversary).toBeUndefined();
  });
});
