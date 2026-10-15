// ★699ac-2:熵域 C vs B 带类型迁移矩阵(三样本熵检验)。
// 目的:C(consolidated pass-121 终态)与 B(b 跑 post-Abyss)互 diff 的类型迁移谱,
//   与我方 replay diff(replay-diff-cells.json)逐族对拍——若同族同率,则我方残差
//   =三样本熵特征(第三份独立流采样),非确定性移植差;若某族系统性偏多/偏少,
//   该族=确定性逻辑差(须移植修复)。
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
const { TILE_BY_KEY, TILE_DEFS, registerModTile } = await import('../src/data/tiles.ts');

// mod tile 注册(与 _replay-abyss.ts 同式——键字典序,stableId 1030 起)
{
  let nextId = 1030;
  const tileDir = `${root}/mods/calamity/content/tiles`;
  for (const f of readdirSync(tileDir).sort()) {
    if (!f.endsWith('.json')) continue;
    try {
      const spec = JSON.parse(readFileSync(`${tileDir}/${f}`, 'utf8'));
      registerModTile({
        key: `mod_calamity_${f.replace('.json', '')}`,
        name: spec.name ?? f.replace('.json', ''),
        solid: spec.solid ?? false, platform: spec.platform ?? false, decor: spec.decor ?? false,
        chest: spec.chest ?? false, framed: spec.framed ?? false, w: spec.w, h: spec.h,
        opacity: spec.opacity ?? (spec.solid ? 1 : 0), pick: spec.pick ?? 0, axe: spec.axe ?? -1,
        mapColor: spec.mapColor ?? '#808080',
        blend: spec.frame === 'blend' || spec.frame === 'auto' ? true : false,
        vanilla: { frame: spec.frame ?? 'style', fw: spec.w ?? 1, fh: spec.h ?? 1 },
      }, nextId++);
    } catch { /* skip */ }
  }
}
(globalThis as Record<string, unknown>).__calamityTileDefs = TILE_DEFS;
(globalThis as Record<string, unknown>).__calamityTileIdByKey = TILE_BY_KEY;

// C# id→本仓 internal id(与 _replay-abyss.ts 同式)
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
  console.log('[ent] mod 名映射', MOD_ID_TO_NAME.size);
}
const CS_TO_OURS = (cs: number): number => cs === 0 ? 0 : cs < 753 ? (SHEET_TO_INTERNAL.get(cs) ?? 0) : (MOD_ID_TO_NAME.get(cs) ?? 0);
const KEY_OF = (id: number): string => TILE_DEFS[id]?.key ?? `#${id}`;

function loadSnapAbs(p: string) {
  const buf = gunzipSync(readFileSync(p));
  const w = 4200, h = 1200, n = w * h;
  const stride = buf.length >= n * 5 ? 5 : 4;   // 699ad v2=5 bytes/cell (slope/half trailing byte)
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * stride;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
    wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
  }
  return { type, wall };
}

// C = consolidated 跑 pass-121 终态(snap-121-pre-Abyss;★语义:文件 N=pass N 完成态);
// B = b 跑 pass-121 终态(02-post-Abyss,a3227d38)。
// ★勘误(2026-10-15):b-snaps 的 121-125 pre-* 文件=consolidated 跑产物(混入拷贝),
//   旧对比误用 snap-122(pass-122 输出)——7,244 sand 族=Sulphur Sea 2 足迹,非熵域。
const C = loadSnapAbs('/tmp/genprobe-consolidated-snaps/genprobe-snap-121-pre-Abyss.bin.gz');
const B = loadSnapAbs('/tmp/genprobe-b-snaps/genprobe-snap-02-post-Abyss.bin.gz');
const w = 4200, h = 1200, n = w * h;

const cells: Array<[number, number, string, string]> = [];
const mig = new Map<string, number>();
for (let i = 0; i < n; i++) {
  const ct = CS_TO_OURS(C.type[i]), bt = CS_TO_OURS(B.type[i]);
  if (ct !== bt) {
    cells.push([i % w, Math.floor(i / w), KEY_OF(ct), KEY_OF(bt)]);
    const k = `${KEY_OF(ct)}→${KEY_OF(bt)}`;
    mig.set(k, (mig.get(k) ?? 0) + 1);
  }
}
console.log(`[ent] C vs B diff=${cells.length}`);
writeFileSync('/tmp/entropy-cells-typed.json', JSON.stringify(cells));
console.log('[ent] C→B 迁移 Top20:');
for (const [k, c] of [...mig.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${k}: ${c}`);

// 与我方 diff(replay-diff-cells.json,我→B)对拍:同键迁移率比较
const mine = JSON.parse(readFileSync('/tmp/replay-diff-cells.json', 'utf8')) as Array<[number, number, string, string]>;
const migMine = new Map<string, number>();
for (const [, , a, b2] of mine) { const k = `${a}→${b2}`; migMine.set(k, (migMine.get(k) ?? 0) + 1); }
console.log('[ent] 我方(我→B)迁移 Top20:');
for (const [k, c] of [...migMine.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${k}: ${c}`);

// 逐族比率表(方向归一:X→empty 与 empty→X 合并为族 X 的双向)
const fam = (k: string) => {
  const [a, b2] = k.split('→');
  const strip = (s: string) => s.replace('mod_calamity_', '');
  if (a === 'empty') return `empty↔${strip(b2)}`;
  if (b2 === 'empty') return `${strip(a)}↔empty`;
  return `${strip(a)}↔${strip(b2)}`;
};
const famC = new Map<string, number>(), famM = new Map<string, number>();
for (const [k, c] of mig) famC.set(fam(k), (famC.get(fam(k)) ?? 0) + c);
for (const [k, c] of migMine) famM.set(fam(k), (famM.get(fam(k)) ?? 0) + c);
const all = new Set([...famC.keys(), ...famM.keys()]);
console.log('[ent] 族级对拍(C↔B vs 我↔B;比率>1.5 或差>100=可疑确定性族):');
const rows: Array<[string, number, number, number]> = [];
for (const f of all) rows.push([f, famC.get(f) ?? 0, famM.get(f) ?? 0, (famM.get(f) ?? 0) / Math.max(1, famC.get(f) ?? 1)]);
rows.sort((a, b) => b[1] + b[2] - a[1] - a[2]);
for (const [f, c, m, r] of rows.slice(0, 25)) console.log(`  ${f}: C↔B=${c} 我↔B=${m} 比=${r.toFixed(2)}`);

// 三样本一致性:我方 diff 中「落在 E(C≠B)内」与「E 外(C=B)」的族构成是否同构
const eSet = new Set(cells.map(([x, y]) => y * w + x));
let inE = 0, outE = 0;
const famOut = new Map<string, number>();
for (const [x, y, a, b2] of mine) {
  if (eSet.has(y * w + x)) inE++; else { outE++; const f = fam(`${a}→${b2}`); famOut.set(f, (famOut.get(f) ?? 0) + 1); }
}
console.log(`[ent] 我方 diff: E内=${inE} E外=${outE}`);
console.log('[ent] E外(两真跑同值)族构成 Top12:');
for (const [k, c] of [...famOut.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k}: ${c}`);

// ── 三方总量表:C(consolidated)/B(b)/我方(rr-abyss50 聚合列)逐装饰族总格数 ──
{
  const cnt2 = (t: Uint16Array) => {
    const m = new Map<number, number>();
    for (let i = 0; i < n; i++) { const k = t[i]; if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const Cmap = new Uint16Array(n); for (let i = 0; i < n; i++) Cmap[i] = CS_TO_OURS(C.type[i]);
  const Bmap = new Uint16Array(n); for (let i = 0; i < n; i++) Bmap[i] = CS_TO_OURS(B.type[i]);
  const cc = cnt2(Cmap), bc = cnt2(Bmap);
  // 我方聚合列(rr-abyss50.out 已打印;此处硬载关键族,来源=重放输出)
  const oursAgg: Record<string, number> = {
    sulphurous_vines: 590, abyssal_pots: 560, abyss_coral: 247, planty_mush: 1867,
    viper_vines: 363, abyss_gravel: 36307, thermal_vent1: 30, sulphur_pire_coral1: 45,
    sulphur_pire_coral2: 9, sulphur_pire_coral3: 18, sulphur_tube_coral: 27,
    sulphuric_fossil1: 36, sulphuric_fossil2: 24, sulphuric_fossil3: 18,
    sulphurous_rib1: 40, sulphurous_rib2: 3, sulphurous_rib3: 10, sulphurous_rib4: 27, sulphurous_rib5: 8,
    abyss_giant_kelp1: 50, abyss_giant_kelp2: 40, abyss_giant_kelp3: 48, abyss_giant_kelp4: 30,
    pirate_crate1: 8, pirate_crate2: 8, pirate_crate3: 0, pirate_crate4: 4, pirate_crate5: 0, pirate_crate6: 4,
    spider_coral1: 20, spider_coral2: 24, spider_coral3: 24, spider_coral4: 24, spider_coral5: 12,
    thermal_vent2: 42, thermal_vent3: 6, abyss_vent1: 8, massive_rare_pearl: 14,
    shale_pile1: 30, shale_pile2: 30, shale_pile3: 6, gravel_pile1: 12, gravel_pile2: 18,
    planty_mush_pile1: 30, planty_mush_pile2: 42, planty_mush_pile3: 30,
  };
  console.log('[ent] 三方总量表(族: C | B | 我方):');
  const fams = Object.keys(oursAgg);
  for (const f of fams) {
    const id = TILE_BY_KEY[`mod_calamity_${f}`];
    if (id === undefined) { console.log(`  ${f}: 键缺失`); continue; }
    const cN = cc.get(id) ?? 0, bN = bc.get(id) ?? 0, oN = oursAgg[f];
    console.log(`  ${f}: C=${cN} B=${bN} 我=${oN}  |C-B|=${Math.abs(cN - bN)} |我-B|=${Math.abs(oN - bN)}`);
  }
}
