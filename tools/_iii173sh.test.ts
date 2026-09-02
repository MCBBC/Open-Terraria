// IIIII173：GFB #38 Shimmer（微光带）定域仪。
// 三路取证（logging-only，零主路径改动）：
//   A · 掷窗账——__swOnRoll 织入，逐槽 RollCount+RollHash（x86 rig JJHook pc 同式），
//       与 ~/GoldenChains/golden-gfb-c/pc.txt 的 P|36/P|37/P|38 R:count:hash 对拍；
//       另落槽5/槽6 窗内样本流（/tmp/iii173-out/js-win5.txt / js-win6.txt）。
//   B · 快照对拍——槽5 末（=x86 037_Create_Ocean_Caves）与槽6 末（=038_Shimmer）
//       8 通道逐格对拍（mile8 同口径），输出 Row。
//   C · 写面分解——x86 写面(037→038) vs JS 写面(pre→post) 四分类
//       both-same / both-diff / x86-only / js-only，逐通道 bbox + 网格分布。
// 用法：cd game && SW_I173=1 SW_I173_G2=~/GoldenChains/golden-gfb-c \
//        SW_I173_OUT=/tmp/iii173-out npx vitest run tools/_iii173sh.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I173 === '1';
const G2 = process.env.SW_I173_G2 ?? '';
const OUT = process.env.SW_I173_OUT ?? '/tmp/iii173-out';
const SEED = '9293480';
const EVIL = 0;
const W = 4200, H = 1200, N = W * H;
const FLAGS: Record<string, boolean> = {};
for (const f of 'everything,remix,drunkWorld,notTheBees,noTraps,theConstant,tenthAnniversary,getGoodWorld'.split(',')) FLAGS[f] = true;

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const u8 = (p: string): Uint8Array => readFileSync(p);
const fnv = (data: Uint8Array | number[]): number => {
  let h = 2166136261 >>> 0;
  for (let k = 0; k < data.length; k++) {
    h = (Math.imul(h ^ (data[k]! & 0xff), 16777619)) >>> 0;
  }
  return h >>> 0;
};

interface Ch { t: Uint16Array; a: Uint8Array; w: Uint16Array; l: Uint8Array; hf: Uint8Array; sl: Uint8Array; lt: Uint8Array; ia: Uint8Array }
function golden(pre: string): Ch {
  return {
    t: le16(`${pre}.typ`), a: u8(`${pre}.act`), w: le16(`${pre}.wal`), l: u8(`${pre}.liq`),
    hf: u8(`${pre}.half`), sl: u8(`${pre}.slope`), lt: u8(`${pre}.lty`), ia: u8(`${pre}.inact`),
  };
}

/** JS store 快照（有效值口径同 mile8：act→typ，sheet 映射）+ 原始通道 */
interface Snap {
  eff: Uint16Array;   // effective tile (act ? sheet : 0)，x86 同口径
  act: Uint8Array;
  wal: Uint16Array;
  liq: Uint8Array;
  ltyEff: Uint8Array; // vanilla 基液型（JS+1 基 → -1），liquid==0 → 0
}
function snap(store: {
  type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array;
  liquidType: Uint8Array;
}): Snap {
  const eff = new Uint16Array(N), act = new Uint8Array(N), wal = new Uint16Array(N),
    liq = new Uint8Array(N), ltyEff = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const a = store.flags[i]! & 1;
    act[i] = a;
    eff[i] = a ? (SHEET[store.type[i]!] >= 0 ? SHEET[store.type[i]!]! : 9999) : 0;
    wal[i] = store.wall[i]!;
    liq[i] = store.liquid[i]!;
    ltyEff[i] = store.liquid[i]! > 0 ? (store.liquidType[i]! - 1) : 0;
  }
  return { eff, act, wal, liq, ltyEff };
}

const x86pc: string[] = existsSync(`${G2}/pc.txt`) ? readFileSync(`${G2}/pc.txt`, 'utf8').split('\n') : [];
function x86R(idx: number): { cnt: number; hash: number } | null {
  for (const ln of x86pc) {
    const m = ln.match(new RegExp(`^P\\|${idx}\\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]+\\|[^|]+\\|R:(\\d+):(\\d+)$`));
    if (m) return { cnt: Number(m[1]), hash: Number(m[2]) >>> 0 };
  }
  return null;
}

(RUN ? it : it.skip)('IIIII173 shimmer write-face + roll-window probe', { timeout: 1_200_000 }, async () => {
  // ── 掷窗账（A）──
  let winCnt = 0, winHash = 2166136261 >>> 0;
  let capture = false;         // 槽5/槽6 窗内样本流
  const winVals: number[][] = [];
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v) => {
    winCnt++;
    winHash = (Math.imul(winHash ^ (v >>> 0), 16777619)) >>> 0;
    if (capture) winVals[winVals.length - 1]!.push(v);
  };
  const wins: Array<{ slot: number; name: string; cnt: number; hash: number }> = [];
  const snaps: Record<number, Snap> = {};
  let curSlot = -1;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: (w, i) => {
        // 窗封口：i 号槽的掷 = 上次边界以来累计
        wins.push({ slot: i, name: String(i), cnt: winCnt, hash: winHash });
        winCnt = 0; winHash = 2166136261 >>> 0;
        // 快照：槽5 末 + 槽6 末
        if (i === 5 || i === 6) {
          snaps[i] = snap(w.store as never as Parameters<typeof snap>[0]);
          console.log(`[i173] snapshot slot${i} done (win cnt=${wins[wins.length - 1]!.cnt} hash=${wins[wins.length - 1]!.hash})`);
        }
        // 样本流捕获窗：槽5 开始前(即槽4 封口后)开，槽6 封口关
        if (i === 4) { capture = true; winVals.push([]); }
        if (i === 5) { winVals.push([]); }
        if (i === 6) { capture = false; }
        curSlot = i;
      },
    });
  } finally {
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
  }
  void curSlot;

  // ── A：掷窗对拍 ──
  console.log('\n=== A · 掷窗对拍（x86 pc P|36..P|38） ===');
  for (const idx of [36, 37, 38]) {
    const r = x86R(idx);
    console.log(`x86 P|${idx} R=${r ? `${r.cnt}:${r.hash}` : '(none)'}`);
  }
  const w5 = wins.find((x) => x.slot === 5), w6 = wins.find((x) => x.slot === 6);
  console.log(`JS slot5(引力沙=GravSand+OceanCaves) win cnt=${w5?.cnt} hash=${(w6?.hash ?? 0) === 0 ? w5?.hash : w5?.hash}`);
  console.log(`JS slot6(微光=Shimmer)              win cnt=${w6?.cnt} hash=${w6?.hash}`);
  if (w6) {
    const r38 = x86R(38);
    console.log(`slot6 cnt match: ${w6.cnt === r38?.cnt} (Δ=${w6.cnt - (r38?.cnt ?? 0)})  hash match: ${w6.hash === r38?.hash}`);
  }
  const r36 = x86R(36), r37 = x86R(37);
  if (w5 && r36 && r37) {
    console.log(`slot5 cnt vs (P36+P37)=${r36.cnt + r37.cnt} Δ=${w5.cnt - (r36.cnt + r37.cnt)}`);
  }
  writeFileSync(`${OUT}/js-win5.txt`, winVals[0]?.join('\n') ?? '');
  writeFileSync(`${OUT}/js-win6.txt`, winVals[1]?.join('\n') ?? '');
  writeFileSync(`${OUT}/js-windows.json`, JSON.stringify({ wins, x86: { p36: r36, p37: r37, p38: x86R(38) } }));

  const pre = snaps[5], post = snaps[6];
  if (!pre || !post) throw new Error('snapshots missing');
  const g37 = golden(`${G2}/037_Create_Ocean_Caves`);
  const g38 = golden(`${G2}/038_Shimmer`);

  // ── B：快照对拍 ──
  const cmp = (tag: string, js: Snap, x86: Ch): { dA: number; dT: number; dW: number; dL: number; dLt: number; first: string } => {
    let dA = 0, dT = 0, dW = 0, dL = 0, dLt = 0, first = -1;
    for (let i = 0; i < N; i++) {
      if (x86.a[i] !== js.act[i]) { dA++; if (first < 0) first = i; }
      if (x86.t[i] !== js.eff[i]) { dT++; if (first < 0) first = i; }
      if (x86.w[i] !== js.wal[i]) { dW++; if (first < 0) first = i; }
      if (x86.l[i] !== js.liq[i]) { dL++; if (first < 0) first = i; }
      const vl = x86.l[i]! > 0 ? x86.lt[i]! + 1 : 0;
      const jl = js.liq[i]! > 0 ? js.ltyEff[i]! + 1 : 0;
      if (vl !== jl) { dLt++; if (first < 0) first = i; }
    }
    const fl = first >= 0 ? `(${first % W},${Math.floor(first / W)})` : '';
    console.log(`${tag}: A=${dA} T=${dT} W=${dW} L=${dL} Lt=${dLt} first=${fl}`);
    return { dA, dT, dW, dL, dLt, first: fl };
  };
  console.log('\n=== B · 快照对拍 ===');
  const rPre = cmp('JS槽5末 vs x86#037(绿带哨兵)', pre, g37);
  const rPost = cmp('JS槽6末 vs x86#038(本批靶)  ', post, g38);
  writeFileSync(`${OUT}/js-compare.json`, JSON.stringify({ pre: rPre, post: rPost }));

  // ── C：写面分解（有效 tile 值口径） ──
  console.log('\n=== C · 写面分解 ===');
  const cat: Record<string, number> = { 'both-same': 0, 'both-diff': 0, 'x86-only': 0, 'js-only': 0 };
  const bbox: Record<string, [number, number, number, number]> = {};
  const touch = (k: string, x: number, y: number) => {
    const b = bbox[k];
    if (!b) { bbox[k] = [x, y, x, y]; return; }
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  };
  // 差值签名对（x86 后值>JS 后值）计数
  const pairs = new Map<string, number>();
  const preMask = new Uint8Array(N), postMask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x86w = g37.t[i] !== g38.t[i] || g37.a[i] !== g38.a[i] || g37.l[i] !== g38.l[i];
    const jsw = pre.eff[i] !== post.eff[i] || pre.act[i] !== post.act[i] || pre.liq[i] !== post.liq[i];
    if (x86w && jsw) {
      const same = g38.t[i] === post.eff[i] && g38.a[i] === post.act[i] && g38.l[i] === post.liq[i];
      cat[same ? 'both-same' : 'both-diff']++;
      touch(same ? 'both-same' : 'both-diff', i % W, Math.floor(i / W));
    } else if (x86w) { cat['x86-only']++; touch('x86-only', i % W, Math.floor(i / W)); }
    else if (jsw) { cat['js-only']++; touch('js-only', i % W, Math.floor(i / W)); }
    if (g38.t[i] !== post.eff[i] || g38.a[i] !== post.act[i]) {
      const k = `T${g38.t[i]}>${post.eff[i]}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    preMask[i] = jsw ? 1 : 0;
    postMask[i] = x86w ? 1 : 0;
  }
  console.log('写面四分类:', JSON.stringify(cat));
  for (const [k, b] of Object.entries(bbox)) console.log(`  ${k}: bbox=(${b[0]},${b[1]})..(${b[2]},${b[3]})`);
  console.log('终值 pair 榜:', [...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' '));
  // 写面通道分解（x86 侧）
  const chStat = (nm: string, f: (i: number) => boolean) => {
    let c = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let i = 0; i < N; i++) if (f(i)) { c++; const x = i % W, y = Math.floor(i / W); if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; }
    console.log(`  x86 写面[${nm}]: ${c} 格 bbox=(${minx},${miny})..(${maxx},${maxy})`);
    return c;
  };
  chStat('typ', (i) => g37.t[i] !== g38.t[i]);
  chStat('act', (i) => g37.a[i] !== g38.a[i]);
  chStat('liq', (i) => g37.l[i] !== g38.l[i]);
  chStat('wal', (i) => g37.w[i] !== g38.w[i]);
  chStat('lt', (i) => g37.lt[i] !== g38.lt[i]);
  chStat('half', (i) => g37.hf[i] !== g38.hf[i]);
  chStat('slope', (i) => g37.sl[i] !== g38.sl[i]);
  // JS 侧
  const chStatJs = (nm: string, f: (i: number) => boolean) => {
    let c = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let i = 0; i < N; i++) if (f(i)) { c++; const x = i % W, y = Math.floor(i / W); if (x < minx) minx = x; if (y < miny) miny = y; if (x > maxx) maxx = x; if (y > maxy) maxy = y; }
    console.log(`  JS  写面[${nm}]: ${c} 格 bbox=(${minx},${miny})..(${maxx},${maxy})`);
    return c;
  };
  chStatJs('eff', (i) => pre.eff[i] !== post.eff[i]);
  chStatJs('act', (i) => pre.act[i] !== post.act[i]);
  chStatJs('liq', (i) => pre.liq[i] !== post.liq[i]);
  chStatJs('wal', (i) => pre.wal[i] !== post.wal[i]);
  chStatJs('lty', (i) => pre.ltyEff[i] !== post.ltyEff[i]);
  writeFileSync(`${OUT}/writeface-js.bin`, Buffer.from(preMask));
  writeFileSync(`${OUT}/writeface-x86.bin`, Buffer.from(postMask));
  console.log('\n[i173] dumps: js-win5/js-win6/js-windows.json/js-compare.json/writeface-*.bin');
});
