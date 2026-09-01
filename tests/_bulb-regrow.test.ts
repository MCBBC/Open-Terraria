// 灯泡再生机制进程内闸门(2026-09-01 用户质询「有确保肉后生成了吗」):
//  ① 三王 burst 灯泡在场(链存档导入即有) ② 远距挖除(不召王场景,2×2 整件)
//  ③ 序列化随机驱动真实演化 tick → 再生分支(WorldEvolution:784-794 ↔ cs:74480-74558)
//     落新灯泡 ④ 底承=双列丛林草(fitJunglePairFlat)
// 进程内直驱 WorldEvolution(无渲染/无 dev server,vite 私有实例在本机高载下反复被杀的
// 替代仪表;概率掷序列化=每第 7 次给 0.001,其余 0.9——恒 0 会让顶植物先手占位饿死灯泡门)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const SAVE = '/tmp/chain-save-stage3.json';

describe('灯泡再生机制(肉后+三王)', () => {
  it('burst 在场 → 远距挖除 → 演化 tick 再生 → 底承丛林草', async () => {
    const data = JSON.parse(readFileSync(SAVE, 'utf8'));
    const world = loadSaveData(data as never).world;
    const st = world.store;
    const BULB = TILE_BY_KEY['v_238_plantera_s_bulb'];
    const GRASS = TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === 60);
    expect(GRASS).toBeGreaterThan(0);
    const yTop = Math.floor(world.groundLevel || 330);
    const findAnchors = () => {
      const out: Array<[number, number]> = [];
      for (let y = yTop; y < st.h - 200; y++) for (let x = 2; x < st.w - 2; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === BULB && st.frameX[i] % 36 === 0 && st.frameY[i] % 36 === 0) out.push([x, y]);
      }
      return out;
    };
    expect(world.flags.hardMode).toBe(true);
    expect(world.flags['downed_134']).toBe(true);
    expect(world.flags['downed_125']).toBe(true);
    expect(world.flags['downed_127']).toBe(true);

    // ① burst 灯泡在场
    const first = findAnchors();
    expect(first.length, '三王首杀 burst 灯泡应在场').toBeGreaterThan(0);

    // ② 远距挖除(2×2 整件;玩家不在=不召王场景)
    const [bx, by] = first[0];
    for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) st.setTile(bx + dx, by + dy, 0);
    expect(findAnchors().length).toBe(0);

    // ③ 序列化随机 × 演化 tick → 再生
    const evo = new WorldEvolution({
      store: st,
      worldSurface: world.groundLevel,
      rockLevel: world.rockLevel,
      dungeonX: world.dungeonX,
      difficulty: world.difficulty ?? 0,
      flags: world.flags,
      crimson: !!world.crimson,
      isDay: true,
      raining: false,
      maxRaining: 0,
      windSpeedCurrent: 0,
      playerTile: () => ({ x: 1640, y: 300 }),   // 远离丛林(不触发召王/LOS 门)
    });
    const orig = Math.random;
    // ★灯泡门是【连续两掷】(1/25 与 1/60)——单点小值序列永远给不出连续两小,
    //   模式改=每第 7 次起连续两次 0.001(call%7∈{0,1}),其余 0.9(植物/藤蔓/蜂巢/
    //   染料阈值 ≤1/3 全败,不占 minJ;相位随每采样掷数走 7 循环必对齐)
    let call = 0;
    Math.random = () => (call++ % 7) < 2 ? 0.001 : 0.9;
    let regrown: Array<[number, number]> = [];
    try {
      for (let t = 0; t < 150000 && regrown.length === 0; t++) {
        evo.update();
        if (t % 2000 === 1999) regrown = findAnchors();
      }
      regrown = findAnchors();
    } finally {
      Math.random = orig;
    }
    expect(regrown.length, '再生分支应落新灯泡').toBeGreaterThan(0);

    // ④ 底承=双列丛林草(fitJunglePairFlat 放置门)
    for (const [x, y] of regrown) {
      const a = st.idx(x, y + 2), b2 = st.idx(x + 1, y + 2);
      expect(st.flags[a] && st.type[a] === GRASS, `灯泡(${x},${y}) 左底承应为丛林草`).toBe(true);
      expect(st.flags[b2] && st.type[b2] === GRASS, `灯泡(${x},${y}) 右底承应为丛林草`).toBe(true);
    }
  }, 480000);
});
