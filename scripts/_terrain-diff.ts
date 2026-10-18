// ★628b:Terrain 锚点差异解剖——本仓原版地形 pass 后态 vs 探针 Terrain 快照
import { TMOD_LOGS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const KEY_OF = new Map<number, number>();   // sheet → 内部 id(首个命中;vanilla)
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number }; key: string } | undefined;
  if (d?.vanilla && d.vanilla.sheet < 753 && !KEY_OF.has(d.vanilla.sheet)) KEY_OF.set(d.vanilla.sheet, i);
}
const SHEET_OF = new Uint16Array(TILE_DEFS.length);
SHEET_OF[0] = 0;   // ★air 哨兵:内部 0=C# 0(air),不可走哨兵分支
for (let i = 1; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number } } | undefined;
  SHEET_OF[i] = d?.vanilla ? d.vanilla.sheet : 0xfff0;
}
const NAME_OF = new Map<number, string>();   // sheet → 本仓 key
for (let i = 0; i < TILE_DEFS.length; i++) {
  const d = TILE_DEFS[i] as { vanilla?: { sheet: number }; key: string } | undefined;
  if (d?.vanilla && !NAME_OF.has(d.vanilla.sheet)) NAME_OF.set(d.vanilla.sheet, d.key);
}

const buf = readFileSync(needInput(join(TMOD_LOGS, 'genprobe-snap-00-Terrain.bin')));
const w = 4200, h = 1200, n = w * h;
const real = new Uint16Array(n);
for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
  const i = x * h + y, o = i * 4;
  real[i] = buf[o] | (buf[o + 1] << 8);
}

let captured = false;
await generateWorld({
  width: w, height: h, seedText: '9293480', evil: 0,
  onWorldPartial: (world: { store: { type: Uint16Array } }, _i: number, name: string) => {
    if (captured || !name.includes('地形')) return;
    captured = true;
    const st = world.store.type;
    const ours = new Uint16Array(n);
    for (let i = 0; i < n; i++) ours[i] = SHEET_OF[st[i]] ?? 0;
    let diff = 0;
    const samples: string[] = [];
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const i = x * h + y;
        if (ours[i] !== real[i]) {
          diff++;
          if (samples.length < 12) samples.push(`(${x},${y}) 本仓=${ours[i]}[${NAME_OF.get(ours[i]) ?? '?'}] 真实=${real[i]}[${NAME_OF.get(real[i]) ?? '?'}]`);
        }
      }
    }
    console.log(`[tdiff] Terrain 差异格=${diff}/${n}`);
    for (const s of samples) console.log('  ', s);
    process.exit(0);
  },
});
setTimeout(() => { console.log('[tdiff] 超时未捕获'); process.exit(1); }, 180000);
