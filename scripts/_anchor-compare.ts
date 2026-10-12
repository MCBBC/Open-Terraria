// ★628:锚点对比仪——本仓引擎逐 pass 状态 vs 实跑探针快照(双方都映射到 C# sheet 空间)
// 用法:node /tmp/anchor-compare.mjs <probeSnapDir>
// 本仓侧:onWorldPartial 逐 pass 落 sheet 空间 type 流快照(内存内),按序对探针快照求 FNV 并找首分歧
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS, registerModTile } from '../src/data/tiles';

const snapDir = process.argv[2] ?? '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
// mod tile 注册(探针快照里 mod tile 用 C# id 761-1916;本仓映射只对 vanilla——
// vanilla 面对比阶段 mod 格置 0xFFF0 哨兵即可分辨)
const root = process.env.SW_GAME_ROOT ?? process.cwd();
try {
  let nextId = 1030;
  for (const f of readdirSync(`${root}/mods/calamity/content/tiles`).sort()) {
    if (!f.endsWith('.json')) continue;
    try { registerModTile({ key: `mod_calamity_${f.replace('.json', '')}`, name: '' }, nextId++); } catch { /* skip */ }
  }
} catch { /* no dir */ }

// ---- 探针快照读入(x 主序:每格 [type u16 LE][wall u16 LE]) ----
const snaps: Array<{ name: string; type: Uint16Array; wall: Uint16Array }> = [];
for (const f of readdirSync(snapDir).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin')) continue;
  const buf = readFileSync(join(snapDir, f));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n), wall = new Uint16Array(n);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = x * h + y, o = i * 4;
      type[i] = buf[o] | (buf[o + 1] << 8);
      wall[i] = buf[o + 2] | (buf[o + 3] << 8);
    }
  }
  snaps.push({ name: f.replace(/^genprobe-snap-\d+-/, '').replace('.bin', ''), type, wall });
}
console.log(`[cmp] 探针快照 ${snaps.length} 个:`, snaps.map(s => s.name).join(', '));

// 本仓 type(内部 id)→C# sheet 映射表
const SHEET_OF = new Uint16Array(TILE_DEFS.length);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  SHEET_OF[i] = d?.vanilla ? d.vanilla.sheet : 0xfff0;   // mod tile=哨兵(不可比)
}

const fnv = (arr: Uint16Array, x0: number, x1: number): string => {
  let h = 0x811c9dc5;
  for (let i = x0; i < x1; i++) {
    const v = arr[i];
    h ^= v & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

// ---- 本仓引擎逐 pass 落快照 ----
const w = 4200, h = 1200, n = w * h;
const oursSheet = new Uint16Array(n);
const ourPasses: Array<{ name: string; fnv: string; diffCells: number; diffFirst?: string }> = [];
let prevSheet = new Uint16Array(n);
const t0 = Date.now();
await generateWorld(
  {
    width: w, height: h, seedText: '9293480', evil: 0,
    onWorldPartial: (world: { store: { type: Uint16Array } }, _passIndex: number, passName: string) => {
      const st = world.store.type;
      for (let i = 0; i < n; i++) oursSheet[i] = SHEET_OF[st[i]] ?? 0;
      let diff = 0, first = '';
      for (let i = 0; i < n; i++) if (oursSheet[i] !== prevSheet[i]) { diff++; if (!first) first = `(${Math.floor(i / h)},${i % h})`; }
      ourPasses.push({ name: passName, fnv: fnv(oursSheet, 0, n), diffCells: diff, diffFirst: diff ? first : undefined });
      prevSheet.set(oursSheet);
    },
  },
);
console.log(`[cmp] 本仓全链 ${((Date.now() - t0) / 1000).toFixed(0)}s ${ourPasses.length} pass`);

// ---- 对齐:探针快照 FNV vs 本仓全部 pass 历史态 FNV——首歧判定 ----
const ourFnvs = new Map<string, string>();
for (const p of ourPasses) if (!ourFnvs.has(p.fnv)) ourFnvs.set(p.fnv, p.name);
let lastMatch = 'Reset(前)';
for (const s of snaps) {
  const sf = fnv(s.type, 0, n);
  const hit = ourFnvs.get(sf);
  if (hit) { lastMatch = `${s.name}==本仓[${hit}]`; console.log(`[cmp] ✓ ${s.name} ↔ 本仓 ${hit}`); }
  else { console.log(`[cmp] ✗ ${s.name} 无全等历史态——首歧在此前`); break; }
}
console.log(`[cmp] 最后全等锚点: ${lastMatch}`);
process.exit(0);
