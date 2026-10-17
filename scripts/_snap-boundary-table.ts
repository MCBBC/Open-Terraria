// ★699bz-4(+208 sand 审计→全链终局对账):真链 A 系列 154 快照的逐边界 12 键计数表。
//   边界=mod pass 前后(106 Sunken Sea/111 Sulphur Sea/117 Brimstone/119 Aerialite/
//   120 Draedon/121 Abyss/122 Sulphur Sea 2/123 Iron Ball/124 Planetoids/125 终局)。
//   一次性诊断(_ 前缀,经 run-diag)。
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname.replace(/\/scripts\/$/, '/');

// BER(_replay-abyss.ts 同款)
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
    csToKey.set(Number(get('value')), String(get('name')).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase());
  }
}
const KEYS = ['sulphurous_sand', 'abyss_gravel', 'sulphurous_shale', 'voidstone', 'scoria_ore', 'brimstone_slag',
  'infernal_suevite', 'aerialite_ore_disenchanted', 'abyss_treasure_chest', 'void_chest', 'astral_chest_locked'];
const keyToCs = new Map<string, number>();
for (const [cs, k] of csToKey) if (KEYS.includes(k)) keyToCs.set(k, cs);

const dir = '/tmp/deent-snaps-A';
const files = readdirSync(dir).filter((x) => x.endsWith('.bin.gz')).sort();
const BOUNDS = ['pre-Aerialite', 'pre-Draedon_Structures', 'post-Abyss', 'pre-Sunken_Sea', 'pre-Sulphur_Sea', 'pre-Brimstone_Crag',
  'pre-Aerialite', 'pre-Draedon', 'pre-Abyss', 'pre-Sulphur_Sea_2', 'pre-Iron_Ball', 'pre-Planetoids', 'post-Final_Cleanup'];
const w = 4200, h = 1200, n = w * h;
const rows: string[] = [];
rows.push('boundary\t' + KEYS.join('\t'));
for (const f of files) {
  const nm = f.replace('genprobe-snap-', '').replace('.bin.gz', '');
  const tail = nm.replace(/^\d+-/, '');
  if (!BOUNDS.includes(tail)) continue;
  const buf = gunzipSync(readFileSync(join(dir, f)));
  const stride = buf.length >= n * 5 ? 5 : 4;
  const cnt = new Map<number, number>();
  for (const cs of keyToCs.values()) cnt.set(cs, 0);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * stride;
    const t = buf[o] | (buf[o + 1] << 8);
    const c = cnt.get(t);
    if (c !== undefined) cnt.set(t, c + 1);
  }
  rows.push(nm + '\t' + KEYS.map((k) => cnt.get(keyToCs.get(k)!) ?? 0).join('\t'));
}
console.log(rows.join('\n'));
