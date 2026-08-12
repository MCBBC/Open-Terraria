// 原版 pass 28 "Underworld"（cs:13697-13918 普通世界分支）1:1。
// ①灰烬带+界下清空（★灰烬只写 type 不激活——原版语义，腔体保持空心）
// ②岩浆线 ③1/50 大灰烬丘陵 ④1/13 灰烬柱+横团+挖掘 ⑤随机小挖掘 ⑥底部岩浆层
// ⑦地狱石脉 ⑧外缘 17% 带灰烬草 633 + 1/3 灰烬树 634。
// Liquid.QuickWater(-2)（cs:13788）两侧一致省略（液体模拟子系统）；AddHellHouses
// 为独立槽（JS 管线在地狱 pass 之后，与原版 pass 内位置等价）。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { T, TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
import { growAshTree } from './TreePass';

const ASH = T.ASH;
const HELLSTONE = TILE_BY_KEY['ore_hellstone']!;
const ASH_GRASS = TILE_BY_KEY['v_633_ash_grass_block']!;

const winBuf: Record<string, string> = {};
const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;  // DBG 临时
export function __uwWinDump(): string {
  return ['p1','p2','p3','p4','p5','p6','p7'].map(k => k + ' ' + (winBuf[k] ?? '')).join('\n');
}
let pillarSeqJS = 0;
const pillarWinsJS: string[] = [];
export function __pillarWins(): string { return pillarWinsJS.slice(0, 40).map(x => x ?? '').join('\n'); }
export function runUnderworldPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  // ① 边界 + 灰烬带 + 界下清空
  let boundary = h - rng.int(150, 189);               // Next(150,190)
  const lavaSeed = h - rng.int(40, 69);               // Next(40,70)
  for (let x = 0; x < w; x++) {
    boundary += rng.int(-3, 3);                       // Next(-3,4)
    if (boundary < h - 190) boundary = h - 190;
    if (boundary > h - 160) boundary = h - 160;
    for (let y = boundary - 20 - rng.int(0, 2); y < h; y++) {   // Next(3)
      const i = st.idx(x, y);
      if (y >= boundary) {
        st.flags[i] = 0;                              // active(false)：type 保留（幽灵，原版语义）
        st.liquid[i] = 0; st.liquidType[i] = 0;
      } else {
        st.type[i] = ASH;                             // ★只写 type 不激活——腔体保持空心
      }
    }
  }
  console.log(`uwPhaseJS uwS1 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p1'] = w2; }
  // ② 岩浆线
  let lavaY = lavaSeed;
  for (let x = 10; x < w - 10; x++) {
    lavaY += rng.int(-10, 10);                        // Next(-10,11)
    if (lavaY > h - 60) lavaY = h - 60;
    if (lavaY < h - 100) lavaY = h - 120;
    for (let y = lavaY; y < h - 10; y++) {
      const i = st.idx(x, y);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  console.log(`uwPhaseJS uwS2 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p2'] = w2; }
  // ③ 1/50 列大灰烬丘陵
  for (let x = 0; x < w; x++) {
    if (rng.next() * 50 >= 1) continue;               // ≡ Next(50)==0
    let y = h - 65;
    while (!st.flags[st.idx(x, y)] && y > h - 135) y--;
    tileRunner(st, rng, gs, rng.int(0, w - 1), y + rng.int(20, 49), {
      strength: rng.int(15, 19), steps: 1000, type: ASH, addTile: true,
      speedX: 0, speedY: rng.int(1, 2), noYChange: true,
    });
  }
  console.log(`uwPhaseJS uwS3 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p3'] = w2; }
  // ④ 1/13 列灰烬柱 + 横向灰烬团 + 挖掘隧道
  for (let x = 0; x < w; x++) {
    if (rng.next() * 13 >= 1) continue;               // ≡ Next(13)==0
    let y = h - 65;
    while ((st.liquid[st.idx(x, y)] > 0 || st.flags[st.idx(x, y)]) && y > h - 140) y--;
    {
      const p1v = x, p2v = y - rng.int(2, 4), p3v = rng.int(5, 29), p4v = rng.int(1, 2);
      console.log(`pillarJS ${p1v},${p2v} s=${p3v} vy=${p4v} pre=${rng.vanilla.peek()}`);
      tileRunner(st, rng, gs, p1v, p2v, { strength: p3v, steps: 1000, type: ASH, addTile: true, speedX: 0, speedY: p4v, noYChange: true });
      console.log(`pillarDoneJS ${pillarSeqJS} post=${rng.vanilla.peek()}`);
      if (pillarSeqJS < 40) {
        let w3 = '';
        for (let y4 = 1045; y4 <= 1060; y4++) for (let x4 = 400; x4 <= 420; x4++) { const k4 = st.idx(x4, y4); w3 += String(st.flags[k4] ? V(st.type[k4]) : 0).padStart(3, ' '); }
        pillarWinsJS[pillarSeqJS] = `${p1v},${p2v} s=${p3v} vy=${p4v} | ` + w3;
      }
      pillarSeqJS++;
    }
    let scale = rng.int(1, 2);                        // Next(1,3)
    if (pillarSeqJS === 27) console.log(`r27JS scale=${scale}`);
    if (rng.next() * 3 < 1) scale *= 0.5;             // ≡ Next(3)==0
    if (rng.next() < 0.5) {                           // ≡ Next(2)==0
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
    {
      // Next(-10,10)×2 → 闭区间映射 int(-10,9)（曾误 int(-10,10)=Next(-10,11) 竖向差 1）
      const d1 = x + rng.int(-10, 9), d2 = y + rng.int(-10, 9), d3 = rng.int(5, 14), d4 = rng.int(5, 9), d5 = rng.int(-1, 2), d6 = rng.int(-1, 2);
      if (pillarSeqJS === 27) console.log(`r27JS dig1 ${d1},${d2} s=${d3} st=${d4} v=${d5},${d6} pre=${rng.vanilla.peek()}`);
      tileRunner(st, rng, gs, d1, d2, { strength: d3, steps: d4, type: -2, speedX: d5, speedY: d6 });
      if (pillarSeqJS === 27) {
        let w5 = '';
        for (let y5 = 1045; y5 <= 1060; y5++) for (let x5 = 400; x5 <= 420; x5++) { const k5 = st.idx(x5, y5); w5 += String(st.flags[k5] ? V(st.type[k5]) : 0).padStart(3, ' '); }
        console.log('r27JS digWin ' + w5);
      }
      if (pillarSeqJS === 27) console.log(`r27JS dig1Done post=${rng.vanilla.peek()}`);
    }
    if (rng.next() * 3 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-10, 9), y + rng.int(-10, 9), {
        strength: rng.int(10, 29), steps: rng.int(10, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
      if (pillarSeqJS === 27) {
        let w6 = '';
        for (let y6 = 1045; y6 <= 1060; y6++) for (let x6 = 400; x6 <= 420; x6++) { const k6 = st.idx(x6, y6); w6 += String(st.flags[k6] ? V(st.type[k6]) : 0).padStart(3, ' '); }
        console.log('r27JS dig2Win ' + w6);
      }
    }
    if (rng.next() * 5 < 1) {
      tileRunner(st, rng, gs, x + rng.int(-15, 14), y + rng.int(-15, 9), {
        strength: rng.int(15, 29), steps: rng.int(5, 19), type: -2,
        speedX: rng.int(-1, 2), speedY: rng.int(-1, 2),
      });
      if (pillarSeqJS === 27) {
        let w7 = '';
        for (let y7 = 1045; y7 <= 1060; y7++) for (let x7 = 400; x7 <= 420; x7++) { const k7 = st.idx(x7, y7); w7 += String(st.flags[k7] ? V(st.type[k7]) : 0).padStart(3, ' '); }
        console.log('r27JS dig3Win ' + w7);
      }
    }
  }
  console.log(`uwPhaseJS uwS4 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p4'] = w2; }
  // ⑤ 随机小挖掘（w 个）
  for (let n = 0; n < w; n++) {
    tileRunner(st, rng, gs, rng.int(20, w - 21), rng.int(h - 180, h - 11), {
      strength: rng.int(2, 6), steps: rng.int(2, 6), type: -2,
    });
  }
  console.log(`uwPhaseJS uwS5 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p5'] = w2; }
  // ⑥ 底部岩浆层（h-145/144 两行）
  for (let x = 0; x < w; x++) {
    for (const dy of [145, 144]) {
      const i = st.idx(x, h - dy);
      if (!st.flags[i]) { st.liquid[i] = 255; st.liquidType[i] = 2; }
    }
  }
  console.log(`uwPhaseJS uwS6 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p6'] = w2; }
  // ⑦ 地狱石脉（面积×0.0008）
  for (let n = 0, cnt = Math.trunc(w * h * 0.0008); n < cnt; n++) {
    tileRunner(st, rng, gs, rng.int(0, w - 1), rng.int(h - 140, h - 1), {
      strength: rng.int(2, 6), steps: rng.int(3, 6), type: HELLSTONE,
    });
  }
  console.log(`uwPhaseJS uwS7 peek=${rng.vanilla.peek()}`);
  { let w2 = ''; for (let y3 = 1045; y3 <= 1060; y3++) { for (let x3 = 400; x3 <= 420; x3++) { const k3 = st.idx(x3, y3); w2 += String(st.flags[k3] ? V(st.type[k3]) : 0).padStart(3, ' '); } } winBuf['p7'] = w2; }
  // ⑧ 灰烬草 633 + 灰烬树 634（cs:13869-13915）：外缘 17% 带
  const outer = (x: number) => x < w * 0.17 || x > w * 0.83;
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    const endY = h - 100 + rng.int(-1, 1);           // Next(-1,2) 逐列
    for (let y = h - 300; y < endY; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH || !st.flags[i]) continue;
      let exposed = false;
      for (let ox = -1; ox <= 1 && !exposed; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          if (!st.inBounds(x + ox, y + oy)) { exposed = true; break; }
          if (!st.flags[st.idx(x + ox, y + oy)]) { exposed = true; break; }
        }
      }
      if (exposed) st.type[i] = ASH_GRASS;           // 8 邻任一暴露（含界外）
    }
  }
  console.log(`uwPhaseJS uwS8 peek=${rng.vanilla.peek()}`);
  {
    const V = (t: number) => TILE_DEFS[t]?.vanilla?.sheet ?? 0;
    let out = '';
    for (let y2 = 1000; y2 <= 1100; y2++) out += `${y2}:${st.flags[st.idx(99, y2)] ? V(st.type[st.idx(99, y2)]) : 0},${st.flags[st.idx(98, y2)] ? V(st.type[st.idx(98, y2)]) : 0},${st.flags[st.idx(100, y2)] ? V(st.type[st.idx(100, y2)]) : 0} `;
    console.log('col99JS ' + out);
  }
  for (let x = 25; x < w - 25; x++) {
    if (!outer(x)) continue;
    for (let y = h - 200; y < h - 50; y++) {
      const i = st.idx(x, y);
      if (st.type[i] !== ASH_GRASS || !st.flags[i]) continue;
      if (y - 1 < 0 || st.flags[st.idx(x, y - 1)]) continue;
      if (rng.int(0, 2) === 0) growAshTree(st, rng, x, y);
    }
  }
  void gs;
}
