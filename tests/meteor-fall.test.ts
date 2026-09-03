// 陨石坠落 1:1 测试（WorldGen.dropMeteor :6196-6316 / meteor :6318-6508 对照）
//   合成世界：平地石头地表 + 玩家远离。验证：
//   1) 落点产生陨石块 + 空腔（主体内部有空气格）
//   2) 玩家保护区（±1022/±639px）命中 → 该列作废（落点不在玩家附近）
//   3) 上限：地表以上 37 块 > 400×w/4200 → null
//   4) 云块打分 −100（落点避开浮岛云层列）
import { describe, it, expect } from 'vitest';
import { dropMeteor, placeMeteor, DESTROY_SHEETS, type MeteorHost } from '../src/world/MeteorFall';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

function makeHost(over: Partial<MeteorHost> & { seedW?: number; seedH?: number; seed?: number } = {}): MeteorHost {
  const W = over.seedW ?? 420, H = over.seedH ?? 200;
  const st = new TileStore(W, H);
  const DIRT = TILE_BY_KEY['dirt'] ?? 1, STONE = TILE_BY_KEY['stone'] ?? 1;
  for (let x = 0; x < W; x++) {
    for (let y = 90; y < H; y++) st.setTileSilent(x, y, y < 110 ? DIRT : STONE);
  }
  let s = over.seed ?? 42;
  const rngLike = {
    rand: () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff,
    int: (a: number, b: number) => a + Math.floor((s = (s * 1103515245 + 12345) & 0x7fffffff) % (b - a + 1)),
  } as Pick<MeteorHost, 'rand' | 'int'>;
  return {
    w: W, h: H, spawnX: Math.floor(W / 2), groundLevel: 85, rockLevel: 140, store: st,
    players: [{ x: 10 * 16, y: 80 * 16, w: 20, h: 42 }],   // 左上远离多数落点
    npcs: [], rand: rngLike.rand, int: rngLike.int,
    announce: () => {},
    ...over,
  } as MeteorHost;
}

const METEOR = () => TILE_BY_KEY['ore_meteorite'] ?? -1;

describe('陨石坠落（WorldGen.dropMeteor/meteor 1:1）', () => {
  it('落点产生陨石块主体 + 内部空腔（五层独立循环语义）', () => {
    const h = makeHost();
    const spot = dropMeteor(h);
    expect(spot).not.toBeNull();
    const st = h.store;
    let ore = 0, hollow = 0;
    const R = 45;
    for (let y = spot!.j - R; y <= spot!.j + R; y++) {
      for (let x = spot!.i - R; x <= spot!.i + R; x++) {
        if (st.type[st.idx(x, y)] === METEOR() && st.flags[st.idx(x, y)]) ore++;
        if (st.type[st.idx(x, y)] === 0 && Math.hypot(x - spot!.i, y - spot!.j) < 10) hollow++;
      }
    }
    expect(ore).toBeGreaterThan(100);       // 主体规模（r1≈17-22 半径球壳）
    expect(hollow).toBeGreaterThan(0);      // 空腔（②层在主体后雕刻——单遍合并会丢失）
    expect(hollow).toBeLessThan(360);       // 但不是全挖空
  });

  it('玩家保护区：玩家盒覆盖全部候选列 → null（w=420 场景）', () => {
    const h = makeHost();   // 420 宽,spawnX=210,候选列 [150,270] 扣 spawn±33.6
    h.players = [{ x: 210 * 16, y: 80 * 16, w: 20, h: 42 }];  // ±1022px=±64 格全盖
    expect(dropMeteor(h)).toBeNull();
  });

  it('落点必远离玩家盒 ±1022/±639px', () => {
    const h = makeHost();
    h.players = [{ x: 330 * 16, y: 80 * 16, w: 20, h: 42 }];  // 右侧 1/3 处
    const spot = dropMeteor(h);
    if (spot) {
      const cx = 330 * 16 + 10, cy = 80 * 16 + 21;
      const mx = spot.i * 16, my = spot.j * 16;
      const overlap = !(cx - 1022 > mx + 35 * 16 || cx + 1022 < mx - 35 * 16
        || cy - 639 > my + 35 * 16 || cy + 639 < my - 35 * 16);
      expect(overlap).toBe(false);
    }
  });

  it('上限：地表以上陨石块超 400×w/4200 → 拒绝', () => {
    const h = makeHost({ seedW: 420, seedH: 200 });
    const cap = Math.floor(400 * 420 / 4200);   // 40
    for (let n = 0, x = 5; x < 415 && n < cap + 1; x++) {
      for (let y = 5; y < 85 && n < cap + 1; y++) {
        h.store.setTileSilent(x, y, METEOR()); n++;
      }
    }
    expect(dropMeteor(h)).toBeNull();
  });

  it('云块列打分 −100：云岛上不落（打分远低于阈值,最后要么落别处要么 null）', () => {
    const h = makeHost({ seedW: 240, seedH: 200 });
    // 全图唯一实心面 = 高空云层（sheet 189 云）→ 地表无其他实心,落点只能打云
    const CLOUD = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 189);
    if (CLOUD < 0) return; // 云块未定义则跳过（数据集依赖）
    const st = h.store;
    for (let x = 0; x < 240; x++) for (let y = 90; y < 200; y++) st.setTileSilent(x, y, 0);
    for (let x = 0; x < 240; x++) for (let y = 30; y < 45; y++) st.setTileSilent(x, y, CLOUD);
    // 玩家挪走避保护；列首实心=云（solid+1 再 −100 → 大幅负分 < 阈值）
    h.players = [{ x: -5000, y: -5000, w: 20, h: 42 }];
    expect(dropMeteor(h)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// placeMeteor 循环序/门序逐位对拍（2026-09-03 对齐批,WorldGen.cs:6307 meteor）
//   原版五层全部 x 外 y 内（:6371-6372 num2 外层扫 x/num3 内层扫 y,②③④⑤同构）；
//   层④⑤门序 = 短路 || 链直译（:6445/:6470）「顶切掷(每格必掷) → active 门(无掷)
//   → 1/10·1/20 掷 → 距离门」。参照体 refMeteor 按 C# 文本直译（sqrt 公式与
//   实现逐字同式,防浮点边界假差）;legacy=true 复刻修复前形态（y 外 x 内 +
//   active 门前置）作旧/新 IoU 对照。同种 LCG 流（makeHost 恒 s=42）对拍。
// ---------------------------------------------------------------------------
/** Next(a,b) 左闭右开 → 闭区间 [a, b-1]（与 MeteorFall.ts 模块内 next 同式） */
const next = (h: Pick<MeteorHost, 'int'>, a: number, b: number) => h.int(a, b - 1);

function refMeteor(h: MeteorHost, st: TileStore, i: number, j: number, legacy: boolean): void {
  const MET = METEOR();
  const set = (x: number, y: number, t: number) => {
    st.setTileSilent(x, y, t, 0, 0);
    st.half[st.idx(x, y)] = 0;
    st.slope[st.idx(x, y)] = 0;
  };
  const solidAt = (x: number, y: number) =>
    st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0 && !!TILE_DEFS[st.type[st.idx(x, y)]]?.solid;
  // 与实现逐字同式（Math.sqrt(a*a+b*b)）——Math.hypot 不保证位级同值
  const dist = (x: number, y: number) => Math.sqrt((x - i) * (x - i) + (y - j) * (y - j));
  const each = (r: number, fn: (x: number, y: number) => void) => {
    if (legacy) {
      for (let y = j - r; y < j + r; y++) for (let x = i - r; x < i + r; x++) fn(x, y);
    } else {
      for (let x = i - r; x < i + r; x++) for (let y = j - r; y < j + r; y++) fn(x, y);
    }
  };
  let num = next(h, 17, 23);                       // ① 主体 :6370-6392
  each(num, (x, y) => {
    if (y <= j + next(h, -2, 3) - 5) return;
    if (!st.inBounds(x, y)) return;
    if (dist(x, y) >= num * 0.9 + next(h, -4, 5)) return;
    set(x, y, solidAt(x, y) ? MET : 0);
  });
  num = next(h, 8, 14);                            // ② 空腔 :6394-6408
  each(num, (x, y) => {
    if (y <= j + next(h, -2, 3) - 4) return;
    if (!st.inBounds(x, y)) return;
    if (dist(x, y) >= num * 0.8 + next(h, -3, 4)) return;
    set(x, y, 0);
  });
  num = next(h, 25, 35);                           // ③ 清理环 :6410-6438（无掷层）
  each(num, (x, y) => {
    if (!st.inBounds(x, y)) return;
    const idx = st.idx(x, y);
    if (dist(x, y) < num * 0.7) {
      const d = TILE_DEFS[st.type[idx]];
      if (st.flags[idx] && d?.vanilla?.sheet !== undefined && DESTROY_SHEETS.has(d.vanilla.sheet)) set(x, y, 0);
      if (st.liquid[idx] > 0) st.liquid[idx] = 0;
    }
    if (st.type[idx] === MET) {
      if (!solidAt(x - 1, y) && !solidAt(x + 1, y) && !solidAt(x, y - 1) && !solidAt(x, y + 1)) {
        st.setTileSilent(x, y, 0);
      } else if ((st.half[idx] !== 0
        || (st.inBounds(x - 1, y) && (st.slope[st.idx(x - 1, y)] === 1 || st.slope[st.idx(x - 1, y)] === 2)))
        && !solidAt(x, y + 1)) {
        st.setTileSilent(x, y, 0);
      }
    }
  });
  num = next(h, 23, 32);                           // ④ 散布内环 :6440-6463
  each(num, (x, y) => {
    if (!legacy && y <= j + next(h, -3, 4) - 3) return;   // 顶切掷链首（每格必掷）
    if (!st.inBounds(x, y)) return;
    const idx = st.idx(x, y);
    if (legacy) {
      if (st.flags[idx] === 0) return;                   // 旧形态:active 门前置
      if (y <= j + next(h, -3, 4) - 3) return;
    } else if (st.flags[idx] === 0) return;
    if (next(h, 0, 10) !== 0) return;
    if (dist(x, y) >= num * 0.8) return;
    set(x, y, MET);
  });
  num = next(h, 30, 38);                           // ⑤ 散布外环 :6465-6490
  each(num, (x, y) => {
    if (!legacy && y <= j + next(h, -2, 3)) return;
    if (!st.inBounds(x, y)) return;
    const idx = st.idx(x, y);
    if (legacy) {
      if (st.flags[idx] === 0) return;
      if (y <= j + next(h, -2, 3)) return;
    } else if (st.flags[idx] === 0) return;
    if (next(h, 0, 20) !== 0) return;
    if (dist(x, y) >= num * 0.85) return;
    set(x, y, MET);
  });
}

/** 盒内逐格状态对比 + 陨石形状 IoU（R=40 覆盖最大 r=37） */
function compareBox(a: TileStore, b: TileStore, i: number, j: number, R = 40) {
  let mismatch = 0, inter = 0, union = 0;
  for (let y = j - R; y <= j + R; y++) {
    for (let x = i - R; x <= i + R; x++) {
      const ia = a.idx(x, y), ib = b.idx(x, y);
      if (a.type[ia] !== b.type[ib] || a.flags[ia] !== b.flags[ib]
        || a.half[ia] !== b.half[ib] || a.slope[ia] !== b.slope[ib]) mismatch++;
      const ma = a.flags[ia] !== 0 && a.type[ia] === METEOR();
      const mb = b.flags[ib] !== 0 && b.type[ib] === METEOR();
      if (ma && mb) inter++;
      if (ma || mb) union++;
    }
  }
  return { mismatch, iou: union === 0 ? 1 : inter / union };
}

describe('placeMeteor 循环序/门序逐位对拍（WorldGen.cs:6370-6490）', () => {
  // 平地中心落点：五层最大矩形（r≤37）全在图内（原版 InWorld 外沿门 :6320 同保证）
  const I = 210, J = 105;

  it('新实现 vs 原版序参照体：同流逐位全等（IoU=1.0、四通道零差）', () => {
    const hn = makeHost();                        // 新实现（实现内序=原版序）
    const hr = makeHost();                        // 参照体（C# 直译）——同种 LCG 流
    placeMeteor(hn, I, J);
    refMeteor(hr, hr.store, I, J, false);
    const r = compareBox(hn.store, hr.store, I, J);
    expect(r.mismatch).toBe(0);
    expect(r.iou).toBe(1);
  });

  it('旧形态（y 外 x 内 + ④⑤ active 门前置）vs 新实现：同种子逐位必异 + 跨种子分布等价', () => {
    // 同种子对拍：循环序翻正使掷→格分配错位 ⇒ 逐位必然不同（若逐位同=改动未生效,
    // 对拍失鉴别力）；且层①消耗掷数随顶切命中集变化 ⇒ 后层半径整层错位,单种子
    // IoU 无意义（实测 seed42 仅 0.50）——统计等价须跨种子看分布。
    const hn = makeHost();
    const ho = makeHost();
    placeMeteor(hn, I, J);
    refMeteor(ho, ho.store, I, J, true);
    expect(compareBox(hn.store, ho.store, I, J).mismatch).toBeGreaterThan(0);

    // 跨种子分布等价（N=40 配对种子,双独立样本）：矿量/中心空腔均值差 < 4×合并SE。
    // 真偏置（门序漏掷/半径档系统性漂移）会远超此界；掷流重排的零均值噪声不会。
    const N = 40;
    const stats = (legacy: boolean) => {
      const ore: number[] = [], cav: number[] = [];
      for (let s = 1; s <= N; s++) {
        const h = makeHost({ seed: s });
        if (legacy) refMeteor(h, h.store, I, J, true);
        else placeMeteor(h, I, J);
        const st = h.store;
        let o = 0, c = 0;
        for (let y = J - 40; y <= J + 40; y++) {
          for (let x = I - 40; x <= I + 40; x++) {
            const idx = st.idx(x, y);
            if (st.flags[idx] !== 0 && st.type[idx] === METEOR()) o++;
            else if (st.flags[idx] === 0 && Math.hypot(x - I, y - J) < 10) c++;
          }
        }
        ore.push(o); cav.push(c);
      }
      return { ore, cav };
    };
    const mean = (a: number[]) => a.reduce((p, q) => p + q, 0) / a.length;
    const se = (a: number[]) => {
      const m = mean(a);
      return Math.sqrt(a.reduce((p, q) => p + (q - m) ** 2, 0) / a.length / a.length);
    };
    const nu = stats(false), ol = stats(true);
    for (const [kNew, kOld] of [[nu.ore, ol.ore], [nu.cav, ol.cav]] as const) {
      const diff = Math.abs(mean(kNew) - mean(kOld));
      const bound = 4 * Math.hypot(se(kNew), se(kOld));
      expect(diff).toBeLessThan(Math.max(bound, 1e-9));
    }
  });
});
