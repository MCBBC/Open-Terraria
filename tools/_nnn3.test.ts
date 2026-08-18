// NNN 批遗留三件终修 · 对拍探针（2026-08-18）
// ①岛屋家具（桌14/椅15/门10·11/横幅91/宝箱21）位置+帧 vs 金标 12345
// ②地牢 banner 91 frameX 分布（金标 vs JS）
// ③地表/地牢门 tile 全表对比（找 8 格缺口）
// 跑法：npx vitest run tools/_nnn3.test.ts
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWorld } from '../src/world/gen/WorldGen';
import { parseWld } from '../src/wld/WldParser';
import { TILE_DEFS } from '../src/data/tiles';

const SHEET = new Int32Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}

interface Side {
  name: string;
  w: number; h: number;
  act: Uint8Array; van: Int32Array; fx: Uint16Array; fy: Uint16Array; wall: Uint16Array;
}

const fromGolden = (file: string): Side => {
  const g = parseWld(new Uint8Array(readFileSync(file)));
  console.log(`[meta ${file.split('/').pop()}] v=${g.version} ${g.tilesWide}x${g.tilesHigh} seed="${g.seed}" crimson=${g.isCrimson} mode=${g.gameMode} spawn=(${g.spawnX},${g.spawnY}) dungeon=(${g.dungeonX},${g.dungeonY}) ground=${g.groundLevel} rock=${g.rockLevel}`);
  const n = g.tilesWide * g.tilesHigh;
  return {
    name: 'golden', w: g.tilesWide, h: g.tilesHigh,
    act: g.tiles.active, van: g.tiles.type as unknown as Int32Array,
    fx: g.tiles.frameX, fy: g.tiles.frameY, wall: g.tiles.wall,
  };
};

describe('NNN 批遗留三件 · 金标 12345 对拍', { timeout: 600_000 }, () => {
  it('岛屋/横幅/门 三通道对拍', async () => {
    const G = fromGolden('tests/golden/wld/12345世界.wld');
    const meta = parseWld(new Uint8Array(readFileSync('tests/golden/wld/12345世界.wld')));
    const ours = await generateWorld({ width: G.w, height: G.h, seedText: meta.seed, name: 'nnn' });
    const st = ours.store;
    const J: Side = {
      name: 'js', w: st.w, h: st.h,
      act: st.flags, van: new Int32Array(st.w * st.h), fx: st.frameX as unknown as Uint16Array,
      fy: st.frameY as unknown as Uint16Array, wall: st.wall,
    };
    for (let i = 0; i < J.w * J.h; i++) J.van[i] = SHEET[st.type[i]] ?? -1;

    // ---------- 岛屋：202 日光板聚类 ----------
    const islands = (s: Side) => {
      const pts: Array<[number, number]> = [];
      for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) {
        const i = y * s.w + x;
        if (s.act[i] && s.van[i] === 202) pts.push([x, y]);
      }
      // x-gap>60 分段（岛间距远大于岛宽）
      pts.sort((a, b) => a[0] - b[0]);
      const cl: Array<Array<[number, number]>> = [];
      let cur: Array<[number, number]> = [];
      for (const p of pts) {
        if (cur.length && p[0] - cur[cur.length - 1][0] > 60) { cl.push(cur); cur = []; }
        cur.push(p);
      }
      if (cur.length) cl.push(cur);
      return cl.map((c) => {
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        return { x0, x1, y0, y1, n: c.length };
      }).filter((b) => b.n >= 40);
    };
    const gi = islands(G), ji = islands(J);
    console.log(`[islands] golden=${gi.length} js=${ji.length}`);
    for (let k = 0; k < Math.max(gi.length, ji.length); k++) {
      const a = gi[k], b = ji[k];
      console.log(`  #${k} golden=${a ? `${a.x0}-${a.x1},${a.y0}-${a.y1}(${a.n})` : '-'} js=${b ? `${b.x0}-${b.x1},${b.y0}-${b.y1}(${b.n})` : '-'}`);
    }

    // 家具清单（每岛 bbox 内）：14桌 15椅 10门 91幅 21箱 + 墙82
    const furn = (s: Side, b: { x0: number; x1: number; y0: number; y1: number }) => {
      const out: string[] = [];
      for (let y = b.y0 - 4; y <= b.y1 + 4; y++) for (let x = b.x0 - 4; x <= b.x1 + 4; x++) {
        if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
        const i = y * s.w + x;
        if (!s.act[i]) continue;
        const t = s.van[i];
        if (t === 14 || t === 15 || t === 10 || t === 11 || t === 91 || t === 21)
          out.push(`${t}@${x},${y}[${s.fx[i]},${s.fy[i]}]`);
      }
      return out;
    };
    for (let k = 0; k < Math.max(gi.length, ji.length); k++) {
      const a = gi[k], b = ji[k];
      if (!a && !b) continue;
      const ref = a ?? b!;
      console.log(`  house#${k} golden: ${a ? furn(G, a).join(' ') : '无'}`);
      console.log(`  house#${k} js    : ${b ? furn(J, b).join(' ') : '无'}`);
      if (a && b) {
        // 逐格 diff（type+frame+wall），bbox 并集
        const x0 = Math.min(a.x0, b.x0) - 3, x1 = Math.max(a.x1, b.x1) + 3;
        const y0 = Math.min(a.y0, b.y0) - 3, y1 = Math.max(a.y1, b.y1) + 3;
        let diff = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (x < 0 || y < 0 || x >= G.w || y >= G.h) continue;
          const ia = y * G.w + x, ib = y * J.w + x;
          const ga = G.act[ia] ? G.van[ia] : -1, ja = J.act[ib] ? J.van[ib] : -1;
          if (ga !== ja || (ga !== -1 && (G.fx[ia] !== J.fx[ib] || G.fy[ia] !== J.fy[ib]))) {
            if (diff++ < 60) console.log(`    D ${x},${y} g=${ga}[${G.fx[ia]},${G.fy[ia]}]w${G.wall[ia]} j=${ja}[${J.fx[ib]},${J.fy[ib]}]w${J.wall[ib]}`);
          }
        }
        console.log(`    island#${k} bbox diff=${diff}`);
      }
    }

    // ---------- banner 91：地牢墙邻域全表 ----------
    const bannerStat = (s: Side) => {
      let n = 0;
      const fxHist = new Map<number, number>();
      const zeroAt: string[] = [];
      for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) {
        const i = y * s.w + x;
        if (s.act[i] && s.van[i] === 91) {
          n++;
          fxHist.set(s.fx[i], (fxHist.get(s.fx[i]) ?? 0) + 1);
          if (zeroAt.length < 5 && s.fx[i] === 0) zeroAt.push(`${x},${y}`);
        }
      }
      return { n, fxHist: [...fxHist.entries()].sort((a, b) => a[0] - b[0]), zeroAt };
    };
    const gb = bannerStat(G), jb = bannerStat(J);
    console.log(`[banner91] golden n=${gb.n} fx=${JSON.stringify(gb.fxHist)}`);
    console.log(`[banner91] js     n=${jb.n} fx=${JSON.stringify(jb.fxHist)} zero@${jb.zeroAt.join(' ')}`);

    // ---------- 门 10/11：全表位置 ----------
    const doors = (s: Side) => {
      const out: string[] = [];
      for (let x = 0; x < s.w; x++) for (let y = 0; y < s.h; y++) {
        const i = y * s.w + x;
        if (s.act[i] && (s.van[i] === 10 || s.van[i] === 11)) out.push(`${s.van[i] === 10 ? 'C' : 'O'}${x},${y}[${s.fx[i]},${s.fy[i]}]`);
      }
      return out;
    };
    const gd = doors(G), jd = doors(J);
    const gset = new Set(gd.map((d) => d.slice(1).split('[')[0]));
    const jset = new Set(jd.map((d) => d.slice(1).split('[')[0]));
    console.log(`[doors] golden n=${gd.length} js n=${jd.length}`);
    const gOnly = [...gset].filter((p) => !jset.has(p));
    const jOnly = [...jset].filter((p) => !gset.has(p));
    console.log(`  golden-only pos: ${gOnly.join(' ')}`);
    console.log(`  js-only pos: ${jOnly.join(' ')}`);
    // 帧差（同位置）
    const gmap = new Map(gd.map((d) => [d.slice(1).split('[')[0], d] as [string, string]));
    for (const d of jd) {
      const p = d.slice(1).split('[')[0];
      const g = gmap.get(p);
      if (g && g !== d) console.log(`  frame差 @${p}: golden=${g} js=${d}`);
    }
  });
});
