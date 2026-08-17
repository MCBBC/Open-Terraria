// 一次性诊断（大尺寸分界带猎杀）：JS 管线逐 pass 流哈希对拍 x86 passchain。
// 方法：钩 UnifiedRandom.prototype.internalSample——每个 UR 实例 = 一条从 seed
// 起的连续流（pass 头 reseed/new RNG 均换实例）→ 每实例记录首掷栈标 + 掷数，
// 段哈希 = fnv(UR(seed) 前进 n 掷)（与 PassChainProbe StreamHash 同构）。
// 对照 /tmp/l2222home/passchain.txt 的 P|<idx>|<name>|...|<streamHash>|... 行。
// 用法：SW_LPASS=1 [SW_LPASS_CHAIN=path] [SW_LPASS_SEED=2222] [SW_LPASS_SIZE=2] \
//       npx vitest run tools/_lpass.test.ts
import { it } from 'vitest';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { generateWorld, SIZE_DIMS } from '../src/world/gen/WorldGen';
import { UnifiedRandom } from '../src/core/rng';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_LPASS;
const CHAIN = process.env.SW_LPASS_CHAIN ?? '/tmp/l2222home/passchain.txt';
const SEEDTXT = process.env.SW_LPASS_SEED ?? '2222';
const SIZE = Number(process.env.SW_LPASS_SIZE ?? 2) as 0 | 1 | 2;
const EVIL = (process.env.SW_LPASS_EVIL === '1' ? 1 : 0) as 0 | 1;
const GDUMP = process.env.SW_LPASS_GDUMP === '1';
const GDIR = process.env.SW_LPASS_GDIR ?? '/tmp/l2222home';
/** 「上一 pass」▶ 标签 → dump tag（reseed 时点 = 上一 pass 末态） */
const GD_TARGETS = new Map<string, string>([
  ['JunglePass', 'g17'], ['FloatingIslands', 'g23'], ['DirtToMud', 'g24'], ['Slush', 'g31'],
  // 离群种子终清（2026-08-17）：[28,31] 中段四边界（underworld 含 HellFort 尾段）
  ['Webs', 'g27'], ['Underworld', 'g28'], ['CorruptionAndCrimson', 'g29'], ['Lakes', 'g30'],
]);

const SHEETLUT = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEETLUT[i] = s;
}
type StoreLike = { w: number; h: number; type: Uint16Array; flags: Uint8Array; wall: Uint16Array; liquid: Uint8Array };
function dumpGrid(tag: string, st: StoreLike): void {
  const n = st.w * st.h;
  const typ = new Uint16Array(n), act = new Uint8Array(n), wal = new Uint16Array(n), liq = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const t = st.type[i]!;
    typ[i] = t === 0 ? 0 : SHEETLUT[t]! >= 0 ? SHEETLUT[t]! : 0x7777;
    act[i] = st.flags[i]! & 1;
    wal[i] = st.wall[i]!;
    liq[i] = st.liquid[i]!;
  }
  const le16 = (arr: Uint16Array): Buffer => {
    const b = Buffer.alloc(arr.length * 2);
    for (let i = 0; i < arr.length; i++) b.writeUInt16LE(arr[i]!, i * 2);
    return b;
  };
  writeFileSync(`${GDIR}/js-${tag}.typ`, le16(typ));
  writeFileSync(`${GDIR}/js-${tag}.act`, Buffer.from(act.buffer, act.byteOffset, act.byteLength));
  writeFileSync(`${GDIR}/js-${tag}.wal`, le16(wal));
  writeFileSync(`${GDIR}/js-${tag}.liq`, Buffer.from(liq.buffer, liq.byteOffset, liq.byteLength));
  console.log(`  [gdump] js-${tag} written`);
}

// ---- StreamHash（PassChainProbe 同构：FNV-1a over SeedArray[56]+inext）----
function fnv(sa: Int32Array, inext: number): string {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => {
    v = v >>> 0;
    for (let s = 0; s < 32; s += 8) { h = (h ^ ((v >>> s) & 0xFF)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  };
  for (let k = 0; k < sa.length; k++) mix(sa[k]);
  mix(inext);
  return h.toString(16).padStart(8, '0');
}
function hashOf(seed: number, n: number): string {
  const r = new UnifiedRandom(seed);
  for (let i = 0; i < n; i++) (r as unknown as { next(): number }).next();
  const ur = r as unknown as { seedArray: Int32Array; inext: number };
  return fnv(ur.seedArray, ur.inext);
}

// ---- 栈标：file:line → 源内最近 ▶ 注释 ----
const srcCache = new Map<string, string[]>();
function labelOf(file: string, line: number): string {
  let src = srcCache.get(file);
  if (!src) {
    try { src = readFileSync(file, 'utf8').split('\n'); } catch { src = []; }
    srcCache.set(file, src);
  }
  for (let l = Math.min(line, src.length) - 1; l >= 0 && l >= line - 40; l--) {
    const m = src[l].match(/▶([^（(]+?)[（(\s]/);
    if (m) return m[1].trim();
  }
  return `${file.split('/').pop()}:${line}`;
}

interface Seg { label: string; draws: number; seed: number; hash: string; stack?: string }

(RUN ? it : it.skip)('per-pass stream hash vs x86 passchain', async () => {
  // 解析 x86 passchain
  const van: Array<{ idx: number; name: string; hash: string }> = [];
  if (existsSync(CHAIN)) {
    for (const line of readFileSync(CHAIN, 'utf8').split('\n')) {
      const c = line.split('|');
      if (c[0] === 'P' && c.length > 6) van.push({ idx: Number(c[1]), name: c[2], hash: c[5] });
    }
  }
  console.log(`x86 passchain: ${CHAIN} → ${van.length} passes`);

  // 钩子
  const URp = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const oIsamp = URp.internalSample as (this: unknown) => number;
  const oCtorSeed = Symbol('seed');
  const segs: Seg[] = [];
  let cur: { obj: unknown; draws: number; stack?: string; seed: number } | null = null;
  // 构造器记种子（打在 setSeed 尾即可——reseed/ctor 都走它）
  const oSetSeed = URp.setSeed as (this: unknown, s: number) => void;
  URp.setSeed = function (s: number) { (this as never as Record<symbol, number>)[oCtorSeed] = s; return oSetSeed.call(this, s); };
  URp.internalSample = function (this: unknown) {
    if (!cur || cur.obj !== this) {
      const stack = new Error().stack ?? '';
      let frame = '?';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_lpass')) { frame = `${m[1].replace(/^.*?(src\/)/, '$1')}:${m[2]}`; break; }
      }
      cur = { obj: this, draws: 0, stack: frame, seed: (this as never as Record<symbol, number>)[oCtorSeed] ?? 0 };
      segs.push({ label: '', draws: 0, seed: cur.seed, hash: '', stack: frame });
    }
    cur.draws++;
    segs[segs.length - 1].draws = cur.draws;
    segs[segs.length - 1].seed = cur.seed;
    return oIsamp.call(this);
  };

  const dims = SIZE_DIMS[SIZE];
  const t0 = Date.now();
  // gdump：钩 RNG.reseed——reseed 时点 = 上一 pass 末态；prev 标签命中目标即落盘
  let gdPrev = '';
  let curStore: StoreLike | null = null;
  const RNGp = (await import('../src/core/rng')).RNG.prototype as unknown as Record<string, unknown>;
  const oReseed = RNGp.reseed as (this: unknown, s: number) => void;
  if (GDUMP) {
    RNGp.reseed = function (this: unknown, s: number) {
      if (curStore && gdPrev && GD_TARGETS.has(gdPrev)) dumpGrid(GD_TARGETS.get(gdPrev)!, curStore);
      const stack = new Error().stack ?? '';
      for (const line of stack.split('\n')) {
        const m = line.match(/((?:\/|[\w./-]*)src\/[^\s()]+\.ts):(\d+):\d+/);
        if (m && !m[1].includes('/core/rng') && !m[1].includes('_lpass')) {
          gdPrev = labelOf(m[1], Number(m[2]));
          break;
        }
      }
      return oReseed.call(this, s);
    };
  }
  const world = await generateWorld({
    size: SIZE, width: dims.width, height: dims.height, seedText: SEEDTXT, evil: EVIL,
    onWorldPartial: (w) => { if (!curStore) curStore = w.store as unknown as StoreLike; },
  });
  if (GDUMP && curStore) dumpGrid('gfinal', curStore);
  if (GDUMP) RNGp.reseed = oReseed;
  // 摘钩
  URp.internalSample = oIsamp; URp.setSeed = oSetSeed;
  console.log(`gen done ${((Date.now() - t0) / 1000).toFixed(0)}s, segments=${segs.length}, spawn=(${world.spawnX},${world.spawnY}) dungeon=(${world.dungeonX},${world.dungeonY})`);

  for (const s of segs) {
    s.hash = hashOf(s.seed, s.draws);
    const f = s.stack ?? '?';
    const m = f.match(/^(\/[^:]+):(\d+)/);
    s.label = m ? labelOf(m[1], Number(m[2])) : f;
  }

  // 对拍：hash→pass 全表匹配（hash=f(seed,n) 无碰撞——命中即掷数逐位全等）
  const byHash = new Map(van.map((p) => [p.hash, p]));
  console.log('\n=== JS segments（hash 命中 x86 pass 即掷数精确）===');
  const out: Array<Record<string, unknown>> = [];
  let vi = 0, matched = 0, firstBad = -1;
  for (let si = 0; si < segs.length; si++) {
    const s = segs[si];
    const p = byHash.get(s.hash);
    let note = '';
    if (p) {
      // 顺序检查：命中的 pass 序号应单调递增
      if (p.idx < vi) note = '  ⚠ 乱序命中';
      else vi = p.idx + 1;
      matched++;
    } else if (firstBad < 0 && s.draws > 100) firstBad = si;
    const line = `${p ? '✓' : '✗'} ${s.label.padEnd(36)} n=${String(s.draws).padStart(9)} ${p ? `= P|${p.idx}|${p.name}` : '(无同哈希 pass)'}`;
    console.log(line + note);
    out.push({ seg: si, label: s.label, stack: s.stack, draws: s.draws, hash: s.hash, vanIdx: p?.idx ?? null, vanName: p?.name ?? null });
  }
  console.log(`\nmatched=${matched}/${van.length}; firstBadSeg=${firstBad}${firstBad >= 0 ? ` (${segs[firstBad].label}, n=${segs[firstBad].draws})` : ''}`);
  writeFileSync('/tmp/lpass-segs.json', JSON.stringify({ van, segs: out }, null, 1));
}, 900_000);
