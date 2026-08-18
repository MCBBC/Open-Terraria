// XXX 批副产物：s12345 祭坛 extra=2 取证——(2411,580)/(429,659) 两坛 JS 独有。
// 读 vanilla wld 与 JS 世界该处 3×2+底行全通道（active/type/wall/slope/half/wire位/liq）。
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const RUN = !!process.env.SW_XA12;
const CELLS: Array<[number, number]> = [[2412, 581], [430, 660]];

const SHEET = new Int32Array(TILE_DEFS.length).fill(-2);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

(RUN ? it : it.skip)('s12345 altar extra forensic', async () => {
  const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
  const world = await generateWorld({ size: 0, width: 4200, height: 1200, seedText: '12345', evil: 1 });
  const st = world.store;
  const w = 4200, h = 1200;

  const dump = (label: string, van: boolean) => {
    for (const [ax, ay] of CELLS) {
      console.log(`—— ${label} 祭坛锚 (${ax},${ay})（3×2 区域 y-1..y + 底行 y+1）：`);
      for (let dy = -2; dy <= 1; dy++) {
        const row: string[] = [];
        for (let dx = -1; dx <= 1; dx++) {
          const x = ax + dx, y = ay + dy;
          const i = y * w + x;
          let act: number, type: number, wall: number, slope: number, half: number, wire: number, liq: number;
          if (van) {
            const t = wld.tiles;
            act = t.active[i]; type = t.type[i]; wall = t.wall[i]; slope = t.slope[i]; half = t.half[i];
            wire = t.wire[i]; liq = t.liquid[i];
          } else {
            act = st.flags[i] ? 1 : 0; type = act ? SHEET[st.type[i]] : 0; wall = st.wall[i];
            slope = st.slope[i]; half = st.half[i]; wire = st.wire[i]; liq = st.liquid[i];
          }
          row.push(`(${x},${y}) a=${act} t=${type} w=${wall} sl=${slope} hb=${half} wir=${wire}(inAct=${(wire >> 5) & 1}) lq=${liq}`);
        }
        console.log('   y' + (ay + dy) + ': ' + row.join(' | '));
      }
    }
  };
  dump('vanilla', true);
  dump('js', false);

  const van: string[] = [], js: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (wld.tiles.active[i] === 1 && wld.tiles.type[i] === 26) van.push(`${x},${y}`);
    if (st.type[i] !== 0 && SHEET[st.type[i]] === 26) js.push(`${x},${y}`);
  }
  const vs = new Set(van), js2 = new Set(js);
  console.log(`altars: vanilla=${van.length} js=${js.length} 共同=${van.filter((k) => js2.has(k)).length}`);
  console.log('仅vanilla:', van.filter((k) => !js2.has(k)).join(' '));
  console.log('仅JS    :', js.filter((k) => !vs.has(k)).join(' '));
}, 600000);
