// FFFF 7>94 墙变体残差定位 + dungeon 出口态全面自检（dome 核心体 8 通道逐格）
// SW_FFFF7=1 npx vitest run tools/_ffffwall.test.ts
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF7;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import type { TileStore } from '../src/world/TileStore';

describe.skipIf(!RUN)('FFFF wall variants + post-dungeon core check', () => {
  it('localize', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    let postDg: TileStore | null = null;
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
      onWorldPartial: (w, _i, name) => { if (name === '生物群系') postDg = w.store; },
    });
    const st = world.store;
    const dgX = wld.dungeonX, dgY = wld.dungeonY;
    // ① 7>94 终态分布（按 x 带 10 格聚类）
    const bands = new Map<number, number>();
    for (let y = Math.max(0, dgY - 180); y <= Math.min(st.h - 1, dgY + 180); y++) {
      for (let x = Math.max(0, dgX - 170); x <= Math.min(st.w - 1, dgX + 170); x++) {
        const k = y * st.w + x;
        const jw = st.wall[st.idx(x, y)], vw = wld.tiles.wall[k];
        if (jw !== vw) {
          const b = Math.trunc((x - dgX) / 10) * 10;
          bands.set(b, (bands.get(b) ?? 0) + 1);
        }
      }
    }
    console.log('WALDIFF x-bands:', [...bands.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(' '));
    // ② dungeon 出口态：dome 核心体（i±45 × n7-52..n7+60）逐格 typ/wal 对拍（跳过
    //    后续 pass 域的装饰——只报差异样本）
    const pd = postDg!;
    let diffs = 0;
    const samples: string[] = [];
    for (let y = dgY - 52; y <= dgY + 60 && y < st.h; y++) {
      for (let x = dgX - 45; x <= dgX + 45; x++) {
        if (y < 0 || x < 0) continue;
        const k = y * st.w + x;
        const pi = pd.idx(x, y);
        const vt = wld.tiles.active[k] ? wld.tiles.type[k] : 0;
        // 内部→sheet 近似：直接比 active+sheet 不可行（pd 是内部 id）——比 wall 与 active
        const vw = wld.tiles.wall[k];
        const jact = pd.flags[pi] ? 1 : 0;
        if (pd.wall[pi] !== vw || jact !== (wld.tiles.active[k] ? 1 : 0)) {
          diffs++;
          if (samples.length < 12) samples.push(`(${x},${y}) act=${jact}/${wld.tiles.active[k] ? 1 : 0} wal=${pd.wall[pi]}/${vw}`);
        }
      }
    }
    console.log(`POST-DG core wal/act diffs=${diffs}: ${samples.join(' ')}`);
  }, 600000);
});
