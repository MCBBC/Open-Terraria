// 批 4（1457 worldgen 行为修复）探针：HellFort 1457 重构 / makeTemple 砖线重做 /
// FinalSeedCleanup 终扫 / placeTrap_CanContinue 门 / 冰箱 7 元池 的行为面抽查。
// 非金标——只验证「跑得通 + 结构性不变量」，几何对拍归 1457 oracle（未建）。
import { describe, it, expect } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

const sheetAt = (t: number): number => TILE_DEFS[t]?.vanilla?.sheet ?? -1;

describe('批4 1457 worldgen 行为探针', () => {
  it('HellFort 1457：门落点+塌墙开口+无悬挂（种子 9293480 小世界）', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const st = world.store;
    const h = st.h;
    const hellTop = h - 200;
    // 地狱塔统计：门 10 / 平台 19 / 墙 13/14
    let doors = 0, platforms = 0, wallCells = 0;
    for (let x = 0; x < st.w; x++) {
      for (let y = hellTop; y < h; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) continue;
        const sh = sheetAt(st.type[i]!);
        if (sh === 10) doors++;
        else if (sh === 19) platforms++;
        if (st.wall[i] === 13 || st.wall[i] === 14) wallCells++;
      }
    }
    // 1457 右外门修复 + 塌墙阶段：门数应显著多于 1456 口径的「仅列间+左外门」下限,
    // 塌墙使墙 13/14 格数出现空段——这里只锁非零与量级（金标缺位备案）
    console.log(`[b4] hellfort doors=${doors} platforms=${platforms} wall13/14=${wallCells}`);
    expect(doors).toBeGreaterThan(0);
    expect(platforms).toBeGreaterThan(0);
    expect(wallCells).toBeGreaterThan(1000);
  }, 300000);

  it('FinalSeedCleanup：悬空可静态化落砂清零（种子 9293480）', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '9293480', evil: 0 });
    const st = world.store;
    const FALLING = new Set([53, 234, 112, 116, 224, 123, 330, 331, 332, 333, 495]);
    const solid3 = (x: number, y: number): boolean => {
      if (!st.inBounds(x, y)) return false;
      const i = st.idx(x, y);
      if (!st.flags[i]) return false;
      const d = TILE_DEFS[st.type[i]!];
      return !!d && !!d.solid && !d.platform;
    };
    let floating = 0;
    for (let x = 5; x < st.w - 5; x++) {
      for (let y = 5; y < st.h - 5; y++) {
        const i = st.idx(x, y);
        if (!st.flags[i]) continue;
        if (!FALLING.has(sheetAt(st.type[i]!))) continue;
        if (solid3(x, y + 1)) continue;
        floating++;
      }
    }
    // 终扫后仍允许少量「下坠一格成型」路径留下的原格（原版语义,原格不清）,
    // 但不应成规模——1456 管线此处约数千,1457 终扫后应为 0 或个位数量级
    console.log(`[b4] finalSeedCleanup floating=${floating}`);
    expect(floating).toBeLessThan(200);
  }, 300000);

  it('makeTemple 1457 砖线：蜥蜴砖体量+祭坛在场（种子 44）', async () => {
    const world = await generateWorld({ width: 4200, height: 1200, seedText: '44', evil: 0 });
    const st = world.store;
    const BRICK = 226;
    let bricks = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.flags[i] && sheetAt(st.type[i]!) === BRICK) bricks++;
    }
    // 神庙砖体量下限（小世界 1456 口径 ~4 万;1457 深度组并界+L 线应同量级）
    expect(bricks).toBeGreaterThan(20000);
    // 祭坛 237 必在（makeTemple 尾）
    let altars = 0;
    for (let i = 0; i < st.type.length; i++) {
      if (st.flags[i] && sheetAt(st.type[i]!) === 237) altars++;
    }
    console.log(`[b4] temple bricks=${bricks} altars=${altars}`);
    expect(altars).toBeGreaterThan(0);
  }, 300000);
});
