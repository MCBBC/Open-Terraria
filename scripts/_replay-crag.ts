// ★6xx:硫火狱(Brimstone Crag)pass 重放判卷(克隆 _replay-sea.ts;流语义定谳:RNG(seed) fresh)
// 边界定谳(FNV 对账 2026-10-12):探针 PASS 行 tf=该 pass 完成后状态;
//   输入=snap-27-pre-Forsaken_Archive(86,296 mod 格=档案后=硫火狱前),
//   输出=snap-28-pre-Brimstone_Crag(176,472 mod 格=硫火狱后,+90,176 与全链聚合吻合)。
import { TMOD_LOGS, needInput } from './_pathlib.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = needInput(TMOD_LOGS);
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');
const { RNG, translateSeed } = await import('../src/core/rng.ts');

// mod tile 注册(803)——★重放定谳:须透传 content json 字段(solid/framed/w/h/chest…),
// 与 src/mods/register.ts:220 运行时注册面对齐;裸 key 注册=solid 恒 false
// → placeCragObject 锚行全拒(ambience 全零假象)。
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${root}/mods/calamity/content/tiles/${f}`, 'utf8')) as Record<string, unknown>;
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: (spec.name as string) ?? '',
        solid: (spec.solid as boolean) ?? false,
        platform: (spec.platform as boolean) ?? false,
        decor: (spec.decor as boolean) ?? false,
        chest: (spec.chest as boolean) ?? false,
        framed: (spec.framed as boolean) ?? false,
        w: spec.w as number | undefined,
        h: spec.h as number | undefined,
        opacity: spec.opacity as number | undefined,
        pick: (spec.pick as number) ?? 0,
        mapColor: (spec.mapColor as string) ?? '#808080',
        blend: false,
      }, nextId++);
    } catch { /* skip */ }
  }
}

// ── gen-crag 消费的全局面(同 mods/calamity/tests/gen-pass-golden.test.ts 装载路径)──
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
{
  const sch: Record<string, unknown> = {};
  try {
    for (const f of readdirSync(`${root}/mods/calamity/schematics`).sort()) {
      if (!f.endsWith('.json')) continue;
      try { sch[f.replace('.json', '')] = JSON.parse(readFileSync(`${root}/mods/calamity/schematics/${f}`, 'utf8')); } catch { /* skip */ }
    }
  } catch { /* dir 不在 */ }
  (globalThis as Record<string, unknown>).__calamitySchematics = sch;
  console.log('[replay] schematics 装载', Object.keys(sch).length, '个:', Object.keys(sch).filter((k) => k.includes('Crag')).join(','));
}

// 快照载入(x 主序→行主序;gzip)
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop();   // 精确段匹配
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
  // ★重放定谳:Calamity 类名数字后缀(CragStalactiteGiant1/LavaLily3)→本仓键含 _(
  //   crag_stalactite_giant_1);单 snake 变体丢配 → 快照 mod id 全部落 0(仪盲)。
  const ourByKey = (nm: string): number | undefined => {
    const s1 = nm.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    for (const s of [s1, s1.replace(/([a-z])(\d)/g, '$1_$2')]) {
      const id = TILE_BY_KEY[`mod_calamity_${s}`];
      if (id !== undefined) return id;
    }
    return undefined;
  };
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const our = ourByKey(String(get('name')));
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

const pre = loadSnap('pre-Forsaken_Archive');    // 硫火狱输入(档案后)
const post = loadSnap('pre-Brimstone_Crag');     // 探针命名=硫火狱完成后=输出
const store = buildStore(pre);

const cragMod = await import('../mods/calamity/src/gen-crag.ts');
let cragFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => {
      if (name === 'Brimstone Crag') cragFn = fn;
    };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen-crag]', ...a);
    return () => {};
  },
  has: () => true,
});
(cragMod as { setupGenCrag(sw: unknown): void }).setupGenCrag(stub);
if (!cragFn) throw new Error('Brimstone Crag 未注册');
console.log('[replay] pass fn 就绪');

const gs = {
  seed: translateSeed('9293480'),
  worldSurface: 337, rockLevel: 535,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200,
  seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {},
    chests: [] as unknown[],
  },
};
// 硫火狱区域(与 pass 内同式:dungeonX=3421>2100 → 右侧)
const biomeStart = 4200 - Math.floor(4200 / 5) - 25, biomeEdge = biomeStart + Math.floor(4200 / 5), uw = h - 200;
console.log(`[replay] crag 区 x∈[${biomeStart},${biomeEdge}] uw=${uw}`);

const rng = new RNG(gs.seed as number);
// ★671:掷数计数(对拍真链 SPY 谱)
(globalThis as { __drawN?: number }).__drawN = 0;
{
  const proto = rng as unknown as Record<string, (...a: unknown[]) => unknown>;
  for (const m of Object.getOwnPropertyNames(Object.getPrototypeOf(rng))) {
    const fn = proto[m];
    if (typeof fn === 'function' && /^(next|int|intRange|nextBool|nextFloat|nextDouble)/i.test(m)) {
      proto[m] = function (this: unknown, ...a: unknown[]) { (globalThis as { __drawN?: number }).__drawN = ((globalThis as { __drawN?: number }).__drawN ?? 0) + 1; return fn.apply(this, a); };
    }
  }
}
if ((globalThis as unknown as { __cragPre?: boolean }).__cragPre) (rng as any).next();   // ★单样本先行假设检验旋钮(实测=伪改善,默认关)
(cragFn as (...a: unknown[]) => void)(store, rng, gs);

// ── diff 剖面 ──
let diff = 0, diffIn = 0, diffOut = 0;
const diffByType = new Map<string, number>();
const modDiffByType = new Map<string, number>();   // 至少一侧是 mod tile 的差格
let firstDiff = '';
const isMod = (id: number) => id >= 1030;
for (let i = 0; i < n; i++) {
  const realT = CS_TO_OURS(post.type[i]);
  if (store.type[i] !== realT) {
    diff++;
    const x = i % w, y = Math.floor(i / w);
    const inCrag = x >= biomeStart - 2 && x <= biomeEdge + 2 && y >= uw - 2;
    if (inCrag) diffIn++; else diffOut++;
    const key = `${KEY_OF(store.type[i])}→${KEY_OF(realT)}`;
    diffByType.set(key, (diffByType.get(key) ?? 0) + 1);
    if (isMod(store.type[i]) || isMod(realT)) modDiffByType.set(key, (modDiffByType.get(key) ?? 0) + 1);
    if (!firstDiff) firstDiff = `首格(${x},${y}) 我=${KEY_OF(store.type[i])} 真=${KEY_OF(realT)}`;
  }
}
console.log(`[replay] 逐格 diff=${diff}/${n}(${((diff / n) * 100).toFixed(2)}%) 区内=${diffIn} 区外=${diffOut} ${firstDiff}`);

// 双侧聚合(全图)
const cnt = (arr: Uint16Array) => { const m = new Map<string, number>(); for (let i = 0; i < n; i++) { const k = KEY_OF(arr[i]); m.set(k, (m.get(k) ?? 0) + 1); } return m; };
const oursC = cnt(store.type), realC = cnt(Array.from(post.type, CS_TO_OURS));
const keys = new Set([...oursC.keys(), ...realC.keys()]);
const rows = [...keys].map((k) => [k, oursC.get(k) ?? 0, realC.get(k) ?? 0] as [string, number, number]).filter((r) => Math.abs(r[1] - r[2]) > 20).sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]));
console.log('[replay] 聚合差 TOP20(tile 我 真):');
for (const [k, a, b] of rows.slice(0, 20)) console.log(`  ${k}: ${a} vs ${b}`);

// mod 族聚合(任务判据面)
console.log('[replay] mod 族我 vs 真:');
for (const k of [...keys].filter((k) => k.startsWith('mod_')).sort()) {
  const a = oursC.get(k) ?? 0, b = realC.get(k) ?? 0;
  if (a > 0 || b > 0) console.log(`  ${k}: ${a} vs ${b}${a !== b ? '  ←Δ' + (b - a) : ''}`);
}
process.exit(0);
