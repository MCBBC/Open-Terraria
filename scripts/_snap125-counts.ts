// ★699bz-4(+208 sand 审计):真链全链终局 oracle(snap-125-post-Final_Cleanup,
//   A 系列同链直证:01/02 FNV=c618ee8c/15cca3d6 全等 CG 锚)的 12 键计数——与
//   金标第 29 代逐键对账。一次性诊断(_ 前缀,经 run-diag)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/\/scripts\/$/, '/');
const { TILE_BY_KEY } = await import('../src/data/tiles.ts');

// BER 解码(_replay-abyss.ts 同款逐字复制)
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
// census:cs id → snake key
const csToKey = new Map<number, string>();
{
  const twld = gunzipSync(readFileSync(`${root}mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  r.u8(); r.str();
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    const snake = String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    csToKey.set(Number(get('value')), snake);
  }
}

// snap-125 计数
const dir = '/tmp/deent-snaps-A';
const f = readdirSync(dir).filter((x) => x.endsWith('post-Final_Cleanup.bin.gz')).sort().pop();
if (!f) throw new Error('snap-125 not found');
const buf = gunzipSync(readFileSync(join(dir, f)));
const w = 4200, h = 1200, n = w * h;
const stride = buf.length >= n * 5 ? 5 : 4;
const cnt = new Map<number, number>();
for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
  const o = (x * h + y) * stride;
  const t = buf[o] | (buf[o + 1] << 8);
  cnt.set(t, (cnt.get(t) ?? 0) + 1);
}
console.log(`[snap125] ${f} stride=${stride} distinct=${cnt.size}`);
const KEYS = ['sulphurous_sand', 'abyss_gravel', 'sulphurous_shale', 'voidstone', 'scoria_ore', 'brimstone_slag',
  'infernal_suevite', 'aerialite_ore_disenchanted', 'astral_dirt', 'abyss_treasure_chest', 'void_chest', 'astral_chest_locked'];
const out: Record<string, number> = {};
for (const [cs, key] of csToKey) if (KEYS.includes(key)) out[key] = cnt.get(cs) ?? 0;
console.log('[snap125] 真链终局 12 键计数:', JSON.stringify(out));
// 顺带:cs≥693 全集计数(未映射型审计)
const unmapped: Array<[number, number]> = [];
for (const [cs, c] of cnt) if (cs >= 693 && !csToKey.has(cs)) unmapped.push([cs, c]);
unmapped.sort((a, b) => b[1] - a[1]);
console.log('[snap125] census 未映射 cs≥693(top20):', unmapped.slice(0, 20).map(([cs, c]) => `${cs}×${c}`).join(' '));
