// IIII99b：toadstool 终段反演重放仪（_iii105tm 范式换锚到终清理槽）。
// ① SW_I08CAP2=1：复用 _iii108cap 拍基座（s57 前含 gs/genSolid/world ctx）。
// ② SW_I08TM=1：hydrate s57_* → restoreGenSolid → rng.reseed(seed)（槽头语义）→
//    runFinalCleanupPass(含 beforeShimmer=finalizeSecretSeedDoEnds+portalGun+finalSeedCleanup)
//    → finalGenMergeScan → 对拍 x86 -004_PostFinSeed / #105_Final_Cleanup 双锚。
import { it } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';
import { TileStore } from '../src/world/TileStore';
import { RNG } from '../src/core/rng';
import type { GenState } from '../src/world/gen/vanilla/GenState';
import { restoreGenSolid } from '../src/world/gen/vanilla/GenSolid';
import { runFinalCleanupPass } from '../src/world/gen/vanilla/FinalCleanupPass';
import { finalGenMergeScan } from '../src/world/liquid/settle';
import {
  finalizeSecretSeedDoEnds,
} from '../src/world/gen/vanilla/SecretSeedDoEndsPass';
import { doPortalGunInChests, finalSeedCleanup } from '../src/world/gen/vanilla/FinalSeedCleanupPass';
import { hfIs1457 } from '../src/world/gen/vanilla/HellFortPass';

const RUN_RE = process.env.SW_I08TM === '1';
const OUT = process.env.SW_I08_OUT ?? '/tmp/iii108-out/js4';
const G2 = `${process.env.HOME}/GoldenChains/golden-toadstool`;
const W = 4200, H = 1200, N = W * H;
const SEED = '771002', EVIL = 0;

const CHANS = ['flags', 'type', 'frameX', 'frameY', 'wall', 'liquid', 'liquidType', 'half', 'slope', 'wire', 'paint', 'paintWall'] as const;

function desVal(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(desVal);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.__t === 'string') {
      const Ctor = (globalThis as unknown as Record<string, new (n: number) => unknown>)[o.__t];
      const arr = new Ctor((o.d as unknown[]).length) as unknown as { set(a: unknown[]): void };
      arr.set(o.d as unknown[]);
      return arr;
    }
    if (typeof o.__arr !== 'undefined') return (o.__arr as unknown[]).map(desVal);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o)) out[k] = desVal(o[k]);
    return out;
  }
  return v;
}

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = (TILE_DEFS[i] as { vanilla?: { sheet?: number } })?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
const le16 = (p: string) => { const b = readFileSync(p); return new Uint16Array(b.buffer, b.byteOffset, b.length >> 1); };
const u8 = (p: string) => new Uint8Array(readFileSync(p).buffer ?? readFileSync(p));

function loadDump(nm: string) {
  const p = `${G2}/${nm}`;
  return { a: u8(`${p}.act`), t: le16(`${p}.typ`), w: le16(`${p}.wal`), l: u8(`${p}.liq`) };
}

function cmp(X: ReturnType<typeof loadDump>, st: TileStore, tag: string, csvName: string | null) {
  const pair = new Map<string, number>();
  let fI = -1; let n = 0; const samples: string[] = []; const allCells: string[] = [];
  for (let i = 0; i < N; i++) {
    const xa = X.a[i] ? X.t[i] : 0;
    const ja = (st.flags[i] & 1) ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
    let kind = '';
    if ((X.a[i] ? 1 : 0) !== (st.flags[i] & 1)) kind = `A${X.a[i]}>${st.flags[i] & 1}`;
    else if (xa !== ja) kind = `T${xa}>${ja}`;
    else if (X.w[i] !== st.wall[i]) kind = `W${X.w[i]}>${st.wall[i]}`;
    else if (X.l[i] !== st.liquid[i]) kind = `L${X.l[i]}>${st.liquid[i]}`;
    if (!kind) continue;
    n++; if (fI < 0) fI = i;
    const kk = kind.replace(/\/>.*/, '>...');
    pair.set(kk, (pair.get(kk) ?? 0) + 1);
    allCells.push(`${i % W},${Math.floor(i / W)} ${kk}`);
    if (samples.length < 8) samples.push(`(${i % W},${Math.floor(i / W)}) ${kind}`);
    if (csvName) void csvName;
  }
  if (process.env.SW_I08_ALL === '1') writeFileSync(`/tmp/iii108-out/${tag.replace(/[^\w]/g,'_')}.cells.txt`, allCells.join('\n'));
  console.log(`[${tag}] n=${n} first=${fI < 0 ? '-' : `${fI % W},${Math.floor(fI / W)}`} pairs=${[...pair.entries()].sort((a, b) => b[1]! - a[1]!).slice(0, 8).map(([k, c]) => `${k}×${c}`).join(' ')}`);
  for (const s of samples) console.log(`   ${s}`);
  writeFileSync(`/tmp/iii108-out/${csvName ?? 'x'}.txt`, JSON.stringify({ tag, n }));
}

(RUN_RE ? it : it.skip)('III99b final-cleanup slot replay on hydrated base', () => {
  // hydrate store
  const hdr = JSON.parse(readFileSync(`${OUT}/s57_ctx.json`, 'utf8')) as {
    genSolid: Record<string, number[]>; world: Record<string, unknown>;
  };
  const st = new TileStore(W, H);
  const rec = st as unknown as Record<string, Uint8Array | Uint16Array>;
  for (const c of CHANS) {
    const bytesPer = c === 'type' || c === 'frameX' || c === 'frameY' || c === 'wall' ? 2 : 1;
    rec[c]!.set(bytesPer === 2 ? new Uint16Array(readFileSync(`${OUT}/s57_${c}.bin`).buffer, 0, N) : new Uint8Array(readFileSync(`${OUT}/s57_${c}.bin`).buffer, 0, N));
  }
  // selfcheck vs G2 #104
  {
    const D = loadDump('104_Remove_Broken_Traps');
    let bad = 0;
    for (let i = 0; i < N; i++) {
      const xa = D.a[i] ? D.t[i] : 0, ja = (st.flags[i] & 1) ? (SHEET[st.type[i]] >= 0 ? SHEET[st.type[i]] : 9999) : 0;
      if ((D.a[i] ? 1 : 0) !== (st.flags[i] & 1) || xa !== ja) bad++;
    }
    console.log(`base selfcheck vs #104: dAct+dTyp=${bad}${bad ? ' ✗' : ' ✓'}`);
  }
  restoreGenSolid(new Map(Object.entries(hdr.genSolid).map(([k, v]) => [Number(k), !!v])));
  const ctxJson = JSON.parse(readFileSync(`${OUT}/s57_ctx.json`, 'utf8'));
  const gs = desVal(ctxJson.gs) as unknown as GenState;
  void EVIL;
  const rng = new RNG(gs.seed as number);
  rng.reseed(gs.seed as number);                    // 槽头重播（WorldGen.ts:397）
  const SKIP = process.env.SW_I08_SKIP ?? '';
  try {
    if (!SKIP.includes('cleanup')) {
      const serStage = (tag: string): void => {
        try {
          for (const c of CHANS) {
            const arr = rec[c] as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
            writeFileSync(`/tmp/iii108-out/tm-${tag}_${c}.bin`, Buffer.from(arr.buffer as ArrayBuffer, 0, arr.byteLength));
          }
          console.log(`stage→ tm-${tag}_*`);
        } catch (e) { console.log(`stage skip: ${(e as Error).message}`); }
      };
      runFinalCleanupPass(st, gs, rng, {
        chests: [],
        beforeShimmer: () => {
          if (!SKIP.includes('doends')) {
            finalizeSecretSeedDoEnds(st, rng, gs, hdr.world as never);
            if (hfIs1457()) {
              if (gs.seedFlags?.portalGunInChests) doPortalGunInChests([], () => rng.nextInt(7) === 0);
              finalSeedCleanup(st, gs.seedFlags ?? {}, []);
            }
          }
          serStage('postfin');                       // 对应 x86 -004_PostFinSeed 时点
        },
      });
    }
    if (!SKIP.includes('merge')) finalGenMergeScan(st, rng);
    {
      try {
        for (const c of CHANS) {
          const arr = rec[c] as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
          writeFileSync(`/tmp/iii108-out/tm-end_${c}.bin`, Buffer.from(arr.buffer as ArrayBuffer, 0, arr.byteLength));
        }
        console.log('stage→ tm-end_*');
      } catch { /* noop */ }
    }
  } finally { /* noop */ }
  cmp(loadDump('-004_PostFinSeed'), st, 'replay vs x86 PostFinSeed', 'fcp-postfin');
  cmp(loadDump('105_Final_Cleanup'), st, 'replay vs x86 Final_Cleanup', 'fcp-final');
  console.log('context tags ok:', existsSync(`${OUT}/s57_ctx.json`));
}, 600_000);

// 供 CI 无参时静默跳过（generateWorld 引用保占位）
void generateWorld;
