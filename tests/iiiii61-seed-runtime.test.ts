// IIIII61 批（2026-08-30）彩蛋种子运行时域全量收齐——单测三件：
//   ① DontStarveDarkness（theConstant 黑暗伤害,DontStarveDarknessDamageDealer.cs 1:1）
//   ② SkyblockRuntime（WorldGen.Skyblock 八旗滚动普查,WorldGen.cs:3045-3240）
//   ③ NpcDrops 秘种子条件族（DontStarveIsUp/TenthAnniversaryIsUp/SkyblockIsUp 族/
//      DropExtraGel——Conditions.cs:1448-1566 + SpecialSeedFeatures.cs:5-13）
import { describe, it, expect } from 'vitest';
import { DontStarveDarkness } from '../src/player/DontStarveDarkness';
import { SkyblockRuntime } from '../src/world/SkyblockRuntime';
import { TILE_INTERNAL_BY_SHEET } from '../src/data/tiles';
import { evalCond, type NpcDropCtx } from '../src/drops/NpcDrops';

// ============ 工具 ============
function makeStore(w: number, h: number) {
  const flags = new Uint8Array(w * h);
  const type = new Uint16Array(w * h);
  const wall = new Uint16Array(w * h);
  return {
    w, h, flags, type, wall,
    idx(x: number, y: number) { return y * w + x; },
    setTile(x: number, y: number, t: number) {
      const i = this.idx(x, y); flags[i] = t ? 1 : 0; type[i] = t;
    },
    setWall(x: number, y: number, wl: number) { wall[this.idx(x, y)] = wl; },
  };
}

/** 黑暗伤害 harness：可控光照，录消息/命中/伤害 */
function darknessHarness() {
  const d = new DontStarveDarkness();
  let light = 1;                       // 默认亮
  const texts: Array<{ text: string; rgb: [number, number, number] }> = [];
  const sfx: string[] = [];
  const hits: number[] = [];
  const ctx = {
    lightLengthAtPlayerCenter: () => light,
    isDead: () => false,
    isShimmering: () => false,
    outOfFocusOrPaused: () => false,
    silentMessages: () => false,
    showText: (text: string, r: number, g: number, b: number) =>
      texts.push({ text, rgb: [r, g, b] }),
    playHitSound: () => sfx.push('item1'),
    hurtByDarkness: (dmg: number) => { hits.push(dmg); return true; },
  };
  return {
    d, texts, sfx, hits,
    step(n = 1) { for (let i = 0; i < n; i++) d.update(ctx); },
    setLight(v: number) { light = v; },
    resetFlags: () => { texts.length = 0; sfx.length = 0; hits.length = 0; },
    st: () => d._debugState(),
  };
}

describe('DontStarveDarkness：黑暗伤害状态机（vanilla 静字段语义）', () => {
  it('亮处长期存活：零消息/零伤害', () => {
    const h = darknessHarness();
    h.setLight(0.2);
    h.step(600);
    expect(h.texts).toEqual([]);
    expect(h.hits).toEqual([]);
  });

  it('入暗第 62 拍文案一次；第 181 拍首击、之后每 +61 拍一击（tsx 全模拟定标）', () => {
    const h = darknessHarness();
    h.setLight(0);                       // 全黑
    h.step(61);                          // timer 初值 -1：先判后增 → 文案在 #62
    expect(h.texts.length).toBe(0);
    h.step(1);                           // 第 62 拍 → 危险文案
    expect(h.texts.map((t) => t.rgb)).toEqual([[200, 50, 50]]);
    h.step(118);                         // #63..#180 无击
    expect(h.hits).toEqual([]);
    h.step(1);                           // 第 181 拍：hitTimer=61 > 60 → 首击 250
    expect(h.hits).toEqual([250]);
    expect(h.sfx.length).toBe(1);
    h.step(61);                          // 第 242 拍第二击（delta 61）
    expect(h.hits.length).toBe(2);
    // 120 钳位语义：darknessTimer 恒停 120
    expect(h.st().timer).toBe(120);
  });

  it('复明即安全文案 + 计时归零（重新入暗重走 120t）', () => {
    const h = darknessHarness();
    h.setLight(0);
    h.step(70);                          // 已示警
    expect(h.st().said).toBe(true);
    h.setLight(0.2);                     // 复明
    h.step(1);
    expect(h.texts.some((t) => t.rgb[0] === 50 && t.rgb[1] === 200)).toBe(true);
    expect(h.st().timer).toBe(-1);       // ResetTimer
    // 再入暗：120t 内不再出文案
    h.resetFlags();
    h.setLight(0);
    h.step(300);
    expect(h.texts.some((t) => t.rgb[0] === 200)).toBe(true);   // 新一轮 danger 文案
  });

  it('getGoodWorld 组合静默：不出任何文案但照常掉血', () => {
    const silentTexts: Array<{ text: string; rgb: [number, number, number] }> = [];
    const hits: number[] = [];
    const d2 = new DontStarveDarkness();
    const silentCtx = {
      lightLengthAtPlayerCenter: () => 0,
      isDead: () => false, isShimmering: () => false, outOfFocusOrPaused: () => false,
      silentMessages: () => true,
      showText: (text: string, r: number, g: number, b: number) =>
        silentTexts.push({ text, rgb: [r, g, b] }),
      playHitSound: () => void 0,
      hurtByDarkness: (dmg: number) => { hits.push(dmg); return true; },
    };
    for (let i = 0; i < 200; i++) d2.update(silentCtx);
    expect(silentTexts).toEqual([]);     // 文案全静默
    expect(hits).toContain(250);         // 伤害照常
  });

  it('死亡/微光化早退：状态复位不推进', () => {
    const d = new DontStarveDarkness();
    let dead = true, shimmer = false;
    let lightVal = 0;
    const ctx = {
      lightLengthAtPlayerCenter: () => lightVal,
      isDead: () => dead, isShimmering: () => shimmer,
      outOfFocusOrPaused: () => false, silentMessages: () => false,
      showText: () => void 0, playHitSound: () => void 0,
      hurtByDarkness: () => true,
    };
    for (let i = 0; i < 500; i++) d.update(ctx);
    expect(d._debugState().timer).toBe(-1);
    // 死亡期间累计→复活后重新计满 120 才会再击（此处只验复位路径无击）
  });
});

// ============ ② SkyblockRuntime 普查 ============
describe('SkyblockRuntime（WorldGen.Skyblock.Calculate :3146-3199）', () => {
  /** 8×100 手搓世界：行域 [40,h-40) 上下留边——暖扫只吃 40..h-40 行 */
  function runtime(store: ReturnType<typeof makeStore>, skyblock: boolean) {
    return new SkyblockRuntime(store, () => skyblock, []);
  }

  it('空旷世界（占比<0.1 且 skyblock）→ lowTiles=true', () => {
    const st = makeStore(10, 100);       // 分母=1000,暖扫行域 20 格宽 ×10 列=200 可判格
    const r = runtime(st, true);
    for (let x = 0; x < 10; x++) st.setTile(x, 41, 4);   // 仅 10 活格 → 占比 10/1000<0.1
    r.warmFullScan();
    expect(r.flags.lowTiles).toBe(true);
  });

  it('实心世界（占比高）→ lowTiles=false', () => {
    const st = makeStore(10, 100);
    for (let x = 0; x < 10; x++) for (let y = 45; y < 80; y++) st.setTile(x, y, 1);
    const r = runtime(st, true);
    r.warmFullScan();
    expect(r.flags.lowTiles).toBe(false);
  });

  it('非 skyblock 世界恒 false（Calculate 的 Main.skyblockWorld 因子）', () => {
    const st = makeStore(10, 100);
    const r = runtime(st, false);        // 大量实心也不触发
    for (let x = 0; x < 10; x++) for (let y = 45; y < 70; y++) st.setTile(x, y, 1);
    r.warmFullScan();
    expect(r.flags.lowTiles).toBe(false);
  });

  it('noAltars/noHellstone/noFossils/noLifeCrystals 八旗派生（hasTile 面）', () => {
    const st = makeStore(6, 100);
    const r = runtime(st, true);
    // sheet 58 狱石 SW 内部 id 反查（TILE_INTERNAL_BY_SHEET）
    r.warmFullScan();
    expect(r.flags.noAltars).toBe(true);
    expect(r.flags.noHellstone).toBe(true);
    expect(r.flags.noFossils).toBe(true);
    expect(r.flags.noLifeCrystals).toBe(true);
    // 放一枚狱石（sheet 58 → SW 内部 id 反查）
    const hellstone = TILE_INTERNAL_BY_SHEET.get(58);
    if (hellstone !== undefined) {
      r.warmFullScan();                  // 先清 seen 集
      st.setTile(2, 42, hellstone);      // 放狱石
      r.warmFullScan();
      expect(r.flags.noHellstone).toBe(false);
      expect(r.flags.noAltars).toBe(true);
    }
  });

  it('滚动巡检：stepColumn 尾列触发 Calculate 并回卷列指针', () => {
    const st = makeStore(4, 100);
    const r = runtime(st, true);
    for (let x = 0; x < 4; x++) st.setTile(x, 41, 4);
    let flips = 0;
    r.onLowTilesFlip = () => { flips++; };
    // 连续推进一轮以上
    for (let i = 0; i < 12; i++) r.stepColumn();
    expect(r.debugState().col).toBe(0);  // 回卷后指 0（尾列 calculate 后置 0）
    expect(flips).toBeGreaterThanOrEqual(1);
    expect(r.flags.lowTiles).toBe(true);
  });
});

// ============ ③ NpcDrops 秘种子条件族 ============
const baseCtx = (): NpcDropCtx => ({
  rng: { next: () => 0.99, int: () => 0 } as unknown as NpcDropCtx['rng'],
  netId: 1, type: 1, isExpert: false, isMaster: false, hardMode: false, crimson: false,
  flags: {}, x: 0, y: 0, worldSurfaceTile: 100, rockLayerTile: 200, underworldTileY: 400,
  maxTilesX: 4200, maxTilesY: 1200, lifeMax: 100, friendly: false, boss: false,
  damage: 10, value: 1, hp: 100, hpMax: 100, mana: 0, manaMax: 0,
});

describe('NpcDrops 秘种子掉落条件族（Conditions.cs:1448-1566）', () => {
  it('DontStarveIsUp / IsNotUp 按 dontStarveWorld 取值', () => {
    expect(evalCond('DontStarveIsUp', [], baseCtx())).toBe(false);
    const up = { ...baseCtx(), dontStarveWorld: true };
    expect(evalCond('DontStarveIsUp', [], up)).toBe(true);
    expect(evalCond('DontStarveIsNotUp', [], up)).toBe(false);
    expect(evalCond('DontStarveIsNotUp', [], baseCtx())).toBe(true);
  });

  it('TenthAnniversaryIsUp / IsNotUp', () => {
    const up = { ...baseCtx(), tenthAnniversaryWorld: true };
    expect(evalCond('TenthAnniversaryIsUp', [], up)).toBe(true);
    expect(evalCond('TenthAnniversaryIsNotUp', [], up)).toBe(false);
    expect(evalCond('TenthAnniversaryIsNotUp', [], baseCtx())).toBe(true);
  });

  it('SkyblockIsUp 族走动态低格旗；NoSickle 加持镰门', () => {
    const low = { ...baseCtx(), skyblockLowTiles: true };
    expect(evalCond('SkyblockIsUp', [], low)).toBe(true);
    expect(evalCond('SkyblockIsNotUp', [], low)).toBe(false);
    expect(evalCond('SkyblockIsNotUp', [], baseCtx())).toBe(true);
    expect(evalCond('SkyblockIsUpNoSickle', [], low)).toBe(true);          // 未持镰刀
    expect(evalCond('SkyblockIsUpNoSickle',
      [], { ...low, playerHasSickle: true })).toBe(false);                  // 持镰禁掉
  });

  it('DropExtraGel/NotDropExtraGel = ShouldDropExtraGel 特征位', () => {
    const gel = { ...baseCtx(), extraGelWorld: true };
    expect(evalCond('DropExtraGel', [], gel)).toBe(true);
    expect(evalCond('NotDropExtraGel', [], gel)).toBe(false);
    expect(evalCond('NotDropExtraGel', [], baseCtx())).toBe(true);
  });
});
