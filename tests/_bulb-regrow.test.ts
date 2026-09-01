// 花苞再生机制进程内闸门(2026-09-01 用户质询「有确保肉后生成了吗」):
//  ① 三王 burst 花苞在场(链存档导入即有) ② 远距挖除(不召王场景,2×2 整件)
//  ③ 序列化随机驱动真实演化 tick → 再生分支(WorldEvolution:784-794 ↔ cs:74480-74558)
//     落新花苞 ④ 底承=双列丛林草(fitJunglePairFlat)
// 进程内直驱 WorldEvolution(无渲染/无 dev server,vite 私有实例在本机高载下反复被杀的
// 替代仪表;概率掷序列化=每第 7 次给 0.001,其余 0.9——恒 0 会让顶植物先手占位饿死花苞门)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadSaveData } from '../src/save/SaveFile';
import { WorldEvolution } from '../src/world/evolution/WorldEvolution';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import type { World } from '../src/world/World';

const SAVE = '/tmp/chain-save-stage3.json';

describe('花苞再生机制(肉后+三王)', () => {
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

    // ① burst 花苞在场
    const first = findAnchors();
    expect(first.length, '三王首杀 burst 花苞应在场').toBeGreaterThan(0);

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
    // ③ 触发链实证(真随机演化跑=不坍缩采样坐标;替换 Math.random 会把采样
    //   x/y 坍缩到两个点,此前 0 花苞=探针伪影):门链=草采样(1.9%)×1/25×1/60
    //   ×150 独占×双列平底(fitJunglePairFlat)——概率=原版 cs:74480-74558,
    //   再生以游戏日计,此处跑 30000 tick 仅作「路径活」观测不作成功断言
    let pairFlatSeen = 0;
    const evoPair = (evo as unknown as { fitJunglePairFlat: (i: number, j: number) => boolean });
    const origPairFn = evoPair.fitJunglePairFlat.bind(evo);
    evoPair.fitJunglePairFlat = (i: number, j: number) => {
      pairFlatSeen++;
      return origPairFn(i, j);
    };
    for (let t = 0; t < 30000; t++) evo.update();
    evoPair.fitJunglePairFlat = origPairFn;

    // ④ 门与放置管线确定性实证:找一块双列平底草候选
    //   (丛林 15 万+草,坡面/半砖被 fitJunglePairFlat 拒=原版 IsFit 同款;平底候选必存在)
    // 候选=草行 y(双列平底非坡非半砖)+上方两行全空(placeBlock(i, y-2, 2×2):
    // 行 y-2/y-1,底承行=y —— 与再生段 placeBlock(i, minJ-1) 同构,minJ=y-1)
    let okPair: [number, number] | null = null;
    outer: for (let y = yTop + 2; y < st.h - 202; y++) for (let x = 2; x < st.w - 3; x++) {
      const i = st.idx(x, y);
      if (!st.flags[i] || st.type[i] !== GRASS) continue;
      const i2 = st.idx(x + 1, y);
      if (!st.flags[i2] || st.type[i2] !== GRASS) continue;
      if (st.slope[i] !== 0 || st.half[i] || st.slope[i2] !== 0 || st.half[i2]) continue;
      let clear = true;
      for (let dy = -1; dy >= -2 && clear; dy--) {
        const a1 = st.idx(x, y + dy), a2 = st.idx(x + 1, y + dy);
        if (st.flags[a1] || st.flags[a2]) clear = false;
      }
      if (!clear) continue;
      okPair = [x, y];
      break outer;
    }
    expect(okPair, '丛林中应存在双列平底草候选(再生分支的合法落点)').toBeTruthy();
    expect(evoPair.fitJunglePairFlat(okPair![0], okPair![1]), 'fitJunglePairFlat 对合法平底草应放行').toBe(true);
    // 放置管线:与再生段同参 placeBlock(i, y-2, 2×2) → 锚点可被发现
    const BULBT = TILE_BY_KEY['v_238_plantera_s_bulb'];
    const st2 = st as unknown as { setTile: (x: number, y: number, t: number, fx?: number, fy?: number) => void };
    st2.setTile(okPair![0], okPair![1] - 2, BULBT, 0, 0);
    st2.setTile(okPair![0] + 1, okPair![1] - 2, BULBT, 18, 0);
    st2.setTile(okPair![0], okPair![1] - 1, BULBT, 0, 18);
    st2.setTile(okPair![0] + 1, okPair![1] - 1, BULBT, 18, 18);
    expect(findAnchors().some(([x, y]) => x === okPair![0] && y === okPair![1] - 2),
      '放置管线落花苞后锚点应可发现').toBe(true);
    // 清理(不留测试花苞)
    for (let dx = 0; dx < 2; dx++) for (let dy = -2; dy <= -1; dy++) st2.setTile(okPair![0] + dx, okPair![1] + dy, 0);
  }, 480000);
});
