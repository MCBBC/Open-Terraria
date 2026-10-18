// 空间 diff 剖面:remains/slag/ambience 差格落点
import { TMOD_LOGS, needInput } from './_pathlib.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const root = process.env.SW_GAME_ROOT ?? process.cwd();
const LOGS = needInput(TMOD_LOGS);
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import(root + '/src/data/tiles.ts');
const { RNG, translateSeed } = await import(root + '/src/core/rng.ts');
{
  let nextId = 1030;
  for (const f of readdirSync(root + '/mods/calamity/content/tiles').sort()) {
    if (!f.endsWith('.json')) continue;
    try { registerModTile({ key: `mod_calamity_${f.replace('.json', '')}`, name: '' }, nextId++); } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;
{
  const sch: Record<string, unknown> = {};
  for (const f of readdirSync(root + '/mods/calamity/schematics').sort()) {
    if (!f.endsWith('.json')) continue;
    try { sch[f.replace('.json', '')] = JSON.parse(readFileSync(root + '/mods/calamity/schematics/' + f, 'utf8')); } catch { /* skip */ }
  }
  (globalThis as Record<string, unknown>).__calamitySchematics = sch;
}
function loadSnap(pat: string) {
  const f = readdirSync(LOGS).filter((x) => x.endsWith(pat + '.bin.gz')).sort().pop()!;
  const buf = gunzipSync(readFileSync(LOGS + '/' + f));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
  }
  return { type };
}
import { join as join2 } from 'node:path';
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
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
const MOD_ID_TO_NAME = new Map<number, number>();
{
  const twld = gunzipSync(readFileSync(root + '/mods/calamity/golden-oracle/golden-calamity.twld'));
  const r = new BER(twld); r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  const ourByKey = (nm: string): number | undefined => {
    const s1 = nm.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    for (const s of [s1, s1.replace(/([a-z])(\d)/g, '$1_$2')]) {
      const id = (TILE_BY_KEY as Record<string, number>)[`mod_calamity_${s}`];
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
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

const w = 4200, h = 1200, n = w * h;
const pre = loadSnap('pre-Forsaken_Archive');
const post = loadSnap('pre-Brimstone_Crag');
const store: any = {
  w, h, type: new Uint16Array(n), flags: new Uint8Array(n), wall: new Uint16Array(n),
  liquid: new Uint8Array(n), liquidType: new Uint8Array(n), wire: new Uint8Array(n),
  half: new Uint8Array(n), slope: new Uint8Array(n), frameX: new Uint16Array(n), frameY: new Uint16Array(n),
  idx(x: number, y: number) { return y * w + x; },
  get(x: number, y: number) { return this.type[y * w + x]; },
  setTile(x: number, y: number, t: number, fx = 0, fy = 0) { if (x < 0 || x >= w || y < 0 || y >= h) return; const i = y * w + x; this.type[i] = t; this.flags[i] = t !== 0 ? 1 : 0; this.frameX[i] = fx; this.frameY[i] = fy; },
  setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
  hasTile(x: number, y: number) { return (this.flags[y * w + x] & 1) !== 0; },
  purgeGhostTiles() { return 0; },
};
for (let i = 0; i < n; i++) { const t = CS_TO_OURS(pre.type[i]); store.type[i] = t; store.flags[i] = t !== 0 ? 1 : 0; }
const cragMod = await import(root + '/mods/calamity/src/gen-crag.ts');
let cragFn: ((...a: unknown[]) => void) | null = null;
const stub = new Proxy({}, {
  get: (_t, prop) => {
    if (prop === 'registerGenPass') return (name: string, fn: (...a: unknown[]) => void) => { if (name === 'Brimstone Crag') cragFn = fn; };
    if (prop === 'log') return (...a: unknown[]) => console.log('[gen-crag]', ...a);
    return () => {};
  },
  has: () => true,
});
(cragMod as any).setupGenCrag(stub);
const gs = {
  seed: translateSeed('9293480'), worldSurface: 337, rockLevel: 535,
  dungeonX: 3421, dungeonMaxY: 207, dungeonMinX: 0, dungeonMaxX: 4200, seedFlags: {},
  mods: {
    tileIdByKey: Object.fromEntries(Object.entries(TILE_BY_KEY).filter(([k]) => k.startsWith('mod_')).map(([k, v]) => [k.replace(/^mod_[a-z0-9]+_/, ''), v])),
    itemIdByKey: {}, chests: [] as unknown[],
  },
};
const rng = new RNG(gs.seed as number);
(cragFn as any)(store, rng, gs);

// ── 剖面 ──
const bs = 3335, be = 4175, uw = 1000;
// 1) remains 差格:x 直方图(50 桶)
const remX = new Map<number, number>();
const remY = new Map<number, number>();
let remOver = 0, remUnder = 0;
const slagX = new Map<number, number>();
let slagOver = 0, slagUnder = 0;
for (let y = 950; y < 1200; y++) {
  for (let x = bs - 60; x < be + 60; x++) {
    const i = y * w + x;
    const mine = store.type[i], real = CS_TO_OURS(post.type[i]);
    const remId = (TILE_BY_KEY as any)['mod_calamity_scorched_remains'];
    const slagId = (TILE_BY_KEY as any)['mod_calamity_brimstone_slag'];
    if (mine !== real) {
      if (mine === remId && real !== remId) { remOver++; remX.set(Math.floor((x - bs) / 50), (remX.get(Math.floor((x - bs) / 50)) ?? 0) + 1); remY.set(Math.floor((y - 950) / 20), (remY.get(Math.floor((y - 950) / 20)) ?? 0) + 1); }
      if (mine !== remId && real === remId) remUnder++;
      if (mine === slagId && real !== slagId) slagOver++;
      if (mine !== slagId && real === slagId) { slagUnder++; slagX.set(Math.floor((x - bs) / 50), (slagX.get(Math.floor((x - bs) / 50)) ?? 0) + 1); }
    }
  }
}
console.log('remains 我多(over)=', remOver, ' 我少(under)=', remUnder);
console.log('remains over x 桶(50 列,相对 bs):', [...remX.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k * 50}:${v}`).join(' '));
console.log('remains over y 桶(20 行,相对 950):', [...remY.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${950 + k * 20}:${v}`).join(' '));
console.log('slag over=', slagOver, ' under=', slagUnder);
console.log('slag under x 桶:', [...slagX.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k * 50}:${v}`).join(' '));
process.exit(0);
