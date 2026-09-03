// IIIII207 一次性定罪仪：tooeasy #105 T165 石笋重样式差（frx 帧维）锚格鉴别。
//   不改任何生产文件——只跑一遍 JS worldgen（seed tooeasy|20260911, evil0, startInHardmode,
//   4200×1200），抓槽末#57（Remove_Broken_Traps）/槽末#58（Final_Cleanup）两帧快照，
//   与 x86 dump（/tmp/iii199-out/tse199frx, IIII199 rig 帧维全档）做三方对账：
//   A) x86 侧 104→105 frx 变化的 T165 活格集（=x86 GERunner 级联重定型集）→ 邻域转化
//      覆盖率（验证「SquareTileFrame 级联触发」因果）
//   B) JS 侧同口径 57→58 frx 变化集（预期≈0 = JS GERunner 级联缺位）
//   C) 锚格鉴别：对每个 x86 重定型格按 CheckStalactite 形态取锚格，比对两代锚材质族
//      （同族=JS 域内可归零债；异族=带面差阴影，非 ShimmerPass 域）
//   D) 「锚已转化而帧冻结」普查（JS 侧预期>0 = 级联缺位直接证据；x86 侧预期≈0 = 对照）
// 用法：cd game && SW_I207=1 npx vitest run tools/_iii207stal.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I207 === '1';
const G2 = process.env.SW_I81_G2 ?? '/tmp/iii199-out/tse199frx';
const SEED = process.env.SW_I81_SEED ?? 'tooeasy|20260911';
const EVIL = process.env.SW_I81_EVIL !== undefined ? Number(process.env.SW_I81_EVIL) : 0;
const W = Number(process.env.SW_M8_W ?? 4200), H = Number(process.env.SW_M8_H ?? 1200), N = W * H;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
// Main.tileMoss（与 ShimmerPass MOSS_SHEETS 同表）
const MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
// GetDesiredStalagtiteStyle 锚材质族（sheet → style）
function anchorStyle(sh: number, wall62: boolean, num: number): number {
  if (sh === 1 || MOSS.has(sh)) return num === 3 && wall62 ? 11 : 0;
  switch (sh) {
    case 200: return 10;
    case 164: return 8;
    case 163: return 9;
    case 117: case 402: case 403: return 1;
    case 25: case 398: case 400: return 2;
    case 203: case 399: case 401: return 3;
    case 396: case 397: return 4;
    case 367: return 6;
    case 368: return 5;
    case 147: case 161: return 7;
  }
  if ((num === 0 || num === 1) && sh === 225) return 12;
  return -1; // fail
}
// frameX → style（GetStalagtiteStyle: frameX/54 桶）
const STYLE_BY_FX54: Record<number, number> = { 0: 7, 1: 0, 2: 11, 3: 12, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6, 10: 8, 11: 9, 12: 10 };
function styleOfFx(fx: number): number {
  if (fx === 65535) return -2;
  return STYLE_BY_FX54[Math.trunc(fx / 54)] ?? -1;
}
// CheckStalactite 形态 → 锚格偏移（相对被查格 j）与 num（双格垂挂=3 特判 wall62）
function anchorOf(fy: number, x: number, y: number): { dy: number; num: number } | null {
  if (fy === 72) return { dy: -1, num: 0 };
  if (fy === 90) return { dy: 1, num: 1 };
  if (fy >= 36) { const top = fy === 54 ? y - 1 : y; return { dy: top + 2 - y, num: 4 }; }
  const top = fy === 18 ? y - 1 : y;
  return { dy: top - 1 - y, num: 3 };
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));

interface Dump { t: Uint16Array; a: Uint8Array; frx: Uint16Array; fry: Uint16Array; }
function loadDump(name: string): Dump {
  const pre = `${G2}/${name}`;
  if (!existsSync(`${pre}.typ`) || !existsSync(`${pre}.frx`)) throw new Error(`缺 dump ${pre}`);
  return { t: le16(`${pre}.typ`), a: u8(`${pre}.act`), frx: le16(`${pre}.frx`), fry: le16(`${pre}.fry`) };
}

(RUN ? it : it.skip)('IIIII207 T165 restyle discriminator (tooeasy #105)', async () => {
  const d104 = loadDump('104_Remove_Broken_Traps');
  const d105 = loadDump('105_Final_Cleanup');
  // ── A) x86 重定型集 ──
  const conv: Set<number> = new Set();
  for (let i = 0; i < N; i++) {
    const c0 = d104.a[i] ? d104.t[i] : 0;
    const c1 = d105.a[i] ? d105.t[i] : 0;
    if (c0 !== c1) conv.add(i);
  }
  interface RCell { i: number; fx0: number; fx1: number; fy: number }
  const xrest: RCell[] = [];
  for (let i = 0; i < N; i++) {
    if (d104.a[i] === 1 && d105.a[i] === 1 && d104.t[i] === 165 && d105.t[i] === 165 && d104.frx[i] !== d105.frx[i]) {
      xrest.push({ i, fx0: d104.frx[i], fx1: d105.frx[i], fy: d105.fry[i] });
    }
  }
  let near = 0;
  for (const c of xrest) {
    const cx = c.i % W, cy = (c.i / W) | 0;
    let hit = false;
    for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (conv.has(ny * W + nx)) { hit = true; break; }
    }
    if (hit) near++;
  }
  console.log(`[A] x86 转化格=${conv.size}  x86 T165 重定型集=${xrest.length}  3×3 邻域有转化=${near} (${((near / xrest.length) * 100).toFixed(1)}%)`);

  // ── 跑 JS ──
  let js57: { frameX: Uint16Array; frameY: Uint16Array; type: Uint16Array; flags: Uint8Array; wall: Uint16Array } | null = null;
  let js58: typeof js57 = null;
  await generateWorld({
    width: W, height: H, seedText: SEED, evil: EVIL as 0,
    seedFlags: { startInHardmode: true },
    onWorldPartial: (w, i) => {
      if (i === 57 && !js57) js57 = w.store as never as typeof js57;
      if (i === 58 && !js58) js58 = w.store as never as typeof js58;
    },
  });
  if (!js57 || !js58) throw new Error('槽末快照缺失');
  const J = js58!; const J0 = js57!;
  // ── B) JS 57→58 T165 frx 变化集 ──
  let jrest = 0;
  const jrestSample: string[] = [];
  for (let i = 0; i < N; i++) {
    if (J0.flags[i] === 1 && J.flags[i] === 1 && SHEET[J0.type[i]] === 165 && SHEET[J.type[i]] === 165
      && J0.frameX[i] !== J.frameX[i]) {
      jrest++;
      if (jrestSample.length < 8) jrestSample.push(`(${i % W},${(i / W) | 0}) ${J0.frameX[i]}→${J.frameX[i]}`);
    }
  }
  console.log(`[B] JS T165 重定型集(57→58 frx 变化)=${jrest} ${jrestSample.join(' | ')}`);

  // ── C) 锚格鉴别（x86 重定型集逐格）──
  const pairCnt = new Map<string, number>();
  let agree = 0, disagree = 0, bad = 0;
  const agreeSamples: string[] = [];
  for (const c of xrest) {
    const x = c.i % W, y = (c.i / W) | 0;
    const a = anchorOf(c.fy, x, y);
    if (!a) { bad++; continue; }
    const ai = (y + a.dy) * W + x;
    const inb = x >= 0 && x < W && y + a.dy >= 0 && y + a.dy < H;
    const vSh = inb ? d105.t[ai] : -1;                       // x86 锚 sheet（裸 type，同 IIII54 口径）
    const jSh = inb ? SHEET[J.type[ai]] ?? -1 : -1;          // JS 锚 sheet（裸 type）
    const vSt = anchorStyle(vSh, false, a.num);
    const jSt = anchorStyle(jSh, false, a.num);
    const key = `v${vSh}(s${vSt})>j${jSh}(s${jSt})`;
    pairCnt.set(key, (pairCnt.get(key) ?? 0) + 1);
    if (vSt === jSt && vSt >= 0) {
      agree++;
      if (agreeSamples.length < 12) agreeSamples.push(`(${x},${y}) fy${c.fy} ${c.fx0}→${c.fx1} jfx=${J.frameX[c.i]} 锚v${vSh}/j${jSh}`);
    } else disagree++;
  }
  console.log(`[C] 锚同族(两代同 style)=${agree}  锚异族=${disagree}  形态异常=${bad}`);
  console.log(`    锚同族样本: ${agreeSamples.join(' | ')}`);
  const topPairs = [...pairCnt.entries()].sort((a2, b2) => b2[1] - a2[1]).slice(0, 14);
  for (const [k, n] of topPairs) console.log(`    ${k} ×${n}`);

  // ── D) 「锚已转化而帧冻结」普查（全 T165 活格,以 105 终态）──
  let jMiss = 0, vMiss = 0, jOk = 0, vOk = 0;
  for (let i = 0; i < N; i++) {
    if (d105.a[i] !== 1 || d105.t[i] !== 165) continue;
    if (J.flags[i] !== 1 || SHEET[J.type[i]] !== 165) continue;
    const x = i % W, y = (i / W) | 0;
    const fy = d105.fry[i];
    const a = anchorOf(fy, x, y);
    if (!a) continue;
    const ai = (y + a.dy) * W + x;
    if (x < 0 || x >= W || y + a.dy < 0 || y + a.dy >= H) continue;
    // x86 侧（wall62 特例忽略——style11 仅垂挂双格,用 fy<36 分支判）
    const vSh = d105.t[ai];
    const vSt = anchorStyle(vSh, false, a.num);
    if (vSt >= 0) { if (styleOfFx(d105.frx[i]) === vSt) vOk++; else vMiss++; }
    // JS 侧
    const jSh = SHEET[J.type[ai]] ?? -1;
    const jSt = anchorStyle(jSh, false, a.num);
    if (jSt >= 0) { if (styleOfFx(J.frameX[i]) === jSt) jOk++; else jMiss++; }
  }
  console.log(`[D] x86: 锚帧一致=${vOk} 锚帧失配=${vMiss}   JS: 锚帧一致=${jOk} 锚帧失配=${jMiss}`);
  console.log('done iii207stal');
}, 300000);
