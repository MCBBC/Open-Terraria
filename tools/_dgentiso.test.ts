// 一次性诊断（#32 Dungeon 入口主体终清）：▶Dungeon 时点态捕获 + dump031 隔离重放对拍 032。
//  · SW_DGCAP=1：全量跑到 ▶Dungeon，把 gs（v8 序列化）+ store 输入态 8ch 落 /tmp/dgcap/，
//    继续跑到 ▶MountainCaveOpenings 落 /tmp/js32.* 后中止（供坐标级对拍）。
//  · SW_DGREP=1：dump031 8ch（+dgcap 的 frameX/Y/wire/paint/liquidType）重建 store →
//    new RNG(gs.seed) → runDungeonPass → 与 /tmp/sw-slp/g/032 8ch 对拍：
//    通道计数 + 连通簇(bbox/pair) + SW_DGREP_MAP=x0:x1:y0:y1 逐格差图。
// 用法：cd game && SW_DGCAP=1 npx vitest run tools/_dgentiso.test.ts
//       cd game && SW_DGREP=1 [SW_DGREP_MAP=600:780:200:320] npx vitest run tools/_dgentiso.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { serialize as v8Serialize, deserialize as v8Deserialize } from 'node:v8';
import { generateWorld, lastGenState } from '../src/world/gen/WorldGen';
import { runDungeonPass } from '../src/world/gen/vanilla/DungeonPass';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG, UnifiedRandom } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';

const W = 4200, H = 1200, N = W * H;
const G2 = process.env.SW_DG_G2 ?? '/tmp/sw-slp/g';
const CAP = '/tmp/dgcap';
const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const REV = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (s !== undefined && !REV.has(s)) REV.set(s, i);
}
const le16 = (p: string): Uint16Array => {
  const b = readFileSync(p);
  return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1);
};
const TYPE_NAME: Record<number, string> = {
  0: '.', 41: 'B', 43: 'G', 44: 'P', 481: 'b', 482: 'g', 483: 'p',
  91: 'a', 240: 'H', 241: 'C', 242: 'W', 42: 'l', 19: 'f', 10: 'd',
  50: 'k', 101: 'K', 21: 'c', 467: 'C2', 87: 'x', 15: 'r', 14: 't',
  215: '#', 25: 'e', 48: 's', 136: 'S',
};

function cloneGs(gs: GenState): GenState {
  const c = { ...gs } as unknown as Record<string, unknown>;
  for (const k of Object.keys(c)) {
    const v = c[k];
    if (Array.isArray(v)) c[k] = v.map((e) => (e && typeof e === 'object' ? { ...(e as object) } : e));
    else if (v instanceof Int32Array) c[k] = v.slice();
    else if (v instanceof Float32Array) c[k] = v.slice();
    else if (v && typeof v === 'object') c[k] = { ...(v as Record<string, unknown>) };
  }
  return c as unknown as GenState;
}

// ================= Mode A：捕获 =================
if (process.env.SW_DGCAP === '1') {
  it('capture ▶Dungeon state + js32 end dump', async () => {
    mkdirSync(CAP, { recursive: true });
    let liveStore: TileStore | null = null;
    let capDone = false, endDone = false;
    const srcCache = new Map<string, string[]>();
    const labelOf = (file: string, line: number): string => {
      let src = srcCache.get(file);
      if (!src) { try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; } srcCache.set(file, src); }
      for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
        const m = src[l]!.match(/▶([^（(]+?)[（(\s]/);
        if (m) return m[1].trim();
      }
      return '';
    };
    class Ab extends Error { constructor(m: string) { super(m); } }
    const RNGp = RNG.prototype as unknown as Record<string, unknown>;
    const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
    RNGp.reseed = function (this: unknown, s: number) {
      const st = liveStore;
      if (st) {
        const stack = new Error().stack ?? '';
        for (const line of stack.split('\n')) {
          const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
          if (m && !m[1].includes('/core/rng') && !m[1].includes('_dgentiso')) {
            const lab = labelOf(m[1], Number(m[2]));
            if (lab === 'Dungeon' && !capDone) {
              capDone = true;
              writeFileSync(`${CAP}/gs.bin`, v8Serialize(cloneGs(lastGenState()!)));
              const wr = (name: string, a: Uint8Array | Uint16Array) => {
                const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
                writeFileSync(`${CAP}/${name}`, b.slice());
              };
              wr('in.type', st.type); wr('in.flags', st.flags); wr('in.wall', st.wall);
              wr('in.liquid', st.liquid); wr('in.liquidType', st.liquidType);
              wr('in.half', st.half); wr('in.slope', st.slope); wr('in.wire', st.wire);
              wr('in.paint', st.paint); wr('in.frameX', st.frameX); wr('in.frameY', st.frameY);
              console.log(`captured ▶Dungeon input state (${CAP}/gs.bin + in.*)`);
            } else if (lab === 'MountainCaveOpenings' && !endDone) {
              endDone = true;
              // js32 8ch（vanilla id 空间）
              const typ = new Uint16Array(N), act = new Uint8Array(N), lty = new Uint8Array(N), inact = new Uint8Array(N);
              for (let i = 0; i < N; i++) {
                typ[i] = SHEET[st.type[i]!] ?? (st.flags[i]! & 1 ? 0x7777 : 0);
                act[i] = st.flags[i]! & 1;
                lty[i] = st.liquid[i]! > 0 ? st.liquidType[i]! - 1 : 0;
                inact[i] = (st.wire[i]! >>> 5) & 1;
              }
              const wr = (name: string, a: Uint8Array | Uint16Array) => {
                const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
                writeFileSync(`/tmp/${name}`, b.slice());
              };
              wr('js32.typ', typ); wr('js32.act', act); wr('js32.wal', st.wall);
              wr('js32.liq', st.liquid); wr('js32.lty', lty);
              wr('js32.half', st.half); wr('js32.slope', st.slope); wr('js32.inact', inact);
              console.log('js32 dumped (8ch) — abort generation');
              throw new Ab('end');
            }
            break;
          }
        }
      }
      return oReseed.call(this, s);
    };
    const t0 = Date.now();
    try {
      await generateWorld({
        width: W, height: H, seedText: '9293480', evil: 0,
        onWorldPartial: (w) => { liveStore = w.store as never as TileStore; },
      });
    } catch (e) {
      const cause = (e as { cause?: unknown })?.cause;
      if (!(e instanceof Ab || cause instanceof Ab)) throw e;
    } finally { RNGp.reseed = oReseed; }
    console.log(`done ${((Date.now() - t0) / 1000).toFixed(0)}s cap=${capDone} end=${endDone}`);
  }, 900_000);
}

// ================= Mode B：隔离重放对拍 =================
if (process.env.SW_DGREP === '1') {
  it('isolated DungeonPass replay: dump031 in → cmp 032', () => {
    // dump031 8ch（Slush 末态 = Dungeon 输入）
    const pre = `${G2}/031_Slush`;
    const dTyp = le16(`${pre}.typ`), dAct = readFileSync(`${pre}.act`), dWal = le16(`${pre}.wal`);
    const dLiq = readFileSync(`${pre}.liq`), dHalf = readFileSync(`${pre}.half`), dSlope = readFileSync(`${pre}.slope`);
    const dLty = readFileSync(`${pre}.lty`), dIa = readFileSync(`${pre}.inact`);
    const capTyp = le16(`${CAP}/in.type`), capAct = readFileSync(`${CAP}/in.flags`);
    // 输入一致性：dgcap 捕获态 vs dump031（应全等）
    let inDiff = 0;
    for (let i = 0; i < N; i++) {
      if (dAct[i] !== (capAct[i]! & 1) || (dAct[i] ? dTyp[i] !== SHEET[capTyp[i]!]! : false)) { inDiff++; if (inDiff < 4) console.log(`  inDiff @(${i % W},${(i / W) | 0}) v=${dTyp[i]} j=${SHEET[capTyp[i]!]}`); }
    }
    console.log(`input consistency (act+typ): diff=${inDiff}`);
    // 重建 store：dump031 六通道 + dgcap 帧/线/漆/liquidType(+1 编码修正)
    const st = new TileStore(W, H);
    const capLty = readFileSync(`${CAP}/in.liquidType`);
    for (let i = 0; i < N; i++) {
      st.flags[i] = dAct[i] ? 1 : 0;
      st.type[i] = dAct[i] ? (REV.get(dTyp[i]!) ?? 0) : 0;
      st.wall[i] = dWal[i]!;
      st.liquid[i] = dLiq[i]!;
      st.liquidType[i] = dLiq[i]! > 0 ? dLty[i]! + 1 : 0;
      st.half[i] = dHalf[i]!;
      st.slope[i] = dSlope[i]!;
      void capLty;
    }
    // wire/paint/frames 借捕获态（dump 不含）
    st.wire.set(readFileSync(`${CAP}/in.wire`));
    st.paint.set(readFileSync(`${CAP}/in.paint`));
    st.frameX.set(le16(`${CAP}/in.frameX`));
    st.frameY.set(le16(`${CAP}/in.frameY`));
    const gs = v8Deserialize(readFileSync(`${CAP}/gs.bin`)) as GenState;
    const chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null>; locked?: boolean }> = [];
    const t0 = Date.now();
    // 逐段掷数 + 主流态指纹（DG_SEG_HASH 同构：SeedArray[56]+inext FNV-1a）
    let rolls = 0;
    const rng2 = new RNG(gs.seed);
    const rAny = rng2 as unknown as Record<string, unknown>;
    const oInt = rAny.int as (...a: number[]) => number;
    const oNextInt = rAny.nextInt as (...a: number[]) => number;
    const oNext = rAny.next as () => number;
    rAny.int = (...a: number[]) => { rolls++; return oInt.apply(rng2, a); };
    rAny.nextInt = (...a: number[]) => { rolls++; return oNextInt.apply(rng2, a); };
    rAny.next = (...a: number[]) => { rolls++; return oNext.apply(rng2, a); };
    const uRand = (rng2 as unknown as { vanilla: UnifiedRandom }).vanilla;
    const uAny = uRand as unknown as Record<string, unknown>;
    const oUNext = uAny.next as () => number;
    uAny.next = (..._a: unknown[]) => { rolls++; return oUNext.apply(uRand); };
    let bState: { sa: Int32Array; ix: number } | null = null;
    const fnvState = (sa: Int32Array, ix: number): number => {
      let fh = 0x811c9dc5;
      for (let q = 0; q < 56; q++) {
        const v = sa[q]! >>> 0;
        for (let s = 0; s < 32; s += 8) fh = Math.imul(fh ^ ((v >>> s) & 0xff), 16777619) >>> 0;
      }
      const u = ix >>> 0;
      for (let s = 0; s < 32; s += 8) fh = Math.imul(fh ^ ((u >>> s) & 0xff), 16777619) >>> 0;
      return fh >>> 0;
    };
    const snapFn = (name: string): void => {
      if (process.env.SW_DGREP_SEG) {
        const uS = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
        console.log(`DGFLOWSEC ${name} rolls=${rolls} fnv=${fnvState(uS.seedArray, uS.inext).toString(16).padStart(8, '0')}`);
      }
      if (name === 'dungeonB' && process.env.SW_DGREP_SCAN) {
        const ur0 = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
        bState = { sa: ur0.seedArray.slice(), ix: ur0.inext };
        console.log(`B-end FNV=${fnvState(bState.sa, bState.ix).toString(16)} (vanilla truth 8d169afd)`);
      }
      if (name === 'dungeonB' && process.env.SW_DGREP_PEEK) {
        const wr = (nm: string, a2: Uint8Array | Uint16Array) => {
          const b2 = Buffer.from(a2.buffer, a2.byteOffset, a2.byteLength);
          writeFileSync(`/tmp/dgcap/${nm}`, b2.slice());
        };
        wr('bEnd.wal', st.wall); wr('bEnd.flags', st.flags); wr('bEnd.type', st.type);
      }
      if (name === 'dungeonG' && process.env.SW_DGREP_PEEK) {
        const ur0g = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
        const saG = Buffer.alloc(56 * 4 + 4);
        for (let q = 0; q < 56; q++) saG.writeInt32LE(ur0g.seedArray[q]!, q * 4);
        saG.writeInt32LE(ur0g.inext, 56 * 4);
        writeFileSync('/tmp/dgcap/gEnd.state', saG);
      }
      if (process.env.SW_DGREP_PEEK_DONE) { /* noop */ }
      if (name === 'dungeonG' && process.env.SW_DGREP_PEEK) {
        // 对齐态后前 N 采样模拟（候选 T/L 推演 vanilla 首锚 (347,774)）
        const ur0 = (rng2 as unknown as { vanilla: { seedArray: Int32Array; inext: number } }).vanilla;
        const ur = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
        ur.seedArray.set(ur0.seedArray); ur.inext = ur0.inext;
        const wall2 = new Uint16Array(N), act2 = new Uint8Array(N);
        {
          const wsrc = le16('/tmp/dgcap/bEnd.wal'), fsrc = readFileSync('/tmp/dgcap/bEnd.flags'), tsrc = le16('/tmp/dgcap/bEnd.type');
          for (let i = 0; i < N; i++) { wall2[i] = wsrc[i]!; act2[i] = fsrc[i]! & 1; void tsrc; }
        }
        const DW = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
        const sims: Array<[string, number, number, number, number]> = [
          ['JS  113,195,693,920', 113, 195, 693, 920],
          ['T193', 113, 193, 693, 920],
          ['noInflate 138,220,668,895', 138, 220, 668, 895],
        ];
        for (const [nm, L, T, R, B] of sims) {
          const ur2 = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
          ur2.seedArray.set(ur.seedArray); ur2.inext = ur.inext;
          // 注意：peek 用的是 ur（已耗 2 掷）——此处应从未耗态起。重建:
          const urX = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
          urX.seedArray.set(ur0.seedArray); urX.inext = ur0.inext;
          const v1 = urX.next() * 4.656612875245797e-10, v2 = urX.next() * 4.656612875245797e-10;
          void v1; void v2;
          const uY = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
          uY.seedArray.set(ur0.seedArray); uY.inext = ur0.inext;
          let found = '';
          for (let k = 1; k <= 60 && !found; k++) {
            const sx = uY.next() * 4.656612875245797e-10, sy = uY.next() * 4.656612875245797e-10;
            const x = L + Math.trunc((R - L) * sx), y = T + Math.trunc((B - T) * sy);
            if (DW.has(wall2[y * W + x]!)) found = `#${k} (${x},${y})`;
          }
          console.log(`bnd ${nm}: first isDW sample = ${found}`);
        }
      }
      if ((name === 'dungeonB' || name === 'dungeonG') && process.env.SW_DGREP_G0) {
        // vanilla 0.92=B 末（G 入口）网格：VANG0；JS snap('dungeonB')=B 末、'dungeonG'=G 末
        const tag = name === 'dungeonB' ? 'B-end' : 'G-end';
        const bT = le16('/tmp/sw-dgs/VANG0.typ'), bA = readFileSync('/tmp/sw-dgs/VANG0.act');
        const bW = le16('/tmp/sw-dgs/VANG0.wal'), bL = readFileSync('/tmp/sw-dgs/VANG0.liq');
        let gA = 0, gT = 0, gW = 0, gL = 0;
        const cells: string[] = [];
        for (let i = 0; i < N; i++) {
          const va = bA[i]!, ja = st.flags[i]! & 1;
          const vt = va ? bT[i]! : 0, jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
          if (va !== ja) { gA++; if (cells.length < 30) cells.push(`(${i % W},${(i / W) | 0}) A v${va} j${ja}`); }
          if (vt !== jt) { gT++; if (cells.length < 30) cells.push(`(${i % W},${(i / W) | 0}) T v${vt} j${jt}`); }
          if (bW[i]! !== st.wall[i]!) { gW++; if (cells.length < 30) cells.push(`(${i % W},${(i / W) | 0}) W v${bW[i]} j${st.wall[i]}`); }
          if (bL[i]! !== st.liquid[i]!) { gL++; if (cells.length < 30) cells.push(`(${i % W},${(i / W) | 0}) L v${bL[i]} j${st.liquid[i]}`); }
        }
        console.log(`${tag} vs VANG0: A=${gA} T=${gT} W=${gW} L=${gL}`);
        for (const c of cells) console.log(`  ${c}`);
      }
    };
    runDungeonPass(st, rng2, gs, chests, snapFn);
    console.log(`replay done ${((Date.now() - t0) / 1000).toFixed(1)}s chests=${chests.length} rolls=${rolls}`);
    if (bState && process.env.SW_DGREP_SCAN) {
      // 从 B 末对齐态扫描 vanilla 真值段哈希位置（dgseg 段表 + pc.txt END f890f8a6）
      const targets = new Map<string, number>([
        ['a8c34b94', -1], ['68806871', -1], ['04ab3fad', -1],
        ['96049315', -1], ['3468c89e', -1], ['f890f8a6', -1],
      ]);
      const ur = new UnifiedRandom(0) as unknown as { seedArray: Int32Array; inext: number; next(): number };
      ur.seedArray.set(bState.sa); ur.inext = bState.ix;
      const LIM = Number(process.env.SW_DGREP_SCAN);
      for (let k = 1; k <= LIM; k++) {
        ur.next();
        const h = fnvState(ur.seedArray, ur.inext).toString(16);
        if (targets.has(h) && targets.get(h) === -1) {
          targets.set(h, k);
          console.log(`  stream hit ${h} @+${k} (B末后第 ${k} 掷)`);
        }
      }
      const seg: Array<[string, string]> = [['a8c34b94', 'G(0.935)'], ['68806871', 'T(0.95)'], ['04ab3fad', 'F(0.96)'],
        ['96049315', 'Pa(0.97)'], ['3468c89e', 'Ba(0.98)'], ['f890f8a6', 'END(0.99)']];
      for (const [h, nm] of seg) console.log(`  ${nm}: +${targets.get(h)}`);
    }
    // 对拍 032
    const pre2 = `${G2}/032_Dungeon`;
    const vT = le16(`${pre2}.typ`), vA = readFileSync(`${pre2}.act`), vW = le16(`${pre2}.wal`);
    const vL = readFileSync(`${pre2}.liq`), vHf = readFileSync(`${pre2}.half`), vSl = readFileSync(`${pre2}.slope`);
    const vLt = readFileSync(`${pre2}.lty`), vIa = readFileSync(`${pre2}.inact`);
    let dA = 0, dT = 0, dW = 0, dL = 0, dHf = 0, dSl = 0, dLt = 0, dIa2 = 0, firstI = -1;
    const pair = new Map<string, number>();
    const diffMask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const va = vA[i]!, ja = st.flags[i]! & 1;
      const vt = va ? vT[i]! : 0;
      const jt = ja ? (SHEET[st.type[i]!] >= 0 ? SHEET[st.type[i]!]! : 9999) : 0;
      const bad = va !== ja || vt !== jt || vW[i]! !== st.wall[i]! || vL[i]! !== st.liquid[i]!
        || vHf[i]! !== st.half[i]! || vSl[i]! !== st.slope[i]!
        || (vL[i]! > 0 ? vLt[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0)
        || (vIa[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1);
      if (!bad) continue;
      diffMask[i] = 1;
      if (firstI < 0) firstI = i;
      if (va !== ja) dA++;
      if (vt !== jt) { dT++; const k = `T${vt}>${jt}`; pair.set(k, (pair.get(k) ?? 0) + 1); }
      if (vW[i]! !== st.wall[i]!) dW++;
      if (vL[i]! !== st.liquid[i]!) dL++;
      if (vHf[i]! !== st.half[i]!) dHf++;
      if (vSl[i]! !== st.slope[i]!) dSl++;
      if ((vL[i]! > 0 ? vLt[i]! + 1 : 0) !== (st.liquid[i]! > 0 ? st.liquidType[i]! : 0)) dLt++;
      if ((vIa[i]! ? 1 : 0) !== ((st.wire[i]! >>> 5) & 1)) dIa2++;
    }
    console.log(`A=${dA} T=${dT} W=${dW} L=${dL} Hf=${dHf} Sl=${dSl} Lt=${dLt} Ia=${dIa2} first=(${firstI % W},${(firstI / W) | 0})`);
    console.log(`pairs: ${[...pair.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${k}×${n}`).join(' ')}`);
    // 连通簇（8 邻接）
    const clusters: Array<{ cells: number[]; x0: number; x1: number; y0: number; y1: number; pk: Map<string, number> }> = [];
    const seen = new Uint8Array(N);
    const queue = new Int32Array(N);
    for (let s = 0; s < N; s++) {
      if (!diffMask[s] || seen[s]) continue;
      let qh = 0, qt = 0;
      queue[qt++] = s; seen[s] = 1;
      const cl = { cells: [] as number[], x0: 1e9, x1: -1, y0: 1e9, y1: -1, pk: new Map<string, number>() };
      while (qh < qt) {
        const i = queue[qh++];
        const x = i % W, y = (i / W) | 0;
        cl.cells.push(i);
        if (x < cl.x0) cl.x0 = x; if (x > cl.x1) cl.x1 = x;
        if (y < cl.y0) cl.y0 = y; if (y > cl.y1) cl.y1 = y;
        const va = vA[i]!, vt = va ? vT[i]! : 0;
        const ja = st.flags[i]! & 1, jt = ja ? SHEET[st.type[i]!]! : 0;
        const k = `${TYPE_NAME[vt] ?? vt}${TYPE_NAME[jt] ?? jt}`;
        cl.pk.set(k, (cl.pk.get(k) ?? 0) + 1);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const j = ny * W + nx;
          if (diffMask[j] && !seen[j]) { seen[j] = 1; queue[qt++] = j; }
        }
      }
      clusters.push(cl);
    }
    clusters.sort((a, b) => b.cells.length - a.cells.length);
    console.log(`clusters=${clusters.length}；Top:`);
    if (process.env.SW_DGREP_BANDS) {
      const bandY = new Map<number, number>(), bandX = new Map<number, number>();
      for (let i = 0; i < N; i++) if (diffMask[i]) {
        const y = (i / W) | 0, x = i % W;
        const by = Math.floor(y / 20) * 20, bx = Math.floor(x / 50) * 50;
        bandY.set(by, (bandY.get(by) ?? 0) + 1);
        bandX.set(bx, (bandX.get(bx) ?? 0) + 1);
      }
      console.log(`y 带(20): ${[...bandY.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join(' ')}`);
      console.log(`x 带(50): ${[...bandX.entries()].sort((a, b) => a[0] - b[0]).map(([k, n]) => `${k}:${n}`).join(' ')}`);
    }
    for (const cl of clusters.slice(0, 14)) {
      const pks = [...cl.pk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k}:${n}`).join(' ');
      console.log(`  [${cl.x0}..${cl.x1}]x[${cl.y0}..${cl.y1}] n=${cl.cells.length} ${pks}`);
    }
    // 逐格差图（v=vanilla>js 字符 / j=js 错型：VvJ）
    const mapWin = process.env.SW_DGREP_MAP;
    if (mapWin) {
      const [mx0, mx1, my0, my1] = mapWin.split(':').map(Number);
      const ch = (i: number): string => {
        const va = vA[i]!, vt = va ? vT[i]! : 0;
        const ja = st.flags[i]! & 1, jt = ja ? SHEET[st.type[i]!]! : 0;
        return vt === jt && va === ja ? '.' : vt === 0 ? 'J' : jt === 0 ? 'V' : 'X';
      };
      console.log(`差图 x[${mx0},${mx1}) y[${my0},${my1})（J=js 多 V=vanilla 多 X=错型）`);
      for (let y = my0; y < my1; y++) {
        let row = '';
        for (let x = mx0; x < mx1; x++) row += ch(y * W + x);
        if (row.includes('J') || row.includes('V') || row.includes('X')) console.log(`${String(y).padStart(4)} ${row}`);
      }
      // 双侧类型对照（每行前 20 个非点格）
      console.log('—— 双侧类型（坐标 v/j）——');
      let cnt = 0;
      for (let y = my0; y < my1 && cnt < 60; y++) for (let x = mx0; x < mx1 && cnt < 60; x++) {
        const i = y * W + x;
        const c = ch(i);
        if (c !== '.') { console.log(`  (${x},${y}) v=${vA[i] ? vT[i] : 0}/${vW[i]} j=${st.flags[i]! & 1 ? SHEET[st.type[i]!]! : 0}/${st.wall[i]}`); cnt++; }
      }
    }
    void existsSync;
  }, 300_000);
}

if (process.env.SW_DGCAP !== '1' && process.env.SW_DGREP !== '1') {
  it.skip('env gate', () => {});
}
