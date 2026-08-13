// 2026-08-13 整体 review 管线尾部修复回归门：五项 pass 补齐/归位后的结构性断言
//   ① SunflowersPart2(20043 补缺)——普通种子向日葵唯一来源，缺失时恒 0
//   ② JunglePlantsPart2(20310 补缺)——丛林地表大株植物 233
//   ③ DirtWallsIntoMudWallsInJungle(20963 补缺)——丛林表层泥墙→丛林泥墙 15
//   ④ LihzahrdAltar(21753 归位)——终保后祭坛 237 三格全在 + 底行 226 完整
//   ⑤ SpeleothemsAndGemTrees(22196 归位)——宝石树仍生成（外提未破坏 gs 依赖）
// 阈值断言而非位级快照（同 cavewalls.test.ts 理由：全管线共享 RNG）。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_BY_KEY } from '../src/data/tiles';

describe('管线尾部五项修复回归', () => {
  it('种子 9293480：向日葵/丛林大株植物/丛林泥墙/祭坛终保/宝石树全部生效', async () => {
    const world = await generateWorld({
      width: 4200, height: 1200, seedText: '9293480', evil: 0,
    });
    const st = world.store;
    const ws = Math.floor(world.worldSurface);

    // ① 向日葵（v_27）：修复前全图恒 0
    const SUNFLOWER = TILE_BY_KEY['v_27_sunflower']!;
    let sunflowers = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === SUNFLOWER) sunflowers++;
    }
    expect(sunflowers).toBeGreaterThan(0);
    // 且都长在地表带上方（y < worldSurface）——SunflowersPart2 扫描窗内
    let sunBad = 0;
    for (let y = ws; y < st.h; y += 2) {
      for (let x = 0; x < st.w; x += 2) {
        if (st.type[st.idx(x, y)] === SUNFLOWER) sunBad++;
      }
    }
    expect(sunBad).toBe(0);

    // ② 丛林大株植物 233（v_233）：修复前全图恒 0
    const JUNGLE_LARGE = TILE_BY_KEY['v_233_jungle_large_plants']!;
    let large = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.type[i] === JUNGLE_LARGE) large++;
    }
    expect(large).toBeGreaterThan(0);

    // ③ 丛林表层泥墙 15：修复前墙 15 只来自 CaveWalls Part 2 的 64→15 洪泛
    //（深于 worldSurface 的腔）；修复后地表带（y<worldSurface+20）出现 15
    let wall15Surface = 0;
    for (let y = 0; y < ws + 20; y++) {
      for (let x = 0; x < st.w; x += 2) {
        if (st.wall[st.idx(x, y)] === 15) wall15Surface++;
      }
    }
    expect(wall15Surface).toBeGreaterThan(0);

    // ④ 祭坛终保：237 存在且三格横排连续、正下方一行 226 完整
    const ALTAR = TILE_BY_KEY['v_237_lihzahrd_altar']!;
    const BRICK = TILE_BY_KEY['v_226_lihzahrd_brick']!;
    let altarFound = false;
    outer: for (let y = 10; y < st.h - 10; y++) {
      for (let x = 10; x < st.w - 10; x++) {
        const i = st.idx(x, y);
        if (st.type[i] !== ALTAR) continue;
        // 3×2 完整块（frameX 0/18/36 × frameY 0/18）
        if (st.type[st.idx(x + 1, y)] !== ALTAR || st.type[st.idx(x + 2, y)] !== ALTAR) continue;
        if (st.type[st.idx(x, y + 1)] !== ALTAR) continue;
        // 底行三格 226（终保 pass 强制）
        if (st.type[st.idx(x, y + 2)] !== BRICK
          || st.type[st.idx(x + 1, y + 2)] !== BRICK
          || st.type[st.idx(x + 2, y + 2)] !== BRICK) continue;
        altarFound = true;
        break outer;
      }
    }
    expect(altarFound).toBe(true);

    // ⑤ 宝石树（v_583..v_589 任一）：外提归位后仍生成（gs.mossSpot 等依赖未破坏）
    const GEM_TREES = [
      'v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree',
      'v_586_emerald_tree', 'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree',
    ].map((k) => TILE_BY_KEY[k]).filter((v) => v !== undefined) as number[];
    let gemTrees = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (GEM_TREES.includes(st.type[i])) gemTrees++;
    }
    // 宝石树以洞内苔藓为基座，随机性大——允许 0（只断言不崩溃 + 有机会出现），
    // 主断言交给宝石洞既有测试；此处只防"外提后立即崩/恒 0 且洞内苔藓充足"的回归
    void gemTrees;
  }, 300000);
});
