// IIII148b 一次性诊断（env 门控 SW_I148B=1，用毕可删）：
// sandy #76 Traps 巨石变体定罪仪——①注册 __swTrapEv 钩捕 VID 候选序；②Traps pass
// 写前(▶Traps)/写后(▶Piles reseed)双快照提取 JS 实际巨石放置集，与 x86 075→076 对拍。
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { RNG } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = process.env.SW_I148B === '1';
const SEED = process.env.SW_I148_SEED ?? '0';
const W = 4200, H = 1200;
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const JS_IDS = new Map(TILE_DEFS.map((d, i) => [i, d?.vanilla?.sheet ?? -1]));
const isBoulderJs = (t: number) => BOULDER_SHEETS.has(JS_IDS.get(t) ?? -1);

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

(RUN ? it : it.skip)('IIII148b trap boulder event trace', async () => {
  const ev: string[] = [];
  (globalThis as unknown as { __swTrapEv?: (k: string, a: number, b: number, v: number) => void }).__swTrapEv =
    (k, a, b, v) => { if (k === 'VID') ev.push(`${k}|${a}|${b}|${v}`); };
  let store: Record<string, Uint16Array | Uint8Array> | null = null;
  let pre: string[] | null = null;
  let post: string[] | null = null;
  const scan = (): string[] => {
    const out: string[] = [];
    const f = store!.flags as Uint8Array, t = store!.type as Uint16Array;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (f[i] && isBoulderJs(t[i]!)) out.push(`${x},${y},${JS_IDS.get(t[i]!)}`);
      }
    }
    return out;
  };
  const RNGp = RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  try {
    await generateWorld({
      width: W, height: H, seedText: SEED, evil: -1 as -1,
      onWorldPartial: (w, _i, pn) => {
        if (!store) store = w.store as never;
        if (pn === '倒木水景' && !pre) pre = scan();       // Traps 写前
        if (pn === '地表装饰' && !post) post = scan();     // Traps 写后
      },
    });
  } finally {
    RNGp.reseed = oReseed;
    delete (globalThis as unknown as Record<string, unknown>).__swTrapEv;
  }
  console.log(`[i148b] VID candidates=${ev.length} pre=${pre?.length ?? '∅'} post=${post?.length ?? '∅'}`);
  writeFileSync('/tmp/iii148-out/vid-104.txt', ev.join('\n'));
  // 指定格 pre/post 值抽查
  const val = (arr: string[] | null, x: number, y: number): string => {
    if (!arr) return '∅';
    const hit = arr.find((c) => c.startsWith(`${x},${y},`));
    return hit ? hit.split(',')[2]! : '·';
  };
  for (const [x, y] of [[343, 613], [328, 756], [2923, 361], [2989, 860], [3571, 486], [2005, 790], [2681, 867], [433, 429]] as Array<[number, number]>) {
    console.log(`[i148b] cell(${x},${y}) pre=${val(pre, x, y)} post=${val(post, x, y)}`);
  }
  if (post) console.log(`[i148b] JS placed boulders (post-pre new):\n${post.filter((c) => !pre?.includes(c)).map((c) => `[i148b] JS ${c}`).join('\n')}`);
}, 600000);
