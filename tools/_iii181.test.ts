// IIIII181 v2：GFB #53 Smooth_World 收口仪（LXIX 章）。
// v2 修正：①窗长用窗口域计数（v1 误用全局 cnt）②cntA/cntB 全量逐格入口计数落盘
// ③js052/053 加 ghost 通道（非活性残留 type）④PlaceTile 角块普查（__swSWAct）。
// 对拍基准：x86 rig181 rollwin(P|53 R=5,069,393=体掷5,069,392+尾1)。
// 解析式：x86 loop A 总掷 = 5,069,392 − 4,825,600(loop B 门掷,1/格) = 243,792 →
//   A86=243,792;JS 侧 A_js = cntB(20,20)−cnt0;δ = A_js − A86 = loop A 掷数漂移。
// 用法：cd game && SW_I181=1 SW_I181_G2=~/GoldenChains/golden-gfb-c \
//        SW_I181_OUT=/tmp/iii181-out npx vitest run tools/_iii181.test.ts
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { RNG, UnifiedRandom } from '../src/core/rng';

const RUN = process.env.SW_I181 === '1';
const G2 = process.env.SW_I181_G2 ?? `${process.env.HOME}/GoldenChains/golden-gfb-c`;
const OUT = process.env.SW_I181_OUT ?? '/tmp/iii181-out';
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
const cntA = new Int32Array(N).fill(-1);
const cntB = new Int32Array(N).fill(-1);

(RUN ? it : it.skip)('IIIII181 smooth-world window v3 (instance-filtered)', { timeout: 1_800_000 }, async () => {
  let cnt = 0;              // 全局(含外来)
  let mainCnt = 0;          // 仅主流实例(reseed 后最新 UnifiedRandom)
  let capture = false;
  let cnt0 = -1;            // 主流基线（槽12末）
  let hash = 2166136261 >>> 0;
  const head: number[] = [];
  const placeCensus = new Map<number, number>();
  let mainUr: object | null = null;
  const foreignCnt = new Map<object, number>();
  const foreignStacks: string[] = [];
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  RNGp.reseed = function (this: unknown, s: number) {
    const r = oReseed.call(this, s);
    mainUr = (this as { vanilla: object }).vanilla;
    return r;
  };
  (globalThis as { __swOnRoll?: (v: number, inst: object) => void }).__swOnRoll = (v, inst) => {
    cnt++;
    if (inst === mainUr) {
      mainCnt++;
      if (capture) {
        hash = (Math.imul(hash ^ (v >>> 0), 16777619)) >>> 0;
        if (head.length < 16) head.push(v >>> 0);
      }
    } else if (capture) {
      foreignCnt.set(inst, (foreignCnt.get(inst) ?? 0) + 1);
      if (foreignStacks.length < 3) {
        foreignStacks.push(new Error().stack?.split('\n').slice(2, 6).join(' | ') ?? '(no stack)');
      }
    }
  };
  (globalThis as { __swSWCell?: (x: number, y: number) => void }).__swSWCell = (x, y) => {
    cntA[y * W + x] = mainCnt;
  };
  (globalThis as { __swSWCellB?: (x: number, y: number) => void }).__swSWCellB = (x, y) => {
    cntB[y * W + x] = mainCnt;
  };
  (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct = (fn, _x, _y, mat) => {
    if (fn === 'T') placeCensus.set(mat, (placeCensus.get(mat) ?? 0) + 1);
  };
  (globalThis as { __swSWLoopB?: (st2: { type: Uint16Array; flags: Uint8Array; half: Uint8Array; slope: Uint8Array }) => void }).__swSWLoopB = (st2) => {
    const typ = new Uint16Array(N), act = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const a = st2.flags[i]! & 1;
      act[i] = a;
      const sh = SHEET[st2.type[i]!];
      typ[i] = a ? (sh >= 0 ? sh : 9999) : 0;
    }
    writeFileSync(`${OUT}/js052b_LoopAEnd.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${OUT}/js052b_LoopAEnd.act`, Buffer.from(act));
    writeFileSync(`${OUT}/js052b_LoopAEnd.slope`, Buffer.from(st2.slope));
    writeFileSync(`${OUT}/js052b_LoopAEnd.half`, Buffer.from(st2.half));
    console.log(`[i181] dumped js052b_LoopAEnd (4ch, loop A 末态)`);
  };
  let curStore: { type: Uint16Array; flags: Uint8Array; half: Uint8Array; slope: Uint8Array } | null = null;
  const dump = (d: number, tag: string) => {
    if (!curStore) return;
    const typ = new Uint16Array(N), act = new Uint8Array(N), ghost = new Uint16Array(N);
    for (let i = 0; i < N; i++) {
      const a = curStore.flags[i]! & 1;
      act[i] = a;
      const sh = SHEET[curStore.type[i]!];
      typ[i] = a ? (sh >= 0 ? sh : 9999) : 0;
      ghost[i] = sh >= 0 ? sh : (curStore.type[i]! === 0 ? 0 : 9999);
    }
    const pre = `${OUT}/js${String(d).padStart(3, '0')}_${tag}`;
    writeFileSync(`${pre}.typ`, Buffer.from(typ.buffer));
    writeFileSync(`${pre}.act`, Buffer.from(act));
    writeFileSync(`${pre}.ghost`, Buffer.from(ghost.buffer));
    writeFileSync(`${pre}.slope`, Buffer.from(curStore.slope));
    writeFileSync(`${pre}.half`, Buffer.from(curStore.half));
    console.log(`[i181] dumped ${pre} (5ch)`);
  };
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: EVIL as -1 | 0 | 1, seedFlags: FLAGS,
      onWorldPartial: (w, i) => {
        if (!curStore) curStore = w.store as never as typeof curStore;
        if (i === 12) { dump(52, 'Shell_Piles'); cnt0 = mainCnt; capture = true; hash = 2166136261 >>> 0; }
        else if (i === 13) {
          capture = false; dump(53, 'Smooth_World');
          console.log(`[i181] 窗口域: cnt0(槽12末主流)=${cnt0} 窗长Lj_main=${mainCnt - cnt0} FNV=${hash >>> 0} 头8=[${head.join(',')}]`);
        }
      },
    });
  } finally {
    delete (globalThis as { __swOnRoll?: unknown }).__swOnRoll;
    RNGp.reseed = oReseed;
    delete (globalThis as { __swSWCell?: unknown }).__swSWCell;
    delete (globalThis as { __swSWCellB?: unknown }).__swSWCellB;
    delete (globalThis as { __swSWLoopB?: unknown }).__swSWLoopB;
    delete (globalThis as { __swSWAct?: unknown }).__swSWAct;
  }
  writeFileSync(`${OUT}/js-cntA.bin`, Buffer.from(cntA.buffer));
  writeFileSync(`${OUT}/js-cntB.bin`, Buffer.from(cntB.buffer));
  // ── x86 对读 ──
  let x86: { cnt: number; hash: number } | null = null;
  if (existsSync(`${G2}/pc.txt`)) {
    for (const ln of readFileSync(`${G2}/pc.txt`, 'utf8').split('\n')) {
      const m = ln.match(/^P\|53\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|[^|]+\|R:(\d+):(\d+)$/);
      if (m && Number(m[1]) > 0) { x86 = { cnt: Number(m[1]), hash: Number(m[2]) >>> 0 }; break; }
    }
  }
  // ★LJ 以「窗口域」打印值为准（上面 窗长Lj_main 行）;此处 Lj=主实例全程计数,非窗长——
  //   曾误读为窗长导出假 δ=-747×40(重放 FNV 假不闭合),v4 起窗长只看 窗口域 行。
  const Lj = mainCnt - cnt0;
  const body = x86 ? x86.cnt - 1 : -1;
  console.log(`[i181] 主实例全程=${Lj}(非窗长!) vs x86体=${body}`);
  console.log(`[i181] loopA总掷(JS)=cntB(20,20)−cnt0=${cntB[20 * W + 20] - cnt0} vs x86解析式243,792 → ΔloopA=${(cntB[20 * W + 20] - cnt0) - 243792}`);
  // 普适流重放校验 + 尾闭合
  const ur = new UnifiedRandom(Number(SEED));
  for (let k = 0; k < Lj; k++) ur.next();
  const tail = ur.next();
  const ur2 = new UnifiedRandom(Number(SEED));
  let h2 = 2166136261 >>> 0;
  for (let k = 0; k < Lj; k++) h2 = (Math.imul(h2 ^ (ur2.next() >>> 0), 16777619)) >>> 0;
  h2 = (Math.imul(h2 ^ (tail >>> 0), 16777619)) >>> 0;
  console.log(`[i181] 普适流校验: FNV(重放)=${h2 >>> 0} vs 捕获=${hash >>> 0} ${h2 === hash ? '≡(窗=纯普适前缀)' : '≠(窗内有外来掷!)'}; 尾样本=${tail}`);
  console.log(`[i181] FNV闭合 vs x86 P|53=${x86?.hash}: ${h2 === x86?.hash ? '闭合✓(流全同)' : '不闭合✗'}`);
  console.log(`[i181] 外来掷(窗内): ${[...foreignCnt.values()].reduce((a, b) => a + b, 0)} 个 / ${foreignCnt.size} 实例`);
  for (const st of foreignStacks) console.log(`[i181] 外来掷栈: ${st}`);
  const top = [...placeCensus.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([m, v]) => `${m}×${v}`).join(' ');
  console.log(`[i181] placeCornerBlock 普查(按内部id): ${top}`);
});

/** 离线分析：δ 定位 + loop B 首翻格 + loop A 柱消费剖面。
 *  用法：SW_I181_CNT0=<窗起点> npx vitest run tools/_iii181.test.ts -t 'offline' */
(it as (n: string, f: () => void) => void)('IIIII181 offline analysis (no worldgen)', () => {
  const rdU32 = (p: string) => new Int32Array(readFileSync(p).buffer, readFileSync(p).byteOffset, readFileSync(p).byteLength >> 2);
  const cA = rdU32(`${OUT}/js-cntA.bin`);
  const cB = rdU32(`${OUT}/js-cntB.bin`);
  const cnt0 = Number(process.env.SW_I181_CNT0 ?? -1);
  if (cnt0 < 0) { console.log('[i181-off] SW_I181_CNT0 未设,跳过'); return; }
  const A_js = cB[20 * W + 20] - cnt0;
  const A86 = 243792;
  const delta = A_js - A86;
  console.log(`[i181-off] A_js=${A_js} A86=${A86} δ=${delta}`);
  // loop B 首个门值分歧格（shift δ 下）
  const ur = new UnifiedRandom(Number(SEED));
  const N2 = (v: number) => (v >>> 0) >= 2147483648 ? 1 : 0;
  const start = Math.min(A_js, A86);
  for (let k = 0; k < start; k++) ur.next();
  const u: number[] = [];
  for (let k = 0; k < 400; k++) u.push(ur.next());
  let firstFlip = -1;
  for (let c = 0; c < 400; c++) {
    const vJs = N2(u[A_js - start + c]!), v86 = N2(u[A86 - start + c]!);
    if (vJs !== v86) { firstFlip = c; break; }
  }
  if (firstFlip >= 0) {
    const c = firstFlip;
    console.log(`[i181-off] loop B 首门值分歧格 c=${c} → (x,y)=(${20 + ((c / (H - 40)) | 0)},${20 + (c % (H - 40))})`);
  } else {
    console.log('[i181-off] loop B 前 400 格门值全同(翻在后段)');
  }
  // loop A 柱消费剖面
  const colC = (x: number) => cA[(x + 1) * W + 20] - cA[x * W + 20];
  const mk = (a: number, b: number) => {
    const r: string[] = [];
    for (let x = a; x < b; x++) r.push(`${x}:${colC(x)}`);
    return r.join(' ');
  };
  console.log('[i181-off] loopA 柱消费 x20-59: ' + mk(20, 60));
  console.log('[i181-off] loopA 柱消费 x700-744: ' + mk(700, 745));
  console.log('[i181-off] loopA 柱消费 x2735-2759: ' + mk(2735, 2760));
});
