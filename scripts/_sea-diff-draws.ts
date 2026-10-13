// ★650:海 pass 重放判卷(流语义定谳后:RNG(seed) fresh=真版同流)
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(803)。★2026-10-13 修复:注册面须透传 JSON 字段(solid/framed/growsOn/
// chest 等)——旧版只传 key/name 致 defs[mod].solid=false→genSolid 对一切 mod tile
// 恒 false→LayTrees noGround 78/78(树 0 棵)+DetermineYStart 落点漂移风险。
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`, name: '',
        solid: !!j.solid, decor: !!j.decor, framed: !!j.framed, chest: !!j.chest,
        opacity: j.opacity, pick: j.pick, axe: j.axe,
      }, nextId++);
    } catch { /* skip */ }
  }
}
// ★652:pass 域依赖注入——gen-sea 的 genSolid/sheetOf 读 globalThis.__calamityTileDefs
// (引擎由 src/mods/register.ts:152 注入;判卷此前漏配=genSolid 恒 false→YStart 落
//  worldSurface 兜底 337、棕榈清除/RemoveStupid 全盲,首判 78,725 的第一因)。
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;

// 快照载入(x 主序→行主序;gzip)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();   // ★651 精确段匹配
  if (!f) throw new Error('快照未找到: ' + pat);
  const buf = gunzipSync(readFileSync(join2(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
}
import { join as join2 } from 'node:path';

// C# id→本仓内部 id
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
// mod 运行时 id→名(终版 twld tileMap)
class BER { off = 0; b: Uint8Array; constructor(b: Uint8Array) { this.b = b; } u8() { return this.b[this.off++]; } i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; } i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; } bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; } str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); } }
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 11: { const n = r.i32(); const o: number[] = []; for (let i = 0; i < n; i++) o.push(r.i32()); return o; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n = r.i32(); const o: unknown[] = []; for (let i = 0; i < n; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const nm = r.str(); t.push({ t: id2, name: nm, v: payload(id2, r) }); } return t; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, number>();   // cs id → 本仓 internal id
{
  const twld = gunzipSync(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const our = TILE_BY_KEY[`mod_calamity_${snake}`];
    if (our !== undefined) MOD_ID_TO_NAME.set(Number(get('value')), our);
  }
  console.log('[replay] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

// store 构建
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t; flags[i] = t !== 0 ? 1 : 0;
    wall[i] = snap.wall[i];
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy; },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

const pre = loadSnap('pre-Micro_Biomes');   // 探针命名=当前 pass 完成态=海 pass 输入
const post = loadSnap('post-Sulphur_Sea');
const store = buildStore(pre);

const seaMod = await import('../mods/calamity/src/gen-sea.ts');
let seaFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      if (name === 'Sulphurous Sea') seaFn = fn;
    };
    return () => {};
  },
  has: () => true,
});
(seaMod as { setupGenSea(sw: unknown): void }).setupGenSea(stub);
if (!seaFn) throw new Error('Sulphurous Sea 未注册');
console.log('[replay] pass fn 就绪');

const gs = {
  seed: translateSeed('9293480'),
  worldSurface: 337, rockLevel: 535,
  // ★652:GenVars.worldSurfaceLow(TerrainPass.cs:237=num5=全图地表最小值;真实值
  //  属 [228,276] 夹带)——DetermineYStart 从 low−20 下行找首实心。判卷列实测:
  //  搜索列 x=3828 首实心 y=246 → 凡 start≤244(low≤264)搜索结果不变(不变量域),
  //  取 246 落域内。缺省回退 worldSurface=337=start 317 已在滩体内=错位 ~90 行。
  //  ★2026-10-13 yStart 定谳=248:岛屿零游程(i[0-23] topS 差恒 0=岛形确定性恒等)
  //  否证 251(+3 恒差)、topS 一致率 248=124/371 ≫ 251=10/371;tileSolid[186]=false
  //  (Main.cs Initialize_TileAndNPCData 全块无 185/186/187)。
  worldSurfaceLow: 246,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
  },
};
const rng = new RNG(gs.seed as number);
// ★671:掷数计数(对拍真链 SPY 谱)。★2026-10-13 口径收口:SPY 数 genRand 每次
//  Sample(=InternalSample);本仓 next/nextInt/nextIntRange/range/nextBool 均 1:1,
//  旧版漏包 range(shallowwater descent 1 掷)——补全。
let drawCount = 0;
const METH_COUNT: Record<string, number> = {};
const SEG_METH: Array<Record<string, number>> = [];
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  const COUNTED = ['next', 'nextInt', 'nextIntRange', 'range', 'nextBool'];
  for (const m of COUNTED) {
    const fn = (proto[m] as ((...a: unknown[]) => unknown) | undefined);
    if (typeof fn !== 'function') continue;
    (globalThis as { __seaDrawBuf?: string[] }).__seaDrawBuf = [];
    (rng as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) {
      const v = fn.apply(this, a);
      drawCount++; METH_COUNT[m] = (METH_COUNT[m] ?? 0) + 1; const cur = SEG_METH[SEG_METH.length - 1]; if (!cur) { throw new Error('掷在无段区 ' + m + '\n' + new Error().stack); } cur[m] = (cur[m] ?? 0) + 1;
      const tag = m === 'next' ? 'd' : m === 'range' ? `f${a[0]}_${a[1]}` : m === 'nextInt' ? `i${a[0]}` : `r${a[0]}_${(a[1] as number) + 1}`;
      ((globalThis as { __seaDrawBuf?: string[] }).__seaDrawBuf ?? []).push(`${drawCount - 1}\t${tag}\t${v}`);
      return v;
    };
  }
}
// ★掷数谱段标记(gen-sea.ts seaSeg 钩子):记录段边界累计掷数快照
const SEG_MARKS: string[] = [];
const SEG_AT: number[] = [];
(globalThis as { __seaSegMark?: (n: string) => void }).__seaSegMark = (n: string) => { SEG_MARKS.push(n); SEG_AT.push(drawCount); SEG_METH.push({}); };
(globalThis as { __seaTreeDbg?: { n05: number; noGround: number; liquid: number; fail: string[]; ok: string[] } | null }).__seaTreeDbg = { n05: 0, noGround: 0, liquid: 0, fail: [], ok: [] };
console.log('[sea] 海 pass 掷骰总数 =', ((seaFn as any) && 0));
(seaFn as (...a: unknown[]) => void)(store, rng, gs);
console.log('[sea] 海 pass 掷骰总数 =', drawCount);
{
  let prev = 0;
  console.log('[sea] 段谱(段名 段掷 累计 | 方法直方):');
  for (let k = 0; k < SEG_MARKS.length; k++) {
    const h = SEG_METH[k];
    const hs = Object.entries(h).map(([m, c]) => `${m}:${c}`).join(' ') || '-';
    console.log(`  ${SEG_MARKS[k].padEnd(14)} ${SEG_AT[k] - prev}\t累计=${SEG_AT[k]}\t[${hs}]`);
    prev = SEG_AT[k];
  }
  console.log('  (tail)', drawCount - prev);
}
{
  const dbg = (globalThis as { __seaTreeDbg?: { n05: number; noGround: number; liquid: number; fail: string[]; ok: string[] } }).__seaTreeDbg;
  if (dbg) console.log('[sea] treeDbg:', JSON.stringify({ ...dbg, ok: (dbg as any).ok, fail: dbg.fail.slice(0, 10), failN: dbg.fail.length }));
}
{
  const defs = (globalThis as { __calamityTileDefs?: Array<{ key?: string; solid?: boolean }> }).__calamityTileDefs || [];
  const tid = gs.mods.tileIdByKey as Record<string, number>;
  console.log('[sea] ids: sulphSand=', tid['sulphurous_sand'], 'hardened=', tid['hardened_sulphurous_sandstone'], 'defs[ss]=', JSON.stringify(defs[tid['sulphurous_sand']]?.let?.() ?? { key: defs[tid['sulphurous_sand']]?.key, solid: defs[tid['sulphurous_sand']]?.solid }), 'defs.len=', defs.length);
}

// ★652:存档域归一(ghost purge)——post 快照=pass 边界的「已保存世界」视图:原版
//  .wld 对未激活 tile 不写 type(WF:1458-1462 flag 门)→ inactive 格 type 恒 0。
//  物证:首差格(3839,222) pre=树(5)→post=0,而 C# RemoveStupidTilesAboveSea
//  (SulphurousSea.cs:303) 只 HasTile=false(type 内存中保留)→ 快照必为归一化编码。
//  判卷侧对齐之(TileStore.purgeGhostTiles 同式,TileStore.ts:140-155);pass 内部
//  保持活体语义(C# live;pass2 PlaceAmbience 裸读 type 依赖它)。
for (let i = 0; i < n; i++) { if (!(store.flags[i] & 1) && store.type[i] !== 0) store.type[i] = 0; }

let diff = 0;
const diffByType = new Map<string, number>();
let firstDiff = '';
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (!firstDiff) { const x = i % w, y = Math.floor(i / w); firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`; }
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) ${firstDiff}`);
// 双侧聚合(本 pass 涉及域)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
const keys = new Set([...oursC.keys(), ...realC.keys()]);
const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0]).filter((r) => Math.abs((r[1] ?? 0) - (r[2] ?? 0)) > 50).sort((a, b) => Math.abs((b[1] ?? 0) - (b[2] ?? 0)) - Math.abs((a[1] ?? 0) - (a[2] ?? 0)));
console.log('[replay] 聚合差 TOP12(tile 我 真):');
for (const [k, a, b] of rows.slice(0, 12)) console.log(`  ${k}: ${a} vs ${b}`);
// ★2026-10-13 lessrigid 判别实验:heightSeed 重采样——真链上游流位≠我方(±2.4%/+8.3%
//  段偏),真 heightSeed 是同分布另一样本。若 3,365 落入重采样谱内=掷面已全(残差=流
//  采样差,非缺面);若谱外=缺面定谳(候选=PlaceWall(0) 臂中心掷)。
if (process.env.SW_LESS_RESAMPLE === '1') {
  const heightSeedAt = SEG_AT[SEG_MARKS.indexOf('hardline')] ?? 0;   // heightSeed=其后第 1 掷
  const trials = Number(process.env.SW_LESS_TRIALS ?? '30');
  const stats: number[] = [];
  for (let t = 0; t < trials; t++) {
    const st2 = buildStore(pre);
    const rng2 = new RNG(gs.seed as number);
    let pos = 0;
    const proto2 = rng2 as unknown as Record<string, (...a: unknown[]) => unknown>;
    const COUNTED = ['next', 'nextInt', 'nextIntRange', 'range', 'nextBool'];
    for (const m of COUNTED) {
      const fn = proto2[m];
      if (typeof fn !== 'function') continue;
      (rng2 as unknown as Record<string, unknown>)[m] = function (this: unknown, ...a: unknown[]) {
        pos++;
        if (m === 'next' && pos === heightSeedAt + 1) {
          // 线性同余伪列(heightSeed 重采样;值域 [0,1) 全域)
          const s = (1103515245 * (t + 1) + 12345) >>> 0;
          return (s % 2147483647) / 2147483647;
        }
        return fn.apply(this, a);
      };
    }
    const segs: Array<[string, number]> = [];
    (globalThis as { __seaSegMark?: (n: string) => void }).__seaSegMark = (n: string) => segs.push([n, pos]);
    (seaFn as (...a: unknown[]) => void)(st2, rng2, gs);
    const hi = segs.findIndex((s) => s[0] === 'lessrigid');
    const hardlineAt = segs.find((s) => s[0] === 'hardline')?.[1] ?? 0;
    const n2 = segs[hi]?.[1] ?? -1;
    stats.push(n2 - hardlineAt);
  }
  stats.sort((a, b) => a - b);
  console.log(`[resample] lessrigid 掷数谱 n=${trials}: min=${stats[0]} p25=${stats[Math.floor(trials * 0.25)]} med=${stats[Math.floor(trials / 2)]} p75=${stats[Math.floor(trials * 0.75)]} max=${stats[trials - 1]}`);
  console.log('[resample] 全谱:', stats.join(','));
}
{
  const buf = (globalThis as { __seaDrawBuf?: string[] }).__seaDrawBuf;
  if (buf) (await import('node:fs')).writeFileSync('/tmp/sea-mine-draws.txt', buf.join('\n') + '\n');
}
process.exit(0);
