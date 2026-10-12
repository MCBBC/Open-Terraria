// ★628c:全锚点最优匹配——每个探针快照 vs 本仓全 pass 历史态,报最小逐格差
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET_OF = new Uint16Array(TILE_DEFS.length);
SHEET_OF[0] = 0;
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  SHEET_OF[i] = d?.vanilla ? d.vanilla.sheet : 0xfff0;
}

const snapDir = '/Users/vinlic/Library/Application Support/Terraria/tModLoader/Logs';
const snaps: Array<{ name: string; type: Uint16Array }> = [];
for (const f of readdirSync(snapDir).sort()) {
  if (!f.startsWith('genprobe-snap-') || !f.endsWith('.bin')) continue;
  const buf = readFileSync(join(snapDir, f));
  const w = 4200, h = 1200, n = w * h;
  const type = new Uint16Array(n);
  // ★探针=x 主序(i=x*h+y);本仓=行主序(i=y*w+x)——先转置再比
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const o = (x * h + y) * 4;
    type[y * w + x] = buf[o] | (buf[o + 1] << 8);
  }
  snaps.push({ name: f.replace(/^genprobe-snap-\d+-/, '').replace('.bin', ''), type });
}

const w = 4200, h = 1200, n = w * h;
const oursSheet = new Uint16Array(n);
const states: Array<{ name: string; sheet: Uint16Array }> = [];
await generateWorld({
  width: w, height: h, seedText: '9293480', evil: 0,
  onWorldPartial: (world: { store: { type: Uint16Array } }, _i: number, passName: string) => {
    const st = world.store.type;
    for (let i = 0; i < n; i++) oursSheet[i] = SHEET_OF[st[i]] ?? 0;
    states.push({ name: passName, sheet: oursSheet.slice() });
  },
});
console.log(`[best] 本仓 ${states.length} 个 pass 态`);

for (const s of snaps) {
  let best = { d: Infinity, name: '', sample: '' };
  for (const p of states) {
    let d = 0;
    for (let i = 0; i < n; i++) if (p.sheet[i] !== s.type[i]) d++;
    if (d < best.d) {
      let first = '';
      for (let i = 0; i < n; i++) if (p.sheet[i] !== s.type[i]) { first = `(${Math.floor(i / h)},${i % h}) 本=${p.sheet[i]} 真=${s.type[i]}`; break; }
      best = { d, name: p.name, sample: first };
    }
    if (d === 0) break;
  }
  const pct = ((best.d / n) * 100).toFixed(2);
  console.log(`[best] ${s.name}: 最接近本仓[${best.name}] 差=${best.d}(${pct}%) 首格:${best.sample}`);
}
process.exit(0);
