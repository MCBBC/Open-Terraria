// ★629:mod pass 同输入重放判卷 harness
// 输入=探针 pre 快照(C# id 空间)→映射到本仓内部 id 空间→跑我方 pass fn→对拍 post 快照
// 判卷域=本 pass 的 mod tile 增量(逐格位置+计数);流相位 N 走可观测反推(首掷二分)
// 用法:node /tmp/replay-harness.mjs <preSnap.gz> <postSnap.gz> <passName>
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const root = process.env.SW_GAME_ROOT ?? process.cwd();
process.chdir(root);

// ---- 引擎面 ----
const { TILE_DEFS, TILE_BY_KEY, registerModTile } = await import('../src/data/tiles.ts');
// mod tile 注册(1030+ 同型)
{
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try { registerModTile({ key: `mod_calamity_${f.replace('.json', '')}`, name: '' }, nextId++); } catch { /* skip */ }
  }
}

// ---- 探针快照读入(x 主序转行主序;gzip) ----
const LOGS = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
function loadSnap(pattern: string): { type: Uint16Array; wall: Uint16Array } {
  const f = readdirSync(LOGS).find((x) => x.includes(pattern) && x.endsWith('.bin.gz'));
  if (!f) throw new Error(`快照未找到: ${pattern}`);
  const buf = gunzipSync(readFileSync(join(LOGS, f)));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const o = (x * h + y) * 4;
      type[y * w + x] = buf[o] | (buf[o + 1] << 8);
      wall[y * w + x] = buf[o + 2] | (buf[o + 3] << 8);
    }
  }
  return { type, wall };
}

// ---- C# id → 本仓内部 id 映射 ----
// vanilla:sheet→内部(首个命中);mod:运行时 id→名(终版 .twld tileMap)→本仓键
const SHEET_TO_INTERNAL = new Map<number, number>();
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !SHEET_TO_INTERNAL.has(d.vanilla.sheet)) SHEET_TO_INTERNAL.set(d.vanilla.sheet, i);
}
// mod 名表(从 golden-oracle 的终版 .twld tileMap——value=运行时 id↔name)
const ORACLE = JSON.parse(readFileSync(`${root}/mods/calamity/golden-oracle/oracle.json`, 'utf8')) as {
  counts: Record<string, number>;
};
// 运行时 id→名:需 tileMap——从终版 twld 提取(复用 oracle 提取器逻辑的最小子集)
import { gunzipSync as gz2 } from 'node:zlib';
class BER {
  off = 0;
  constructor(public b: Uint8Array) {}
  u8() { return this.b[this.off++]; }
  i16() { const v = (this.b[this.off] << 8) | this.b[this.off + 1]; this.off += 2; return (v << 16) >> 16; }
  i32() { const v = ((this.b[this.off] << 24) | (this.b[this.off + 1] << 16) | (this.b[this.off + 2] << 8) | this.b[this.off + 3]) | 0; this.off += 4; return v; }
  bytes(n: number) { const s = this.b.subarray(this.off, this.off + n); this.off += n; return s; }
  str() { const n = this.i16(); return Buffer.from(this.bytes(n)).toString('utf8'); }
}
function payload(id: number, r: BER): unknown {
  switch (id) {
    case 1: return r.u8(); case 2: return r.i16(); case 3: return r.i32();
    case 4: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 5: { const v = r.i32(); return new Float32Array(new Int32Array([v]).buffer)[0]; }
    case 6: { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(r.b[r.off + i]); r.off += 8; return v; }
    case 7: return r.bytes(r.i32()); case 8: return r.str();
    case 9: { const e = r.u8(), n = r.i32(); const o: unknown[] = []; for (let i = 0; i < n; i++) o.push(payload(e, r)); return o; }
    case 10: { const t: Array<{ t: number; name: string; v: unknown }> = []; for (;;) { if (r.off >= r.b.length) break; const id2 = r.u8(); if (id2 === 0) break; const name = r.str(); t.push({ t: id2, name, v: payload(id2, r) }); } return t; }
    case 11: { const n = r.i32(); const o: number[] = []; for (let i = 0; i < n; i++) o.push(r.i32()); return o; }
    default: throw new Error('pid ' + id);
  }
}
const MOD_ID_TO_NAME = new Map<number, string>();
{
  const twld = gz2(readFileSync(`${root}/mods/calamity/golden-oracle/golden-calamity.twld`));
  const r = new BER(twld);
  // ★root 帧=「byte id 10 + short 名长 + 名 + payload」——直接 payload(10) 会把名长
  //  字节当子 tag 读出空 compound
  const rootId = r.u8();
  const rootName = r.str();
  void rootId; void rootName;
  const root0 = payload(10, r) as Array<{ t: number; name: string; v: unknown }>;
  const tiles = (root0.find((t) => t.name === 'tiles')?.v ?? []) as Array<{ t: number; name: string; v: unknown }>;
  const tileMap = tiles.find((t) => t.name === 'tileMap')?.v as unknown[];
  for (const e of tileMap) {
    const f = (Array.isArray(e) ? e : (e as { v: unknown }).v) as Array<{ name: string; v: unknown }>;
    const get = (nm: string) => f.find((x) => x.name === nm)?.v;
    MOD_ID_TO_NAME.set(Number(get('value')), String(get('name')));
  }
  console.log(`[replay] mod 名表 ${MOD_ID_TO_NAME.size} 条`);
}

// C# 格 → 本仓内部 id(0=air;mod tile=本仓 1030+ 域;未知 mod=0x7ffe 哨兵)
const CS_TO_OURS = (cs: number): number => {
  if (cs === 0) return 0;
  if (cs < 753) return SHEET_TO_INTERNAL.get(cs) ?? 0x7fff;
  const name = MOD_ID_TO_NAME.get(cs);
  if (!name) return 0x7fff;
  const snake = name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  return TILE_BY_KEY[`mod_calamity_${snake}`] ?? 0x7fff;
};

// ---- 构建重放 store(最小面:gen pass 用到的读写面) ----
const w = 4200, h = 1200, n = w * h;
function buildStore(snap: { type: Uint16Array; wall: Uint16Array }) {
  const type = new Uint16Array(n), flags = new Uint8Array(n);
  const wall = new Uint16Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n);
  const wire = new Uint8Array(n), half = new Uint8Array(n), slope = new Uint8Array(n);
  const frameX = new Uint16Array(n), frameY = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    const t = CS_TO_OURS(snap.type[i]);
    type[i] = t === 0x7fff ? 0 : t;
    flags[i] = t !== 0 && t !== 0x7fff ? 1 : 0;
    wall[i] = snap.wall[i];   // 墙=C# 墙 id 直存(本仓墙域=原版 id 同构)
  }
  return {
    w, h, type, flags, wall, liquid, liquidType, wire, half, slope, frameX, frameY,
    idx(x: number, y: number) { return y * w + x; },
    get(x: number, y: number) { return type[y * w + x]; },
    setTile(x: number, y: number, t: number, fx = 0, fy = 0) {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      const i = y * w + x;
      type[i] = t; flags[i] = t !== 0 ? 1 : 0; frameX[i] = fx; frameY[i] = fy;
    },
    setTileSilent(x: number, y: number, t: number, fx = 0, fy = 0) { this.setTile(x, y, t, fx, fy); },
    hasTile(x: number, y: number) { return (flags[y * w + x] & 1) !== 0; },
    purgeGhostTiles() { return 0; },
  };
}

// ---- 判卷:pre/post 的 mod 格差=真实 pass 输出;我方跑 pre 后的 mod 格差=我方输出 ----
function modCells(snap: { type: Uint16Array }): Map<number, number> {
  const m = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const cs = snap.type[i];
    if (cs >= 753) m.set(i, cs);
  }
  return m;
}

const [prePat, postPat, passName] = [process.argv[2], process.argv[3], process.argv[4] ?? 'Sulphur Sea'];
const pre = loadSnap(prePat);
const post = loadSnap(postPat);
const realOut = modCells(post);
const preCells = modCells(pre);
console.log(`[replay] ${passName}: pre mod 格=${preCells.size} post mod 格=${realOut.size}`);
const realAdded = new Map<number, number>();
for (const [i, cs] of realOut) if (!preCells.has(i)) realAdded.set(i, cs);
console.log(`[replay] 真实 pass 新增 mod 格=${realAdded.size}`);
// 类型分布(真实新增)
const byName = new Map<string, number>();
for (const [, cs] of realAdded) {
  const nm = MOD_ID_TO_NAME.get(cs) ?? `?${cs}`;
  byName.set(nm, (byName.get(nm) ?? 0) + 1);
}
console.log('[replay] 真实新增类型 TOP15:', [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${k}:${v}`).join(' '));

// ---- 我方 pass 执行(从 mods/calamity/src/gen.ts 加载;流相位 N=argv[5] 可选) ----
const pass = (globalThis as { __replayPasses?: Map<string, (...a: unknown[]) => void> }).__replayPasses;
void pass;
console.log('[replay] 我方 pass 执行面接入待 gen.ts 域文件集成(子代理产出后)');
process.exit(0);
