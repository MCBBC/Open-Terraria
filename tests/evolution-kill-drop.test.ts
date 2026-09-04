// ★⑤（2026-09-04 幽灵战役掉落/放置族批）：演化域 kill() 的 KillTile 掉落面回归。
// 原版锚：
//   · KillTile 掉落位次：WorldGen.cs:64375-64376 DropBait/DropItems 在 :64430 清格前
//     ——帧/基座须读活格。
//   · 树干族 GetItemDrops case 5/596/616/634（cs:65724-65745）→ KillTile_GetTreeDrops
//     （:66710-66747）：dropItem=9 起步;冠/枝标记帧（frameX>=22 && frameY>=198）
//     genRand.Next(2)==0 → TreeTypeDropsAcorns（:63621,None/Mushroom/Jungle 外）附橡实 27;
//     树型按基座草族换木（Ash 5215/Corrupt 619/Crimson 911/Jungle 620/Hallowed 621/
//     Mushroom Next(2)→183|0/Snow 2503）;bonusWood=Next(35)<=最近玩家 axe ||
//     Main.rand.Next(3)==0 → dropItemStack++（:65736-65739）;
//     ShouldDropExtraWood（SpecialSeedFeatures.cs:15-24 tenth&&drunk&&!remix&&!ntb）
//     && dropIsWood → stack ×2（:65742）。
//   · 655 世纪之花荆棘 = case 655 ∈ no-drop 组（cs:66580）=原版本就不掉;
//     595/615 苗无 case=不掉;72 蘑菇树/583-589 宝石树属其余 case（本批最小面外,登记）。
//   · 邪恶地树清除位次：cs:72721-72729（596/616 底承腐化 23/猩红 199 草 → KillTile
//     无 noItem）——樱花树掉 1 乌木 619 / 黄柳掉 1 阴森木 911 =「掉 1 腐化/猩红木」本体。
// 掷签流归属：genRand 三骰 = 蔓延流（UpdateWorld 期 genRand ⇒ SwapRandom("UpdateWorldGen")）;
//   Main.rand.Next(3) = 宿主全局流（Math.random）。骰序=原文序：橡实→蘑菇→斧→Main.rand。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { WorldEvolution, type EvolutionHost } from '../src/world/evolution/WorldEvolution';
import { RNG } from '../src/core/rng';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';

const SID = new Map<number, number>();
for (let id = 0; id < TILE_DEFS.length; id++) {
  const sh = TILE_DEFS[id]?.vanilla?.sheet;
  if (sh != null && !SID.has(sh)) SID.set(sh, id);
}
const S = (sheet: number): number => SID.get(sheet) ?? 0;

interface DropRec { vid: number; x: number; y: number; stack: number }

function mkEvo(st: TileStore, seed: number, drops: DropRec[], opts: { axe?: number; extraWood?: boolean } = {}): WorldEvolution {
  const host: EvolutionHost = {
    store: st,
    seed,
    worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
    flags: {}, crimson: false, isDay: true, raining: false,
    maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    spawnKillDrop: (vid, x, y, stack) => { drops.push({ vid, x, y, stack }); },
    selectedAxePower: () => opts.axe ?? 0,
    ...(opts.extraWood ? { tenthAnniversary: true, drunkWorld: true, notTheBees: false } : {}),
  };
  return new WorldEvolution(host);
}

function mkStore(): TileStore {
  return new TileStore(40, 80);
}

/** 蔓延流观察（core/rng.ts __swOnRoll 观察钩;evolution-rng-seed-stream 同款） */
function captureRolls(evo: WorldEvolution, fn: () => void): number[] {
  const stream = (evo as unknown as { spreadRng: RNG }).spreadRng.vanilla;
  const out: number[] = [];
  const g = globalThis as { __swOnRoll?: (v: number, inst: object) => void };
  const prev = g.__swOnRoll;
  g.__swOnRoll = (v, inst) => { if (inst === stream) out.push(v); };
  try { fn(); } finally { g.__swOnRoll = prev; }
  return out;
}

const kill = (evo: WorldEvolution, x: number, y: number): void =>
  (evo as unknown as { kill(x: number, y: number): void }).kill(x, y);

afterEach(() => {
  const g = globalThis as { __swOnRoll?: unknown };
  delete g.__swOnRoll;
  vi.restoreAllMocks();
});

describe('⑤ 演化域 kill 掉落面（KillTile_GetTreeDrops 1:1）', () => {
  it('樱花树 596 底承腐化草 23 → 掉 1 乌木 619（cs:72721-72729 本体;base 格无橡实骰=1 蔓延骰）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(23), 0, 0);          // 腐化草基座
    st.setTileSilent(10, 10, S(596), 0, 0);         // 樱花树干基格（frameX=0 → 无冠帧骰）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });  // axe≥34 → Next(35)<=axe 恒真=bonus 必中
    const rolls = captureRolls(evo, () => kill(evo, 10, 10));
    expect(st.hasTile(10, 10)).toBe(false);         // 清格
    expect(drops.length).toBe(1);
    expect(drops[0].vid).toBe(619);                 // Corrupt → Ebonwood（:66298）
    expect(drops[0].stack).toBe(2);                 // bonusWood → dropItemStack++（:65736-65738）
    expect(drops[0].x).toBe(10); expect(drops[0].y).toBe(10);
    expect(rolls.length).toBe(1);                   // 仅斧骰（base 格无冠帧→不掷橡实骰）
  });

  it('黄柳 616 底承猩红草 199 → 掉阴森木 911（猩红族基座换木）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(199), 0, 0);
    st.setTileSilent(10, 10, S(616), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });
    kill(evo, 10, 10);
    expect(drops.map((d) => d.vid)).toEqual([911]);
  });

  it('冠/枝标记帧（fx>=22&&fy>=198）：橡实骰按原文位次先于斧骰,27 附掉按 TreeTypeDropsAcorns', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(2), 0, 0);           // 森林草基座 → Forest → 木 9 + 橡实集
    st.setTileSilent(10, 10, S(5), 22, 198);        // 冠帧（OakMarked）
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });
    const rolls = captureRolls(evo, () => kill(evo, 10, 10));
    expect(rolls.length).toBe(2);                   // 橡实骰 + 斧骰（:66715 → :66744 序）
    const wood = drops.find((d) => d.vid === 9);
    const acorn = drops.find((d) => d.vid === 27);
    // 橡实骰=本流第 1 骰（Next(2)==0 ⇔ NextDouble<0.5;__swOnRoll 上报 raw int32,
    //   double=raw×4.656612875245797e-10=rng.ts sample() 同式）——按捕获值自洽断言（同 seed 恒定）
    const d0 = rolls[0] * 4.656612875245797e-10;
    if (d0 < 0.5) {
      expect(acorn).toBeDefined();                  // Forest ∈ TreeTypeDropsAcorns → 附 27
      expect(acorn!.stack).toBe(1);                 // secondaryItemStack 默认 1（:64481）
      expect(drops.indexOf(wood!)).toBeLessThan(drops.indexOf(acorn!));  // 木先橡实（:64476-64479）
    } else {
      expect(acorn).toBeUndefined();
    }
    expect(wood).toBeDefined();
  });

  it('Main.rand.Next(3)==0 旁臂：axe=0 + 全局流 0 → bonus 必中（|| 右臂,不占蔓延流）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(23), 0, 0);
    st.setTileSilent(10, 10, S(596), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 0 });
    vi.spyOn(Math, 'random').mockReturnValue(0);    // Main.rand.Next(3)==0
    const rolls = captureRolls(evo, () => kill(evo, 10, 10));
    expect(drops[0].stack).toBe(2);                 // 右臂命中（Next(35)>0 时仍 bonus）
    expect(rolls.length).toBe(1);                   // Main.rand 骰不占蔓延流位
  });

  it('ShouldDropExtraWood（tenth&&drunk&&!remix&&!ntb）→ stack ×2（:65742）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(23), 0, 0);
    st.setTileSilent(10, 10, S(596), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100, extraWood: true });
    kill(evo, 10, 10);
    expect(drops[0].vid).toBe(619);
    expect(drops[0].stack).toBe(4);                 // (1+bonus)×2
  });

  it('655 世纪之花荆棘 = no-drop 组（cs:66580）→ 零掉落零骰（原版本就不掉,零改动钉）', () => {
    const st = mkStore();
    st.setTileSilent(10, 10, S(655), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });
    const rolls = captureRolls(evo, () => kill(evo, 10, 10));
    expect(st.hasTile(10, 10)).toBe(false);
    expect(drops).toEqual([]);
    expect(rolls.length).toBe(0);
  });

  it('595 苗（无 case）→ 清格不掉;宿主无出口 → 整面跳过=零骰零流差（离线确定性）', () => {
    const st = mkStore();
    st.setTileSilent(10, 11, S(23), 0, 0);
    st.setTileSilent(10, 10, S(595), 0, 0);
    const drops: DropRec[] = [];
    const evo = mkEvo(st, 7, drops, { axe: 100 });
    const rolls = captureRolls(evo, () => kill(evo, 10, 10));
    expect(st.hasTile(10, 10)).toBe(false);
    expect(drops).toEqual([]);
    expect(rolls.length).toBe(0);
    // 无出口宿主（spawnKillDrop 缺省）：
    const st2 = mkStore();
    st2.setTileSilent(10, 11, S(23), 0, 0);
    st2.setTileSilent(10, 10, S(596), 0, 0);
    const host2: EvolutionHost = {
      store: st2, seed: 7, worldSurface: 40, rockLevel: 200, dungeonX: 60, difficulty: 0,
      flags: {}, crimson: false, isDay: true, raining: false,
      maxRaining: 0, windSpeedCurrent: 0, playerTile: () => null,
    };
    const evo2 = new WorldEvolution(host2);
    let randCalls = 0;
    const orig = Math.random;
    Math.random = () => { randCalls++; return 0.5; };
    const rolls2 = captureRolls(evo2, () => kill(evo2, 10, 10));
    Math.random = orig;
    expect(st2.hasTile(10, 10)).toBe(false);        // 清格照常
    expect(rolls2.length).toBe(0);                  // 零骰
    expect(randCalls).toBe(0);                      // 全局流亦零触
  });
});
