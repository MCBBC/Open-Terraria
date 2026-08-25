// QQQQ-REPLAY 回放台：dump051 装载 → 单跑 runBeachDecorPass → 对 dump052 逐格比对
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { RNG } from '../src/core/rng';
import { UnifiedRandom } from '../src/core/rng';
import { runBeachDecorPass } from '../src/world/gen/vanilla/BeachPass';

const RUN = process.env.SW_QQQR === '1';
const DIR = '/tmp/jjj-out/g1457-const';
const W = 4200, H = 1200, N = W * H;

(RUN ? it : it.skip)('qqqr replay beach decor', async () => {
  // 段标记消费（BeachPass segQ 探针）+ internalSample 计数
  const marks: string[] = [];
  let rollN = 0;
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (this: UnifiedRandom) => number;
  proto.internalSample = function (this: UnifiedRandom) {
    rollN++;
    return orig.call(this);
  };
  (globalThis as { __swSegQ?: unknown }).__swSegQ = (name: string, detail?: unknown) => {
    marks.push(`S ${name}${detail !== undefined ? JSON.stringify(detail) : ''}@${rollN}`);
  };
  try { await runBody(); } finally {
    delete (globalThis as { __swSegQ?: unknown }).__swSegQ;
    proto.internalSample = orig;
  }
  if (process.env.SW_QQQR_MARKS) for (const m of marks) console.log(m);

  async function runBody(): Promise<void> {
  const le16 = (p: string): Uint16Array => {
    const b = readFileSync(p);
    return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
  };
  const u8 = (p: string): Uint8Array => new Uint8Array(readFileSync(p));
  // sheet → JS type 反查
  const sheetToJs = new Int32Array(4096).fill(-1);
  for (let t = 0; t < TILE_DEFS.length; t++) {
    const s = TILE_DEFS[t]?.vanilla?.sheet;
    if (typeof s === 'number' && s >= 0 && s < 4096 && sheetToJs[s]! < 0) sheetToJs[s] = t;
  }
  const jsSheet = (t: number): number => (TILE_DEFS[t]?.vanilla?.sheet as number) ?? -1;
  const load = (idxName: string) => ({
    typ: le16(`${DIR}/${idxName}.typ`), act: u8(`${DIR}/${idxName}.act`),
    wal: le16(`${DIR}/${idxName}.wal`), liq: u8(`${DIR}/${idxName}.liq`),
    lty: u8(`${DIR}/${idxName}.lty`), hf: u8(`${DIR}/${idxName}.half`),
    sl: u8(`${DIR}/${idxName}.slope`), ia: u8(`${DIR}/${idxName}.inact`),
  });
  const A = load('051_Oasis');
  const B = load('052_Shell_Piles');
  const store = new TileStore(W, H);
  let unmapped = 0;
  for (let i = 0; i < N; i++) {
    const jt = sheetToJs[A.typ[i]!];
    if (A.typ[i]! > 0 && jt < 0) unmapped++;
    store.type[i] = jt >= 0 ? jt : 0;
    store.flags[i] = A.act[i]!;
    store.wall[i] = A.wal[i]!;
    store.liquid[i] = A.liq[i]!;
    store.liquidType[i] = A.liq[i]! > 0 ? A.lty[i]! + 1 : 0;
    store.half[i] = A.hf[i]!;
    store.slope[i] = A.sl[i]!;
    store.wire[i] = A.ia[i]! ? 32 : 0;
  }
  console.log(`unmapped sheets=${unmapped}`);
  const gs = {
    worldSurface: Number(process.env.SW_QQQR_WS ?? 337),
    shellStartXLeft: Number(process.env.SW_QQQR_SXL ?? 273),
    shellStartYLeft: Number(process.env.SW_QQQR_SYL ?? 229),
    shellStartXRight: Number(process.env.SW_QQQR_SXR ?? 3947),
    shellStartYRight: Number(process.env.SW_QQQR_SYR ?? 275),
    seedFlags: { theConstant: true },
  };
  const rng = new RNG(Number(process.env.SW_QQQR_SEED ?? 1321365005));
  // 写前快照（JS 侧行为集）
  const before = { typ: Int32Array.from(store.type), act: Uint8Array.from(store.flags) };
  runBeachDecorPass(store as never, rng, gs as never);
  // —— 逐通道对拍 dump052 ——
  const pairs = new Map<string, number>();
  let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dIa = 0;
  const firstCells: string[] = [];
  for (let i = 0; i < N; i++) {
    const va = B.act[i]!, ja = store.flags[i]! & 1;
    const vt = va ? B.typ[i]! : 0;
    const jt = ja ? (jsSheet(store.type[i]!) >= 0 ? jsSheet(store.type[i]!) : 9999) : 0;
    if (va !== ja || vt !== jt) {
      if (vt !== jt) dT++;
      if (va !== ja) dA++;
      const x = i % W, y = (i / W) | 0;
      if (firstCells.length < 60) firstCells.push(`(${x},${y}) v=${vt}/a${va} j=${jt}/a${ja}`);
      const k = `T${vt}>${jt}${va !== ja ? '+A' : ''}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
    if (B.wal[i]! !== store.wall[i]) { dW++; if (firstCells.length < 60) firstCells.push(`W(${i % W},${(i / W) | 0}) ${B.wal[i]}≠${store.wall[i]}`); }
    if (B.liq[i]! !== store.liquid[i]) { dL++; if (firstCells.length < 60) firstCells.push(`L(${i % W},${(i / W) | 0}) ${B.liq[i]}≠${store.liquid[i]}`); }
    if (B.hf[i]! !== store.half[i]) dHf++;
    if (B.sl[i]! !== store.slope[i]) dSl++;
    if ((B.ia[i]! ? 1 : 0) !== ((store.wire[i]! >>> 5) & 1)) dIa++;
  }
  console.log(`diff T=${dT} A=${dA} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Ia=${dIa}`);
  console.log(`pairs: ${[...pairs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k}×${n}`).join(' ')}`);
  for (const c of firstCells.slice(0, 40)) console.log('  ' + c);
  // —— ASCII 地图：v=vanilla 写(051→052 diff)，j=js 写(store 前后 diff) ——
  const vw = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (B.act[i] !== A.act[i] || B.typ[i] !== A.typ[i]) vw[i] = 1;
  }
  const map = (x0: number, x1: number, y0: number, y1: number) => {
    let head = '     ';
    for (let x = x0; x <= x1; x += 5) head += String(x).padEnd(5);
    console.log(head);
    for (let y = y0; y <= y1; y++) {
      let row = `${String(y).padStart(4)} `;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const v = vw[i] !== 0;
        const jt = store.type[i]!, ja = (store.flags[i]! & 1);
        const jChanged = jt !== before.typ[i] || ja !== (before.act[i]! & 1);
        const sh = jt >= 0 ? jsSheet(jt) : -1;
        let ch = '.';
        if (v && !jChanged) ch = 'V';
        else if (!v && jChanged) ch = ch === '.' ? 'j' : 'j';
        else if (v && jChanged) {
          ch = 'x';
          void sh;
        }
        row += ch;
      }
      console.log(row);
    }
  };
  if (process.env.SW_QQQR_MAP) {
    const [mx0, mx1, my0, my1] = process.env.SW_QQQR_MAP.split(',').map(Number);
    map(mx0!, mx1!, my0!, my1!);
  }
  // —— 写集平移相关性：JS 写集相对原版写集的最佳平移 ——
  {
    const van: number[] = [], jsW: number[] = [];
    for (let i = 0; i < N; i++) {
      const v = B.act[i] !== A.act[i] || B.typ[i] !== A.typ[i];
      const j = store.type[i] !== before.typ[i] || (store.flags[i]! & 1) !== (before.act[i]! & 1);
      if (v && !j) van.push(i);
      if (!v && j) jsW.push(i);
    }
    console.log(`vanOnly=${van.length} jsOnly=${jsW.length}`);
    let best = { s: -1, dx: 99, dy: 99 };
    const vanSet = new Set(van);
    for (let dy = -8; dy <= 8; dy++) for (let dx = -6; dx <= 6; dx++) {
      // 把 JS 写集平移 (dx,dy) 后与 vanOnly 的交
      let s = 0;
      for (const i of jsW) {
        const x = (i % W) + dx, y = ((i / W) | 0) + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (vanSet.has(y * W + x)) s++;
      }
      if (s > best.s) best = { s, dx, dy };
    }
    console.log(`best shift dx=${best.dx} dy=${best.dy} overlap=${best.s}/${jsW.length} jsWrites`);
  }
  // —— 按堆区域统计差异（marble 五堆 + shell 三堆）——
  const regions: Array<[string, number, number, number]> = [
    ['mp#0 2587', 2587, 319, 20], ['mp#1 478', 478, 239, 20], ['mp#2 407', 407, 262, 20],
    ['mp#4 2439', 2439, 308, 20], ['mp#5 2251', 2251, 309, 20], ['mp#8 1532', 1532, 260, 20],
    ['spL main', 267, 242, 26], ['spL c1', 251, 252, 26], ['spL c4', 145, 292, 26],
    ['spR?', 3940, 240, 60],
  ];
  for (const [nm, cx, cy, rr] of regions) {
    let vOnly = 0, jOnly = 0, both = 0, match = 0;
    for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      const v = B.act[i] !== A.act[i] || B.typ[i] !== A.typ[i];
      const j = store.type[i] !== before.typ[i] || (store.flags[i]! & 1) !== (before.act[i]! & 1);
      if (v && j) both++; else if (v) vOnly++; else if (j) jOnly++; else match++;
    }
    console.log(`${nm.padEnd(12)} vOnly=${String(vOnly).padStart(4)} jOnly=${String(jOnly).padStart(4)} both=${String(both).padStart(4)}`);
  }
  // —— mp#0 的 vOnly 明细 ——
  {
    const [cx, cy, rr] = [2587, 319, 20];
    console.log('mp#0 vOnly cells: (x,y) 051typ.act.half.slope.inact.wall -> 052typ.act');
    for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) {
      const i = y * W + x;
      const v = B.act[i] !== A.act[i] || B.typ[i] !== A.typ[i];
      const j = store.type[i] !== before.typ[i] || (store.flags[i]! & 1) !== (before.act[i]! & 1);
      if (v && !j) {
        const t1 = TILE_DEFS[sheetToJs[A.typ[i]!]]?.vanilla?.sheet;
        console.log(`  (${x},${y}) ${A.typ[i]}.${A.act[i]}.${A.hf[i]}.${A.sl[i]}.${A.ia[i]}.${A.wal[i]} -> ${B.typ[i]}.${B.act[i]} | jsNow typSheet=${t1} act=${store.flags[i] & 1}`);
      }
    }
  }
  }
}, 300_000);
