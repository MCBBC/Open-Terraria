// IIII148a 一次性诊断（env 门控 SW_I148A=1，用毕可删）：
// carebears #40 Pyramids 残差定罪仪——JS 金字塔 pass 写前(▶Pyramids reseed)/写后
// (▶DirtRockWallRunner reseed) 双快照区域捕取，与 x86 dump 039→040 写集逐格对拍。
// 用法：cd game && SW_I148A=1 SW_I148_G2=/tmp/iii127-out/x86-thecarebearsmovie \
//         SW_I148_SEED='1.1.1.0.thecarebearsmovie|106102' npx vitest run tools/_iii148a.test.ts
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

// JS id ↔ sheet 换算（JS type 数组存本仓注册 id，非 vanilla sheet）
const JS_BRICK = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 151);   // 沙岩砖

const RUN = process.env.SW_I148A === '1';
const G2 = process.env.SW_I148_G2 ?? '';
const SEED = process.env.SW_I148_SEED ?? '0';
const W = 4200, H = 1200;
const X0 = 1400, X1 = 1960, Y0 = 240, Y6 = 620;   // 捕获窗口（金字塔 x[1584..1758] 外扩）

const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

type Snap = { typ: Uint16Array; act: Uint8Array; wal: Uint16Array; liq: Uint8Array; frx: Int16Array; fry: Int32Array };
function grab(store: Record<string, Uint16Array | Uint8Array | Int16Array | Int32Array>): Snap {
  const nw = X1 - X0, nh = Y6 - Y0;
  const typ = new Uint16Array(nw * nh), act = new Uint8Array(nw * nh), wal = new Uint16Array(nw * nh);
  const liq = new Uint8Array(nw * nh), frx = new Int16Array(nw * nh), fry = new Int32Array(nw * nh);
  const t = store.type as Uint16Array, f = store.flags as Uint8Array, wl = store.wall as Uint16Array;
  const lq = store.liquid as Uint8Array, fx = store.frameX as Int16Array, fy = store.frameY as Int32Array;
  for (let y = Y0; y < Y6; y++) {
    for (let x = X0; x < X1; x++) {
      const si = y * W + x, di = (y - Y0) * nw + (x - X0);
      typ[di] = t[si]!; act[di] = f[si]!; wal[di] = wl[si]!; liq[di] = lq[si]!;
      frx[di] = fx[si]!; fry[di] = fy[si]!;
    }
  }
  return { typ, act, wal, liq, frx, fry };
}

(RUN ? it : it.skip)('IIII148a pyramid write-set replay', async () => {
  const nw = X1 - X0, nh = Y6 - Y0;
  let pre: Snap | null = null;
  let post: Snap | null = null;
  let store: Parameters<typeof grab>[0] | null = null;
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    if (store) {
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng')) {
          const lab = labelOf(m[1], Number(m[2]));
          if (lab === 'Pyramids' && !pre) pre = grab(store);
          if (lab === 'DirtRockWallRunner' && !post) post = grab(store);
          break;
        }
      }
    }
    return oReseed.call(this, s);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1,
      onWorldPartial: (w) => {
        if (!store) store = (w.store as unknown) as Parameters<typeof grab>[0];
      },
    });
  } finally { RNGp.reseed = oReseed; }
  if (!pre || !post) { console.log(`[i148a] snapshots missing pre=${!!pre} post=${!!post}`); return; }

  // JS 写集分类
  const jsBrick: Array<[number, number]> = [], jsDeact: Array<[number, number]> = [], jsWall: Array<[number, number]> = [];
  for (let y = Y0; y < Y6; y++) {
    for (let x = X0; x < X1; x++) {
      const di = (y - Y0) * nw + (x - X0);
      const brickNow = post.act[di] === 1 && post.typ[di] === JS_BRICK;
      const brickPre = pre.act[di] === 1 && pre.typ[di] === JS_BRICK;
      if (brickNow && !brickPre) jsBrick.push([x, y]);
      if (pre.act[di] === 1 && post.act[di] === 0) jsDeact.push([x, y]);
      if (post.wal[di] === 34 && pre.wal[di] !== 34) jsWall.push([x, y]);
    }
  }
  console.log(`[i148a] JS brick=${jsBrick.length} deact=${jsDeact.length} wall34=${jsWall.length}`);
  bbox('JS brick', jsBrick); bbox('JS deact', jsDeact); bbox('JS wall34', jsWall);

  // x86 侧同区域
  const r16 = (p: string) => new Uint16Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength / 2);
  const r8 = (p: string) => new Uint8Array(readFileSync(p));
  const load = (idx: number, nm: string) => ({
    typ: r16(`${G2}/${String(idx).padStart(3, '0')}_${nm}.typ`),
    act: r8(`${G2}/${String(idx).padStart(3, '0')}_${nm}.act`),
    wal: r16(`${G2}/${String(idx).padStart(3, '0')}_${nm}.wal`),
  });
  const v39 = load(39, 'Clean_Up_Dirt'), v40 = load(40, 'Pyramids');
  const xBrick: Array<[number, number]> = [], xDeact: Array<[number, number]> = [], xWall: Array<[number, number]> = [];
  for (let y = Y0; y < Y6; y++) {
    for (let x = X0; x < X1; x++) {
      const si = y * W + x;
      if ((v40.act[si]! & 1) === 1 && v40.typ[si] === 151 && !((v39.act[si]! & 1) === 1 && v39.typ[si] === 151)) xBrick.push([x, y]);
      if ((v39.act[si]! & 1) === 1 && (v40.act[si]! & 1) === 0) xDeact.push([x, y]);
      if (v40.wal[si] === 34 && v39.wal[si] !== 34) xWall.push([x, y]);
    }
  }
  console.log(`[i148a] x86 brick=${xBrick.length} deact=${xDeact.length} wall34=${xWall.length}`);
  bbox('x86 brick', xBrick); bbox('x86 deact', xDeact); bbox('x86 wall34', xWall);

  // 逐格差：写集对称差采样
  const key = (x: number, y: number) => `${x},${y}`;
  const jsB = new Set(jsBrick.map(([x, y]) => key(x, y)));
  const xB = new Set(xBrick.map(([x, y]) => key(x, y)));
  const jsD = new Set(jsDeact.map(([x, y]) => key(x, y)));
  const xD = new Set(xDeact.map(([x, y]) => key(x, y)));
  const jsW = new Set(jsWall.map(([x, y]) => key(x, y)));
  const xW = new Set(xWall.map(([x, y]) => key(x, y)));
  const only = (a: Set<string>, b: Set<string>, nm: string, cap = 40) => {
    const diff: string[] = [];
    for (const k of a) if (!b.has(k)) { diff.push(k); if (diff.length >= cap) break; }
    console.log(`[i148a] ${nm}: ${a.size - a.size + [...a].filter((k) => !b.has(k)).length} cells, sample: ${diff.join(' | ')}`);
  };
  only(jsB, xB, 'brick JS-only(x86未写砖)');
  only(xB, jsB, 'brick x86-only(JS未写砖)');
  only(jsD, xD, 'deact JS-only');
  only(xD, jsD, 'deact x86-only');
  only(jsW, xW, 'wall34 JS-only');
  only(xW, jsW, 'wall34 x86-only');

  // 行级去活路径对照（每 2 行打印两侧 deact 列段）
  const rowOf = (set: Set<string>, y: number): string => {
    const cols: number[] = [];
    for (let x = X0; x < X1; x++) if (set.has(key(x, y))) cols.push(x);
    const comp: Array<[number, number]> = [];
    for (const x of cols) {
      if (comp.length && x === comp[comp.length - 1]![1] + 1) comp[comp.length - 1]![1] = x;
      else comp.push([x, x]);
    }
    return comp.map(([a, b]) => (a === b ? `${a}` : `${a}..${b}`)).join(' ') || '(无)';
  };
  for (let y = 300; y <= 420; y += 2) {
    const a = rowOf(jsD, y), b = rowOf(xD, y);
    if (a !== b) console.log(`[i148a] y=${y} JS: ${a}\n[i148a]       x86: ${b}`);
  }
}, 600000);

const SHEET151 = 151;
function bbox(nm: string, cells: Array<[number, number]>): void {
  if (cells.length === 0) { console.log(`[i148a] ${nm}: (empty)`); return; }
  const xs = cells.map((c) => c[0])!, ys = cells.map((c) => c[1])!;
  console.log(`[i148a] ${nm}: x[${Math.min(...xs)}..${Math.max(...xs)}] y[${Math.min(...ys)}..${Math.max(...ys)}]`);
}
