// 一次性诊断:种子12345 地牢走廊被裂砖(482)堵死 —— 全图扫 482 质量块分布 + 走廊连通抽样
import { describe, it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';

const sheet = (id: number) => TILE_DEFS[id]?.vanilla?.sheet ?? -1;

describe('地牢裂砖堵路诊断', () => {
  it('seed 12345: 扫描地牢区 482 分布与横向堵路列', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '12345', evil: 0 });
    const st = world.store;
    const CB = TILE_BY_KEY['v_482_cracked_green_brick']!;
    const dX = world.dungeonX ?? 0;
    console.log('dungeonX =', dX, 'groundLevel =', world.groundLevel);
    // 482 全图计数
    let total = 0;
    for (let i = 0; i < st.type.length; i++) if (st.type[i] === CB) total++;
    console.log('482 全图块数 =', total);
    // 地牢砖族(x ∈ [dX-80, dX+80], y ∈ [groundLevel-50, rockLevel+200])逐行扫描:
    // 找"空气列→482 大块"的堵路形态:对每行 y,找连续 ≥6 个 482 的水平段
    const y0 = Math.max(1, Math.floor(world.groundLevel) - 60);
    const y1 = Math.min(st.h - 1, Math.floor(world.rockLevel) + 260);
    const x0 = Math.max(1, dX - 100), x1 = Math.min(st.w - 2, dX + 100);
    const segs: Array<[number, number, number]> = [];
    for (let y = y0; y < y1; y++) {
      let run = 0, sx = -1;
      for (let x = x0; x <= x1; x++) {
        const i = st.idx(x, y);
        if (st.type[i] === CB) { if (run === 0) sx = x; run++; }
        else { if (run >= 6) segs.push([y, sx, x - 1]); run = 0; }
      }
      if (run >= 6) segs.push([y, sx, x1]);
    }
    console.log('水平连续≥6的 482 段数:', segs.length);
    console.log(JSON.stringify(segs.slice(0, 25)));
    // 每 50 行打印该行地牢砖族构成概览(41/43/44/482 占比)
    for (let y = y0; y < y1; y += 50) {
      const cnt: Record<number, number> = {};
      let air = 0;
      for (let x = x0; x < x1; x++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) air++;
        else { const s = sheet(st.type[i]); cnt[s] = (cnt[s] ?? 0) + 1; }
      }
      console.log(`y=${y} air=${air}`, JSON.stringify(cnt));
    }
  }, 300000);
});
