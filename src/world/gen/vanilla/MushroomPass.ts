// 原版 pass 20 "Mushroom Patches"(WorldGen.cs:5634 + ShroomPatch L48648)移植。
// 岩层深处放 numMushroomBiomes 个蘑菇生态:ShroomPatch 泥 blob(墙 80 蘑菇),
// 随后泥 59→蘑菇草 70 全图传播(我们的 spreadGrassAll 近似原版逐 tile SpreadGrass)。
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_BY_KEY } from '../../../data/tiles';
import { tileRunner } from './TileRunner';
import { spreadGrassAll } from './Spread';

const MUD = TILE_BY_KEY['mud']!;
const JUNGLE_GRASS = TILE_BY_KEY['v_60_jungle_grass_block']!;
const MUSH_GRASS = TILE_BY_KEY['v_70_mushroom_grass_block']!;
const SNOW = TILE_BY_KEY['snow']!;
const ICE = TILE_BY_KEY['ice']!;
const THIN_ICE = TILE_BY_KEY['thin_ice']!;
const GRANITE = TILE_BY_KEY['v_368_granite_block']!;
const MARBLE = TILE_BY_KEY['v_367_marble_block']!;

export function runMushroomPass(st: TileStore, rng: RNG, gs: GenState): void {
  const { w, h } = st;
  const van = w / 4200;
  // 原版:min(w/700, maxMushroomBiomes=50, WorldGen.cs:111/5637)
  const maxBiomes = Math.min(Math.floor(w / 700), 50);
  const placed: Array<[number, number]> = [];

  for (let n = 0; n < maxBiomes; n++) {
    let attempts = 0;
    while (attempts <= Math.floor(w / 2)) {
      let i = rng.int(Math.floor(w * 0.2), Math.floor(w * 0.8) - 1);
      if (attempts > Math.floor(w / 4)) {
        // 原版（WorldGen.cs:12620）兜底带 = Next(0.025w, 0.975w)——0.25 是 10 倍笔误
        i = rng.int(Math.floor(w * 0.025), Math.floor(w * 0.975) - 1);
      }
      const j = rng.int(gs.rockLevel + 50, h - 301);
      // 区域检查:避开雪/冰/丛林/花岗岩/大理石与已放蘑菇(原版 100/500 距离)
      let bad = false;
      for (let x = i - 100; x < i + 100 && !bad; x += 3) {
        for (let y = j - 100; y < j + 100; y += 3) {
          if (!st.inBounds(x, y)) { bad = true; break; }
          const t = st.type[st.idx(x, y)];
          if (t === SNOW || t === ICE || t === THIN_ICE || t === JUNGLE_GRASS || t === GRANITE || t === MARBLE) { bad = true; break; }
          // 原版:落在地下沙漠范围内也重掷(cs L5673)
          if (gs.undergroundDesert && x >= gs.undergroundDesert.x0 && x <= gs.undergroundDesert.x1
            && y >= gs.undergroundDesert.y0 && y <= gs.undergroundDesert.y1) { bad = true; break; }
        }
      }
      if (!bad) {
        for (const [px, py] of placed) {
          if (Math.hypot(px - i, py - j) < 500) { bad = true; break; }
        }
      }
      if (!bad && placed.length < maxBiomes) {
        shroomPatch(st, rng, gs, i, j, van);
        for (let k = 0; k < 5; k++) shroomPatch(st, rng, gs, i + rng.int(-40, 40), j + rng.int(-40, 40), van);
        placed.push([i, j]);
        break;
      }
      attempts++;
    }
  }
  // 泥→蘑菇草传播
  spreadGrassAll(st, MUD, MUSH_GRASS);
}

/** ShroomPatch(WorldGen.cs:48648)1:1:泥 blob 随机走,中心上空挖空,墙→80,尾端泥 runner */
function shroomPatch(st: TileStore, rng: RNG, gs: GenState, i: number, j: number, van: number): void {
  let stepsLeft = rng.int(80, 99);
  let radius = rng.int(20, 25) * van;
  const startR = radius;
  let px = i + 0.0, py = j - radius * 0.3;
  let vx = rng.int(-100, 100) * 0.005;
  let vy = rng.int(-200, -101) * 0.005;
  while (stepsLeft > 0 && radius > 0) {
    stepsLeft -= rng.int(0, 2);
    radius--;
    const x0 = Math.max(0, Math.floor(px - stepsLeft * 0.5));
    const x1 = Math.min(st.w, Math.floor(px + stepsLeft * 0.5));
    const y0 = Math.max(0, Math.floor(py - stepsLeft * 0.5));
    const y1 = Math.min(st.h, Math.floor(py + stepsLeft * 0.5));
    const r = stepsLeft * rng.int(80, 119) * 0.01;
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        const d = Math.hypot(x - px, (y - py) * 2.3);
        const ti = st.idx(x, y);
        if (d < r * 0.8 && st.liquidType[ti] === 2) st.liquid[ti] = 0;
        if (d < r * 0.2 && y < py) {
          st.type[ti] = 0; st.flags[ti] = 0;
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        } else if (d < r * 0.4 * (0.95 + rng.next() * 0.1)) {
          st.type[ti] = MUD;
          if (radius === startR && y > py) st.flags[ti] = 1;
          if (st.wall[ti] > 0) st.wall[ti] = 80;
        }
      }
    }
    px += vx; py += vy;
    px += vx;
    vx += rng.int(-100, 109) * 0.005;
    vy -= rng.int(0, 109) * 0.005;
    if (vx > -0.5 && vx < 0.5) vx = vx >= 0 ? 0.5 : -0.5;
    vx = Math.max(-0.5, Math.min(0.5, vx));
    vy = Math.max(-0.5, Math.min(0.5, vy));
    // 尾端两支向下泥 runner(cs L48722-48729:落点无界重掷)
    for (let k = 0; k < 2; k++) {
      let i1 = Math.floor(px) + rng.int(-20, 19);
      let j1 = Math.floor(py) + rng.int(0, 19);
      let found = false;
      while (!found) {
        if (!st.inBounds(i1, j1)) { found = true; break; }  // 越界保护,跳过本支
        if (st.flags[st.idx(i1, j1)] || st.type[st.idx(i1, j1)] === MUD) { found = true; break; }
        i1 = Math.floor(px) + rng.int(-20, 19);
        j1 = Math.floor(py) + rng.int(0, 19);
      }
      if (!st.inBounds(i1, j1)) continue;
      tileRunner(st, rng, gs, i1, j1, { strength: rng.int(10, 19), steps: rng.int(10, 19), type: MUD, speedY: 2, noYChange: true });
    }
  }
}
