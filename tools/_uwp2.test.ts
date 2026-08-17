// 一次性诊断：#28 Underworld 隔离重放分检——y<1000 液体只有 QW 触及(后续段全在 y≥1020),
// 故终态 mid-world liq 差 = QuickWater 残差直接读数。输出:mid-world 差异坐标聚类、
// 每差异格的邻域状态(js vs v28)、岩浆/水归类,用于定位 QW 移植残差根因。
import { it } from 'vitest';
const RUN = !!process.env.SW_PARITY;
import { readFileSync } from 'node:fs';
import { runResetAndTerrain } from '../src/world/gen/WorldGen';
import { tileRunner } from '../src/world/gen/vanilla/TileRunner';
import { runHellFortPass } from '../src/world/gen/vanilla/HellFortPass';
import { growAshTree } from '../src/world/gen/vanilla/TreePass';
import { LiquidSim } from '../src/world/liquid/LiquidSim';
import { RNG } from '../src/core/rng';
import { T, TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import type { World } from '../src/world/World';

const VG = '/tmp/sw-num4/van_x86_g';
const W = 4200, H = 1200;
const load = (idx: number, ext: string, name: string) =>
  readFileSync(`${VG}/${String(idx).padStart(3, '0')}_${name}.${ext}`);
const t27 = new Uint16Array(load(27, 'typ', 'Webs').buffer.slice(0));
const a27 = load(27, 'act', 'Webs');
const w27 = new Uint16Array(load(27, 'wal', 'Webs').buffer.slice(0));
const l27 = load(27, 'liq', 'Webs');
const t28 = new Uint16Array(load(28, 'typ', 'Underworld').buffer.slice(0));
const a28 = load(28, 'act', 'Underworld');
const w28 = new Uint16Array(load(28, 'wal', 'Underworld').buffer.slice(0));
const l28 = load(28, 'liq', 'Underworld');

const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !REV.has(s)) REV.set(s, i);
}
const LIQTYPE27 = readFileSync('/tmp/sw-uw-liqtype.bin');

const mkStore = (): TileStore => {
  const st = new TileStore(W, H);
  for (let i = 0; i < W * H; i++) {
    st.type[i] = REV.get(t27[i]) ?? 0;
    st.flags[i] = a27[i] ? 1 : 0;
    st.wall[i] = w27[i];
    st.liquid[i] = l27[i];
    st.liquidType[i] = LIQTYPE27[i] ?? 1;
  }
  return st;
};

const ASH = T.ASH;

(RUN ? it : it.skip)('underworld QW midworld residual localization', () => {
  const rt = runResetAndTerrain({ width: W, height: H, seedText: '9293480', evil: 0 });
  const gs = rt.gs as GenState;
  console.log(`gs: waterLine=${gs.waterLine} lavaLine=${gs.lavaLine} rockLevel=${gs.rockLevel} worldSurface=${gs.worldSurface} h-200=${H - 200}`);
  const st = mkStore();
  const rng = new RNG(gs.seed);
  // S1
  let boundary = H - rng.int(150, 189);
  const lavaSeed = H - rng.int(40, 69);
  for (let x = 0; x < W; x++) {
    boundary += rng.int(-3, 3);
    if (boundary < H - 190) boundary = H - 190;
    if (boundary > H - 160) boundary = H - 160;
    for (let y = boundary - 20 - rng.int(0, 2); y < H; y++) {
      const i = st.idx(x, y);
      if (y >= boundary) { st.flags[i] = 0; st.liquid[i] = 0; st.liquidType[i] = 0; }
      else st.type[i] = ASH;
    }
  }
  // S2
  let lavaY = lavaSeed;
  for (let x = 10; x < W - 10; x++) {
    lavaY += rng.int(-10, 10);
    if (lavaY > H - 60) lavaY = H - 60;
    if (lavaY < H - 100) lavaY = H - 120;
    for (let y = lavaY; y < H - 10; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  // S3
  for (let x = 0; x < W; x++) {
    if (rng.next() * 50 >= 1) continue;
    let y = H - 65;
    while (!st.flags[st.idx(x, y)] && y > H - 135) y--;
    tileRunner(st, rng, gs, rng.int(0, W - 1), y + rng.int(20, 49), {
      strength: rng.int(15, 19), steps: 1000, type: ASH, addTile: true,
      speedX: 0, speedY: rng.int(1, 2), noYChange: true,
    });
  }
  // QW 前快照(=dump027 一致性自检:S1-S3 不应触碰 y<980)
  {
    let bad = 0;
    for (let i = 0; i < W * 980; i++) {
      if ((st.liquid[i]! !== 0 ? 1 : 0) !== (l27[i]! !== 0 ? 1 : 0)) bad++;
    }
    console.log(`S1-S3 对 y<980 液体有无改动格数(应=0): ${bad}`);
  }
  // QW 前保存 postS3 flags(S3 激活格 = S4/S5 dig-fill 潜在目标,深带过滤用)
  const postS3Flags = Uint8Array.from(st.flags);
  { // 列 3571 pre-QW 剖面(liq/act)
    const seg: string[] = [];
    for (let y = 935; y <= 1110; y++) {
      const i = y * W + 3571;
      seg.push(`${y}:${st.liquid[i]! > 0 ? 'L' + st.liquidType[i] : st.flags[i] ? '#' : '.'}`);
    }
    console.log('col3571 preQW:', seg.join(' '));
  }
  // QW
  {
    const sim = new LiquidSim({ store: st, seed: gs.seed } as unknown as World);
    sim.isGeneratingOrLoadingWorld = true;
    sim.generatingWorld = true;
    sim.genWaterLine = gs.waterLine;
    sim.quickWater();
    sim.dispose();
  }
  // mid-world(y<1000) 终态即 QW 态——与 dump028 对拍
  const diffs: Array<{ x: number; y: number; i: number }> = [];
  for (let y = 0; y < 1000; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (st.liquid[i] !== l28[i]) diffs.push({ x, y, i });
    }
  }
  console.log(`mid-world(y<1000) QW 残差 = ${diffs.length}`);
  // 聚类:按 x 百格桶
  const buckets = new Map<string, number>();
  for (const d of diffs) {
    const k = `x${(d.x / 100) | 0}00,y${(d.y / 100) | 0}00`;
    buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }
  console.log('聚类:', JSON.stringify([...buckets.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)));
  // 首批样本详查(含 4 邻)
  for (const d of diffs.slice(0, 8)) {
    const rows: string[] = [];
    for (let dy = -2; dy <= 2; dy++) {
      const r: string[] = [];
      for (let dx = -2; dx <= 2; dx++) {
        const xx = d.x + dx, yy = d.y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) { r.push('?????'); continue; }
        const i = yy * W + xx;
        // js liquid/type(l=amt,t=import type) vs v28 liquid, v27 liquid, wall
        r.push(`j${String(st.liquid[i]).padStart(3, ' ')}t${st.liquidType[i]}|2${String(l28[i]).padStart(3, ' ')}|7${String(l27[i]).padStart(3, ' ')}w${w27[i] === 187 || w27[i] === 216 ? 'D' : String(w27[i] === 0 ? '.' : 'w')}`);
      }
      rows.push(`y${d.y + dy}: ${r.join(' ')}`);
    }
    console.log(`--- diff @ (${d.x},${d.y}) a27=${a27[d.i]} a28=${a28[d.i]} t27=${t27[d.i]} t28=${t28[d.i]}`);
    console.log(rows.join('\n'));
  }
  // 残差方向统计
  let jsMore = 0, vanMore = 0;
  for (const d of diffs) { if (st.liquid[d.i]! > l28[d.i]!) jsMore++; else vanMore++; }
  console.log(`方向: js多=${jsMore} van多=${vanMore}`);
  // 与 dump027 对比:这些格在 027 的液体量(是否 vanilla 在 QW 中移走/移来)
  const kind = new Map<string, number>();
  for (const d of diffs) {
    const k = `js${st.liquid[d.i]}_v28_${l28[d.i]}_v27_${l27[d.i]}`;
    kind.set(k, (kind.get(k) ?? 0) + 1);
  }
  console.log('js/v28/v27 量组合 top:', JSON.stringify([...kind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
  // hell 带(y>=1000)液面顶直方图:QW 后 vs dump28(受 S4-S7/HF 影响列仅参考)
  {
    const topOf = (g: (i: number) => number, x: number): number => {
      for (let y = 1000; y < 1190; y++) if (g(y * W + x) > 0) return y;
      return -1;
    };
    let n = 0;
    const dh = new Map<number, number>();
    for (let x = 0; x < W; x++) {
      const j = topOf((i) => st.liquid[i]!, x), v = topOf((i) => l28[i]!, x);
      const d = j - v;
      dh.set(d, (dh.get(d) ?? 0) + 1);
      if (d !== 0) n++;
    }
    const entries = [...dh.entries()].filter(([d]) => d !== 0).sort((a, b) => b[1] - a[1]);
    console.log(`hell QW后液面顶差(非0列=${n}) top:`, JSON.stringify(entries.slice(0, 12)));
  }
  // (追加段)hell 带 QW 直检:y1000-1015 × 中段列(1050-3150)——HF 房(外缘25%带)不进,
  // S4 顶触~1029/S5 1020/S6 1055/S7 1060/树顶~1020 均不进;dump028 在此窗=vanilla QW 后态。
  {
    // 排除 dump028 中含 13/14 墙列(罕见高房)与 JS 侧含墙列
    const houseCol = new Uint8Array(W);
    for (let x = 0; x < W; x++) for (let y = 950; y < 1190; y++) {
      const i = y * W + x; if (w28[i] === 13 || w28[i] === 14) { houseCol[x] = 1; break; }
    }
    let diffs = 0, tot = 0; const ex: string[] = [];
    for (let y = 1000; y <= 1015; y++) {
      for (let x = 1050; x <= 3150; x++) {
        if (houseCol[x]) continue;
        const i = y * W + x;
        if (l27[i] === 0 && l28[i] === 0 && st.liquid[i] === 0) continue;
        tot++;
        if (st.liquid[i] !== l28[i]) {
          diffs++;
          if (ex.length < 6) ex.push(`(${x},${y}) js${st.liquid[i]}t${st.liquidType[i]} v28=${l28[i]} v27=${l27[i]} a27=${a27[i]}`);
        }
      }
    }
    console.log(`hell窗(y1000-1015×中段列, 排房列) QW残差 = ${diffs}/${tot} 湿格; 样本: ${ex.join(' | ')}`);
    // 对照:同窗 JS liquid vs dump027(S1 在 boundary>=1010 列会清液——先看 027 一致性)
    let d27 = 0;
    for (let y = 1000; y <= 1015; y++) for (let x = 1050; x <= 3150; x++) {
      if (houseCol[x]) continue;
      const i = y * W + x;
      if (l27[i] > 0) d27++;
    }
    console.log(`同窗 dump027 湿格数 = ${d27} (QW 前输入参考)`);
  }

  // (追加段2)深带 QW 直检:l28>0 且 a27=0(非 S5 可填格)且非 S6 行(1055/1056)且 y>=1016
  // → 这些格 vanilla 侧只可能由 QW 留下液体(post-QW 幸存者),JS post-QW 必须同量。
  {
    let bad = 0, tot = 0; const ex: string[] = [];
    const yB = new Map<number, number>();
    for (let y = 1016; y < H; y++) {
      if (y === 1055 || y === 1056) continue;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (l28[i] === 0 || postS3Flags[i] !== 0) continue;
        tot++;
        if (st.liquid[i] !== l28[i]) {
          bad++;
          const k = y; yB.set(k, (yB.get(k) ?? 0) + 1);
          if (ex.length < 10) ex.push(`(${x},${y}) js${st.liquid[i]}t${st.liquidType[i]} v28=${l28[i]} v27=${l27[i]} a28=${a28[i]}`);
        }
      }
    }
    console.log(`深带 QW 幸存者残差 = ${bad}/${tot}; 样本: ${ex.join(' | ')}`);
    console.log('y分布:', JSON.stringify([...yB.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
  }

  // (追加段3)最重差异列剖:y1035-1105 每格 js/v28/v27 液体量+活性
  {
    // 找差异最多的列
    const colDiff = new Map<number, number>();
    for (let y = 1016; y < H; y++) {
      if (y === 1055 || y === 1056) continue;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (l28[i] !== 0 && a27[i] === 0 && st.liquid[i] !== l28[i]) colDiff.set(x, (colDiff.get(x) ?? 0) + 1);
      }
    }
    const top = [...colDiff.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    console.log('最重差异列:', JSON.stringify(top));
    for (const [cx] of top) {
      const seg: string[] = [];
      for (let y = 1035; y <= 1105; y++) {
        const i = y * W + cx;
        const f = (l: number, a: number) => a ? '#' : String(Math.min(9, l === 0 ? 0 : l > 200 ? 9 : 1));
        seg.push(`${y}:${f(st.liquid[i]!, st.flags[i]!)}${f(l28[i]!, a28[i])}${f(l27[i]!, a27[i])}`);
      }
      console.log(`col${cx} 剖(js/v28/v27):`, seg.join(' '));
    }
  }

  // (追加段4)与原版 QW 后真值(/tmp/sw-uwp/qw.*,IL 探针直采)全通道对拍
  {
    const qliq = readFileSync('/tmp/sw-uwp/qw.liq');
    const qlty = readFileSync('/tmp/sw-uwp/qw.lty');
    const qact = readFileSync('/tmp/sw-uwp/qw.act');
    let dl = 0, dt = 0, da = 0, wet = 0;
    const dY = new Map<number, number>();
    const ex: string[] = [];
    for (let i = 0; i < W * H; i++) {
      const lSame = st.liquid[i] === qliq[i];
      if (qliq[i] > 0) wet++;
      if (!lSame) {
        dl++;
        const y = (i / W) | 0; dY.set(y, (dY.get(y) ?? 0) + 1);
        if (ex.length < 10) ex.push(`(${i % W},${y}) js${st.liquid[i]}t${st.liquidType[i]} van${qliq[i]}t${qlty[i] === 1 ? 2 : qlty[i] === 0 ? 1 : qlty[i]}`);
      }
      // 干格液体位也查(JS 应把搬走的格清 0)
      if (st.flags[i] !== ((qact[i] !== 0) ? 1 : 0) && i < W * 1200) da++;
    }
    console.log(`QW后 vs 原版真值: liq差=${dl}/${wet}湿格 act差=${da}`);
    console.log('y分布 top:', JSON.stringify([...dY.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)));
    console.log('样本:', ex.join(' | '));
  }

  // (追加段5)全槽跑完(S4-S8b+HF)后:房簇对比 JS vs dump28(连续 wall13/14 列段)
  {
    // 续跑 S4-S8b(与 UnderworldPass 同构)+ HF
    for (let x = 0; x < W; x++) {
      if (rng.next() * 13 >= 1) continue;
      let y = H - 65;
      while ((st.liquid[st.idx(x, y)] > 0 || st.flags[st.idx(x, y)]) && y > H - 140) y--;
      tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
        strength: rng.int(5, 29), steps: 1000, type: ASH, addTile: true,
        speedX: 0, speedY: rng.int(1, 2), noYChange: true,
      });
      let scale = rng.int(1, 2);
      if (rng.next() * 3 < 1) scale *= 0.5;
      if (rng.next() < 0.5) {
        tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
          strength: Math.trunc(rng.int(5, 14) * scale), steps: Math.trunc(rng.int(10, 14) * scale),
          type: ASH, addTile: true, speedX: 1, speedY: 0.3,
        });
      }
      if (rng.next() < 0.5) {
        const s2 = rng.int(1, 2);
        tileRunner(st, rng, gs, x, y - rng.int(2, 4), {
          strength: Math.trunc(rng.int(5, 14) * s2), steps: Math.trunc(rng.int(10, 14) * s2),
          type: ASH, addTile: true, speedX: -1, speedY: 0.3,
        });
      }
      tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
        strength: rng.int(5, 14), steps: rng.int(5, 9), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
      if (rng.next() * 3 < 1) {
        tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
          strength: rng.int(10, 29), steps: rng.int(10, 19), type: -2,
          speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
        });
      }
      if (rng.next() * 5 < 1) {
        tileRunner(st, rng, gs, x + rng.int(-15, 14), y + rng.int(-15, 9), {
          strength: rng.int(15, 29), steps: rng.int(5, 19), type: -2,
          speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
        });
      }
    }
    for (let n = 0; n < W; n++) {
      tileRunner(st, rng, gs, rng.int(20, W - 21), rng.int(H - 180, H - 11), {
        strength: rng.int(2, 6), steps: rng.int(2, 6), type: -2,
      });
    }
    for (let x = 0; x < W; x++) {
      for (const dy of [145, 144]) {
        const i = st.idx(x, H - dy);
        if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
      }
    }
    for (let n = 0, cnt = Math.trunc(W * H * 0.0008); n < cnt; n++) {
      tileRunner(st, rng, gs, rng.int(0, W - 1), rng.int(H - 140, H - 1), {
        strength: rng.int(2, 6), steps: rng.int(3, 6), type: TILE_BY_KEY['ore_hellstone']!,
      });
    }
    const outer = (x: number) => x < W * 0.17 || x > W * 0.83;
    for (let x = 25; x < W - 25; x++) {
      if (!outer(x)) continue;
      for (let y = H - 300; y < H - 100 + rng.int(-1, 1); y++) {
        const i = st.idx(x, y);
        if (st.type[i] !== ASH || !st.flags[i]) continue;
        let exposed = false;
        for (let ox = -1; ox <= 1 && !exposed; ox++) for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(x + ox, y + oy) || !st.flags[st.idx(x + ox, y + oy)]) { exposed = true; break; }
        }
        if (exposed) st.type[i] = TILE_BY_KEY['v_633_ash_grass_block']!;
      }
    }
    for (let x = 25; x < W - 25; x++) {
      if (!outer(x)) continue;
      for (let y = H - 200; y < H - 50; y++) {
        const i = st.idx(x, y);
        if (st.type[i] !== TILE_BY_KEY['v_633_ash_grass_block']! || !st.flags[i]) continue;
        if (st.flags[st.idx(x, y - 1)]) continue;
        if (rng.int(0, 2) === 0) growAshTree(st, rng, x, y);
      }
    }
    runHellFortPass(st, rng, gs);
    // 房簇统计:wall13/14 列连续段(段长>=4 视为房列段)
    const clusters = (getW: (i: number) => number): Array<[number, number]> => {
      const out: Array<[number, number]> = [];
      let start = -1;
      for (let x = 0; x <= W; x++) {
        let has = false;
        if (x < W) {
          for (let y = 950; y < 1190; y++) {
            const wv = getW(y * W + x);
            if (wv === 13 || wv === 14) { has = true; break; }
          }
        }
        if (has && start < 0) start = x;
        if (!has && start >= 0) { out.push([start, x - 1]); start = -1; }
      }
      return out;
    };
    const jc = clusters((i) => st.wall[i]!);
    const vc = clusters((i) => w28[i]!);
    console.log(`JS房列段(${jc.length}):`, JSON.stringify(jc.slice(0, 30)));
    console.log(`VAN房列段(${vc.length}):`, JSON.stringify(vc.slice(0, 30)));
    let matched = 0;
    for (const [a, b] of jc) if (vc.some(([c, d]) => Math.abs(a - c) <= 2 && Math.abs(b - d) <= 2)) matched++;
    console.log(`段匹配(JS≈VAN 容差2): ${matched}/${jc.length}`);
  }
}, 480000);
