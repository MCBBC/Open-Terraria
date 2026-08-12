// CaveWallsInEnclosedSpaces + CaveWallVariety + 家具配对修复的回归门
// （2026-08-12 用户标注：悬空宝石=洞穴零背景墙、神庙木椅=配对错位）。
// 阈值断言而非位级快照——全管线共享 RNG,并发会话任何上游改动都会平移数值;
// 这里只锁「结构性不变量」:洞穴墙非零覆盖、晶簇带墙占优、神庙家具帧正确。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

describe('洞穴自然墙 + 神庙家具回归', () => {
  it('种子 9293480：洞穴墙覆盖>0、晶簇贴墙、神庙家具帧正确、宝石矿仍存在', async () => {
    const world = await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0,
    });
    const st = world.store;
    const rock = world.rockLevel, lava = world.lavaLine;

    // ① 洞穴区空气格带墙率（修复前=0,1227 格实测;修复后封闭腔全部刷墙）
    let caveAir = 0, caveAirWalled = 0;
    for (let y = rock; y < Math.min(lava, st.h); y += 3) {
      for (let x = 0; x < st.w; x += 3) {
        const i = st.idx(x, y);
        if (!st.flags[i]) {
          caveAir++;
          if (st.wall[i] !== 0) caveAirWalled++;
        }
      }
    }
    expect(caveAir).toBeGreaterThan(5000);
    // 结构性断言:修复前恒 0(1227 格采样实测);封闭腔被刷墙后过三成即视为生效
    // ——开放洞穴网络(连到边界的腔)原版也不刷,不满 100% 是预期
    expect(caveAirWalled / caveAir).toBeGreaterThan(0.3);

    // ② 暴露晶簇(178):带墙占比应占优(原版语义=贴墙装饰)
    const EXPOSED = TILE_BY_KEY['v_178_gems'];
    let clu = 0, cluWalled = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === EXPOSED) {
        clu++;
        if (st.wall[i] !== 0) cluWalled++;
      }
    }
    expect(clu).toBeGreaterThan(100);
    expect(cluWalled / clu).toBeGreaterThan(0.5);

    // ③ 神庙(墙 87)内家具帧:椅 15 应为 style12(by=480)、桌 14 style9、工作台 18 style10
    const CHAIR = TILE_BY_KEY['chair'], TABLE = TILE_BY_KEY['table'], WB = TILE_BY_KEY['workbench'];
    let chairFrames: number[] = [], tableFrames: number[] = [], wbFrames: number[] = [];
    for (let i = 0; i < st.type.length; i++) {
      if (st.wall[i] !== 87) continue;
      if (st.type[i] === CHAIR) chairFrames.push(st.frameY[i]);
      else if (st.type[i] === TABLE) tableFrames.push(st.frameX[i]);
      else if (st.type[i] === WB) wbFrames.push(st.frameX[i]);
    }
    // 神庙必有家具(预算=房数×1.35);帧=基偏移+格内 dy*18(1×2 椅上下两格差 18)
    if (chairFrames.length) {
      expect(chairFrames.every((f) => f === 12 * 40 || f === 12 * 40 + 18), `神庙椅帧应为 style12 by=480/498,实际 ${[...new Set(chairFrames)]}`).toBe(true);
      expect(tableFrames.every((f) => [486, 504, 522].includes(f)), `神庙桌帧应为 style9 486/504/522,实际 ${[...new Set(tableFrames)]}`).toBe(true);
      expect(wbFrames.every((f) => [360, 378].includes(f)), `神庙工作台帧应为 style10 360/378,实际 ${[...new Set(wbFrames)]}`).toBe(true);
    }

    // ④ 宝石矿仍存在(GemCaves 前移未被洞穴墙压制;sheet 64-69)
    let gemOre = 0;
    for (let i = 0; i < st.type.length; i++) {
      const sh = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
      if (sh >= 64 && sh <= 69) gemOre++;
    }
    expect(gemOre).toBeGreaterThan(500);

    // ⑤ 墙变体斑(196-215)应出现(CaveWallVariety)
    const varietyWalls = new Set<number>();
    for (let i = 0; i < st.wall.length; i++) {
      const w = st.wall[i];
      if ((w >= 196 && w <= 199) || (w >= 204 && w <= 215)) varietyWalls.add(w);
    }
    expect(varietyWalls.size).toBeGreaterThan(0);
  }, 600000);
});
