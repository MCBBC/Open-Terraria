// FFFF 批（2026-08-18）一次性验证：Dome 入口体移植后 s12345 地牢盒对拍
// /tmp/vserver86/s12345.wld（x86 基线，只读）。口径 = AAAA 批 _aaaareprobe：
// dungeonX±170 × dungeonY±180（341×361=123,101 格），typ 残差（sheet 空间，
// inactive 归零）+ wal 残差 + 双向 pair top + 门/墙 94/95 指纹 + 全图祭坛扫描。
// 跑法：SW_FFFF=1 npx vitest run tools/_ffffprobe.test.ts（纯 node 无需 server）
import { describe, it } from 'vitest';
const RUN = !!process.env.SW_FFFF;
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
SHEET[0] = 0;

describe.skipIf(!RUN)('FFFF dome s12345', () => {
  it('dungeon box + altars', async () => {
    const wld = parseWld(new Uint8Array(readFileSync('/tmp/vserver86/s12345.wld')));
    const world = await generateWorld({
      width: wld.tilesWide, height: wld.tilesHigh, seedText: '12345', evil: 1, name: 'ffff',
    });
    const st = world.store;
    console.log(`ANCHOR js=(${world.dungeonX},${world.dungeonY}) wld=(${wld.dungeonX},${wld.dungeonY})`);
    const dgX = wld.dungeonX, dgY = wld.dungeonY;      // x86 头锚（3413,190）
    const x0 = dgX - 170, x1 = dgX + 170, y0 = dgY - 180, y1 = dgY + 180;
    const N = (x1 - x0 + 1) * (y1 - y0 + 1);
    let dT = 0, dW = 0, dA = 0;
    const pT = new Map<string, number>(), pW = new Map<string, number>();
    for (let y = Math.max(0, y0); y <= Math.min(st.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(st.w - 1, x1); x++) {
        const i = st.idx(x, y), k = y * st.w + x;
        const jt = st.flags[i] ? SHEET[st.type[i]] : 0;
        const vt = wld.tiles.active[k] ? wld.tiles.type[k] : 0;
        const jw = st.wall[i], vw = wld.tiles.wall[k];
        if (jt !== vt) { dT++; pT.set(`${jt}>${vt}`, (pT.get(`${jt}>${vt}`) ?? 0) + 1); }
        if (jw !== vw) { dW++; pW.set(`${jw}>${vw}`, (pW.get(`${jw}>${vw}`) ?? 0) + 1); }
        if ((st.flags[i] ? 1 : 0) !== (wld.tiles.active[k] ? 1 : 0)) dA++;
      }
    }
    const top = (m: Map<string, number>, n: number): string =>
      [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
        .map(([k, v]) => `${k}×${v}`).join(' ');
    console.log(`BOX ${x0}..${x1} × ${y0}..${y1} (${N} 格): typDiff=${dT} (${(100 * dT / N).toFixed(2)}%) walDiff=${dW} (${(100 * dW / N).toFixed(2)}%) actDiff=${dA}`);
    console.log(`TYP pairs: ${top(pT, 14)}`);
    console.log(`WAL pairs: ${top(pW, 14)}`);
    // 门对（tile 10 closed door family）与墙 94/95 指纹
    let door95 = 0;
    pT.forEach((v, k) => { const a = k.split('>'); if (a[0] === '10' || a[1] === '10' || a[0] === '11' || a[1] === '11') door95 += v; });
    console.log(`DOOR(10/11) pairs total: ${door95}`);
    let w9495 = 0;
    pW.forEach((v, k) => { const a = k.split('>').map(Number); if ((a[0] === 94 || a[0] === 95) && (a[1] === 94 || a[1] === 95)) w9495 += v; });
    console.log(`WALL 94<->95 swap total: ${w9495}`);
    // 全图祭坛扫描（v_26_altars sheet 26）
    const ALT = TILE_INTERNAL_BY_SHEET.get(26)!;
    const jAlt: string[] = [], vAlt: string[] = [];
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = y * st.w + x;
        if (st.flags[st.idx(x, y)] && SHEET[st.type[st.idx(x, y)]] === 26) jAlt.push(`${x},${y}`);
        if (wld.tiles.active[i] && wld.tiles.type[i] === 26) vAlt.push(`${x},${y}`);
      }
    }
    const js = new Set(jAlt), vs = new Set(vAlt);
    const extra = jAlt.filter((a) => !vs.has(a)), miss = vAlt.filter((a) => !js.has(a));
    console.log(`ALTARS js=${jAlt.length} wld=${vAlt.length} extra=${JSON.stringify(extra)} miss=${JSON.stringify(miss)}`);
  }, 600000);
});
