// 吸血鬼秘密种子（SecretSeed.vampirism → Main.vampireSeed）全玩法链锁测：
//  ① 种子解析（"what a horrible night to have a curse" 归一化变体）；
//  ② VampireSeedSunlightExposure（Player.cs:28191-28238）暴露判定逐门（露天/白天/
//    雨/日食/墙/屋顶/持伞/蝙蝠坐骑/月总天幕）；
//  ③ counter 蓄能 0→300（±1/−6 死亡 −2）与 120 档点火链（AddBuff 24/23/32 各 3t、
//    buffImmune 清空、卸翅膀/火箭靴、Molten 套 :15883 反门）；
//  ④ 炽灼音环句柄生命周期（:28107-28121 起/随/拆）。
// OnFire -50HP/s 特档已在 armorpen-dot-parity.test.ts 覆盖。
import { describe, it, expect } from 'vitest';
import { parseSeed } from '../src/world/gen/SeedEasterEggs';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { ITEM_DEFS } from '../src/data/items';

import { BuffType } from '../src/stats/Buffs';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

/** vid → 内部 item id（ITEM_DEFS 反查；测试装配用） */
function iidOfVid(vid: number): number {
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const v = d.vid ?? -1;   // ★方案 A:vid 直读(BJ265)（回填后恒等）
    if (v === vid) return i;
  }
  return -1;
}

/** 玩家脚下 tile 行（Player.cs:28193 (int)(Bottom.Y-1)/16 口径） */
const footRow = (p: Player) => Math.floor((p.y + p.h - 1) / 16);

/** 组装吸血鬼世界 + 主角（默认天上无墙=裸露；玩家 tile 列 = xTile） */
function setup(opts: {
  xTile?: number; yTile?: number; groundLevel?: number;
  vampire?: boolean; day?: boolean; raining?: boolean; eclipse?: boolean;
} = {}) {
  const w = new World(64, 64, 42, '吸血鬼测试');
  w.groundLevel = opts.groundLevel ?? 40;
  w.clock.timeOfDay = opts.day === false ? 0 : 0.5;   // 0=午夜 0.5=正午
  w.weather.raining = !!opts.raining;
  w.clock.eclipse = !!opts.eclipse;
  w.seedFlags = opts.vampire === false ? {} : { vampireSeed: true };
  const xTile = opts.xTile ?? 10, yTile = opts.yTile ?? 35;
  const p = new Player(xTile * 16, yTile * 16 - 42 + 1, new Inventory());
  expect(footRow(p)).toBe(yTile);   // 装配自检：脚底行 = 预期
  const sizzleVol: number[] = [];
  let sizzleCreated = 0, sizzleStopped = 0;
  const game = {
    world: w, player: p,
    enemies: () => [] as unknown[],
    critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    playSfxWav: () => {},
    startLoopSfx: (_f: string, vol: number) => {
      sizzleCreated++; sizzleVol.push(vol);
      return {
        stop: () => { sizzleStopped++; },
        setVolume: (v: number) => { sizzleVol.push(v); },
        get playing() { return true; },
        get dead() { return false; },
      };
    },
  } as unknown as GameHooks;
  const scorch = () => (p as unknown as { updateSunScorch(g: GameHooks): void }).updateSunScorch(game);
  return { w, p, game, scorch, sizzle: { sizzleVol, get created() { return sizzleCreated; }, get stopped() { return sizzleStopped; } } };
}

describe('种子解析（SeedEasterEggs vampireSeed）', () => {
  it.each([
    'what a horrible night to have a curse',
    'What A Horrible Night To Have A Curse',
    'whatahorriblenighttohaveacurse',
    'what-a-horrible-night-to-have-a-curse',
    'What a horrible night to have a curse!!!',
  ])('明文/大小写/分隔变体 "%s" 命中', (seed) => {
    expect(parseSeed(seed).flags.vampireSeed).toBe(true);
  });
  it('普通种子不命中', () => {
    expect(parseSeed('9293480').flags.vampireSeed).toBeFalsy();
    expect(parseSeed('for the worthy').flags.vampireSeed).toBeFalsy();
    expect(parseSeed('dracula').flags.vampireSeed).toBeFalsy();   // 非原版明文
  });
  it('秘密种子不改世界名（specialName=null——原版仅特殊种子改名）', () => {
    expect(parseSeed('what a horrible night to have a curse').specialName).toBeNull();
  });
});

describe('暴露判定（Player.cs:28191-28238）', () => {
  it('露天白天 → burning + counter 蓄能', () => {
    const { p, scorch } = setup();
    scorch();
    expect(p.vampireBurningInSunlight).toBe(true);
    expect(p.sunScorchCounter).toBe(1);
    scorch();
    expect(p.sunScorchCounter).toBe(2);        // :28106 +1/t
  });
  it('非吸血鬼世界恒不灼（:28195 直出）', () => {
    const { p, scorch } = setup({ vampire: false });
    for (let i = 0; i < 200; i++) scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
    expect(p.sunScorchCounter).toBe(0);
  });
  it('夜晚不灼（Main.dayTime 门）', () => {
    const { p, scorch } = setup({ day: false });
    scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
  });
  it('雨/日食不灼', () => {
    const a = setup({ raining: true }); a.scorch();
    expect(a.p.vampireBurningInSunlight).toBe(false);
    const b = setup({ eclipse: true }); b.scorch();
    expect(b.p.vampireBurningInSunlight).toBe(false);
  });
  it('背景墙挡阳光（向上 15 格无透光墙不灼）', () => {
    const { w, p, scorch } = setup();
    const st = w.store, col = Math.floor(p.cx / 16), row = footRow(p);
    for (let dy = 0; dy < 16; dy++) st.setWallSilent(col, row - dy, 1);  // 泥墙
    scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
  });
  it('玻璃墙 21/回声墙 318 透光（:28224）', () => {
    for (const wall of [21, 318]) {
      const { w, p, scorch } = setup();
      const st = w.store, col = Math.floor(p.cx / 16), row = footRow(p);
      for (let dy = 0; dy < 16; dy++) st.setWallSilent(col, row - dy, wall);
      scorch();
      expect(p.vampireBurningInSunlight, `wall ${wall}`).toBe(true);
    }
  });
  it('头顶实心块 = 屋顶停扫（:28233-28237）', () => {
    const { w, p, scorch } = setup();
    const st = w.store, col = Math.floor(p.cx / 16), row = footRow(p);
    for (let dy = 0; dy < 16; dy++) st.setWallSilent(col, row - dy, 1);  // 有墙才走到上扫
    st.setTile(col, row - 3, TILE_BY_KEY['stone'] ?? 1);
    scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
  });
  it('地下（脚下 tile 行 ≥ worldSurface）不灼', () => {
    const { p, scorch } = setup({ yTile: 45, groundLevel: 40 });
    scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
  });
  it('持伞 946 免灼；蝙蝠坐骑上伞失效（:28210-28216）', () => {
    const a = setup();
    a.p.inv.slots[a.p.inv.selected] = { id: iidOfVid(946), stack: 1 };
    a.scorch();
    expect(a.p.vampireBurningInSunlight).toBe(false);
    const b = setup();
    b.p.inv.slots[b.p.inv.selected] = { id: iidOfVid(946), stack: 1 };
    b.p.mount.active = true; b.p.mount.type = 56;
    b.scorch();
    expect(b.p.vampireBurningInSunlight).toBe(true);   // mount56 → flag2=false 继续扫
  });
  it('月总天幕强度 >0.5 不灼（SceneMetrics.cs:297-305）', () => {
    const { p, game, scorch } = setup();
    (game as { enemies: () => unknown[] }).enemies = () => [
      { vanillaId: 398, cx: p.cx, cy: p.cy },   // 贴脸月总 → 强度 1
    ];
    scorch();
    expect(p.vampireBurningInSunlight).toBe(false);
  });
});

describe('蓄能与点火（Player.cs:28094-28189）', () => {
  it('counter 上限 300（:28106 Clamp）', () => {
    const { p, scorch } = setup();
    for (let i = 0; i < 400; i++) scorch();
    expect(p.sunScorchCounter).toBe(300);
  });
  it('脱离阳光每帧 −6 衰减', () => {
    const { w, p, scorch } = setup();
    for (let i = 0; i < 50; i++) scorch();
    w.clock.timeOfDay = 0;   // 入夜 → 不再暴露
    scorch();
    expect(p.sunScorchCounter).toBe(50 - 6);
  });
  it('死亡档 burning 清 + −2 衰减（:28101-28105）', () => {
    const { p, game } = setup();
    p.dead = true;
    (p as unknown as { updateSunScorchValues(g?: GameHooks): void }).updateSunScorchValues(game);
    expect(p.vampireBurningInSunlight).toBe(false);
    p.sunScorchCounter = 10;
    (p as unknown as { updateSunScorchValues(g?: GameHooks): void }).updateSunScorchValues(game);
    expect(p.sunScorchCounter).toBe(8);
  });
  it('120 档点火：AddBuff 24/23/32 各 3t + buffImmune 清空（:28168/:28179-28181）', () => {
    const { p, scorch } = setup();
    for (let i = 0; i < 119; i++) scorch();
    expect(p.buffs.has(BuffType.OnFire)).toBe(false);   // 119 档未点火
    p.buffs.immuneVanilla.add(24);                      // 预置免疫（如黑曜石头骨）
    scorch();                                           // 第 120 帧
    expect(p.sunScorchCounter).toBe(120);
    expect(p.buffs.has(BuffType.OnFire)).toBe(true);    // 24
    expect(p.buffs.has(BuffType.Cursed)).toBe(true);    // 23
    expect(p.buffs.has(BuffType.Slow)).toBe(true);      // 32
    expect(p.buffs.active.get(BuffType.OnFire)).toBeCloseTo(3 / 60, 5);   // 3 tick
    expect(p.buffs.immuneVanilla.size).toBe(0);         // Array.Clear 全清
  });
  it('点火卸翅膀与火箭靴（:28186-28187，equipStats S 档）', () => {
    const { p, scorch } = setup();
    p.inv.armor[3] = { id: iidOfVid(492), stack: 1 };   // 恶魔之翼（wingSlot 1）
    expect(p.equipStats.wing).not.toBeNull();           // 未灼：翅膀在
    for (let i = 0; i < 119; i++) scorch();
    expect(p.equipStats.wing).not.toBeNull();           // 蓄能期（V 档）不卸
    scorch();                                           // 120 档点火
    expect(p.sunScorchCounter).toBe(120);
    expect(p.equipStats.wing).toBeNull();               // wingsLogic=0
  });
  it('Molten 套 buffImmune[24] 门（:15883：炽灼中不免疫）', () => {
    const { p, scorch } = setup();
    p.inv.armor[0] = { id: iidOfVid(231), stack: 1 };   // Molten Helmet hs=9
    p.inv.armor[1] = { id: iidOfVid(232), stack: 1 };   // Breastplate bs=9
    p.inv.armor[2] = { id: iidOfVid(233), stack: 1 };   // Greaves ls=9
    expect(p.equipStats.setBonus?.name).toBe('Molten'); // 触发聚合（lazy getter）
    expect(p.buffs.immuneVanilla.has(24)).toBe(true);   // 常态免疫 On Fire!
    for (let i = 0; i < 10; i++) scorch();              // 灼但未到 120
    expect(p.vampireBurningInSunlight).toBe(true);
    expect(p.equipStats.setBonus?.name).toBe('Molten'); // 再读（游戏循环每帧读——键含 V 档触发重算）
    expect(p.buffs.immuneVanilla.has(24)).toBe(false);  // :15882 反门即失效
    expect(p.equipStats.fireWalk).toBe(true);           // 套装其余效果保留
  });
  it('OnFire 特档开关随链刷新（BuffState.vampireSeed）', () => {
    const { p, scorch } = setup();
    scorch();
    expect(p.buffs.vampireSeed).toBe(true);
    const plain = setup({ vampire: false });
    plain.scorch();
    expect(plain.p.buffs.vampireSeed).toBe(false);
  });
});

describe('炽灼音环（Player.cs:28107-28121）', () => {
  it('counter>0 起轨，音量随 counter/120，归零拆轨', () => {
    const { scorch, sizzle } = setup();
    scorch();                                            // counter=1 → 起轨 vol=1/120
    expect(sizzle.created).toBe(1);
    expect(sizzle.sizzleVol[0]).toBeCloseTo(1 / 120, 6);
    for (let i = 0; i < 59; i++) scorch();               // counter=60
    expect(sizzle.created).toBe(1);                      // 轨不重建
    expect(sizzle.sizzleVol[sizzle.sizzleVol.length - 1]).toBeCloseTo(60 / 120, 6);
  });
  it('脱离阳光衰减至 0 → 拆轨', () => {
    const s = setup();
    s.scorch();
    s.w.clock.timeOfDay = 0;                             // 入夜衰减
    for (let i = 0; i < 20; i++) s.scorch();             // counter 1→0（−6/t）
    expect(s.p.sunScorchCounter).toBe(0);
    expect(s.sizzle.stopped).toBe(1);
    expect(s.sizzle.created).toBe(1);
  });
  it('非吸血鬼世界不起轨', () => {
    const { scorch, sizzle } = setup({ vampire: false });
    for (let i = 0; i < 10; i++) scorch();
    expect(sizzle.created).toBe(0);
  });
});

// ---- 世界生成终段冒烟（RandomizeWorldSpawn + PlaceTorchesAroundSpawn，
//      WorldGen.cs:22625-22631；4200×1200 标准尺寸——小尺寸世界生成管线本身不支
//      持（1300×400 恒挂,非本链回归））----
describe('吸血鬼世界生成终段', () => {
  it('出生点重掷到地下带 + 周边火把落位', async () => {
    const { generateWorld } = await import('../src/world/gen/WorldGen');
    const w = await generateWorld({
      width: 4200, height: 1200,
      seedText: 'what a horrible night to have a curse', evil: 0,
    });
    expect(w.seedFlags.vampireSeed).toBe(true);
    // RandomizeWorldSpawn：出生行落 [worldSurface+200, surface+200+rockLevel)
    // （cs:24100-24101 + CheckForGoodTeleportationSpot 签名 startY/rangeY）
    expect(w.spawnY).toBeGreaterThanOrEqual(Math.floor(w.groundLevel) + 200);
    expect(w.spawnY).toBeLessThan(Math.floor(w.groundLevel) + 200 + Math.floor(w.rockLevel));
    // PlaceTorchesAroundSpawn：出生点 ±130 格内出现火把（tile 4）
    const st = w.store;
    const torchSheet = 4;
    let torches = 0;
    for (let dx = -130; dx <= 130; dx++) {
      for (let dy = -130; dy <= 130; dy++) {
        const x = w.spawnX + dx, y = w.spawnY + dy;
        if (!st.inBounds(x, y)) continue;
        const i = st.idx(x, y);
        if (st.flags[i]) {
          const { TILE_DEFS: TD } = await import('../src/data/tiles');
          if (TD[st.type[i]]?.vanilla?.sheet === torchSheet) torches++;
        }
      }
    }
    expect(torches).toBeGreaterThan(0);
  }, 300000);
});
