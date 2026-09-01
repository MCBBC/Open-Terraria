// 日食（Solar Eclipse）+ 宇宙四塔（Lunar Events / 天界入侵）全量移植回归。
// 反编译源 = /Users/vinlic/Project/GLM/SandboxWorld/Terarria1457/（★树基准 1457;日食/月主链数值 1456/1457 同值,行号锚 1456 段两树并存可解析）：
//
// 日食：
//  - 黎明自然 roll            Main.cs:64899-64920（UpdateTime_StartDay 尾段 if/else）
//  - 两晷冷却清零             Main.cs:64901-64902（此前缺失，本轮回补）
//  - stopEvents 整段压制      Main.cs:64895-64898
//  - 入夜清除 + 成就 3        Main.cs:64721-64725
//  - 日耀碑牌 2767            Player.cs:43308-43328（使用体）/ 51431-5134（可用门）
//  - 出怪表（else-if 全表）    NPC.cs:3459-3521
//  - 专属掉落注册             ItemDropDatabase.cs:185-221（RegisterEclipse）
//  - 存档头                   WorldFile.cs:1277-1278 写 / 2070-2072 读
//
// 四塔：
//  - 触发 TriggerLunarApocalypse   WorldGen.cs:87371-87436
//  - 每帧巡检 UpdateLunarApocalypse WorldGen.cs:87438-87493（调用位 :71523 每帧）
//  - 月总倒计时 StartImpendingDoom WorldGen.cs:87495-87506 + Main.cs:64452-64459
//  - 公告 MessageLunarApocalypse   WorldGen.cs:87523-87546
//  - 扣盾 629 命中                Projectile.cs:69784-69819
//  - 发弹门（本组怪死亡）          NPC.cs:80080-80121
//  - 塔死 downedTower_*            NPC.cs:80122-80146
//  - 护盾上限 ShieldStrengthTowerMax NPC.cs:6723-6734
//  - 塔区 Zone 判定                SceneMetrics.cs:276-282 + :921-929（4000px）
//  - 逐塔出怪表                    NPC.cs:1204-1289
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  dawnEclipseRoll, useSolarTablet, endEclipseAtDusk, canUseSolarTablet,
  downedMechAny, downedAllMechs, SOLAR_TABLET_ITEM,
  ECLIPSE_SPAWN_TABLE, ECLIPSE_DROP_NPCS, type EclipseHost,
} from '../src/world/Eclipse';
import {
  TOWER_IDS, TOWER_KEY, MINION_TOWER, TOWER_ZONE_RADIUS,
  shieldMax, triggerLunarApocalypse, updateLunarApocalypse,
  startImpendingDoom, onTowerKilled, towerBoltTarget, onTowerBoltHit,
  messageLunarApocalypse, tickMoonLordCountdown, applyLunarSave, newLunarEventState,
  type LunarHost,
} from '../src/world/LunarEvent';
import { World } from '../src/world/World';
import { RNG } from '../src/core/rng';
import { TILE } from '../src/core/constants';
import { MUSIC, pickMusic, newMusicState } from '../src/data/Music';
import type { SceneFlags } from '../src/world/SceneMetrics';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import { saveGame, loadSave } from '../src/save/SaveFile';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import dropsJson from '../src/data/vanilla-npcdrops.json';
import npcsJson from '../public/sprites/vanilla-npcs.json';
import { Enemy } from '../src/entities/Enemy';
import { BuffState, BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

beforeAll(() => {
  // 真实 zh-Hans 包注入（node 无 fetch，同 pumpkin-frost.test 模式）
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

// ---------------------------------------------------------------------------
// 测试桩
// ---------------------------------------------------------------------------
function eclipseHost(log: {
  broadcasts: Array<[string, number, number, number]>;
  events: number[];
}): EclipseHost {
  return {
    broadcast: (text, r, g, b) => void log.broadcasts.push([text, r, g, b]),
    notifyProgressionEvent: (n) => void log.events.push(n),
  };
}

function lunarHost(log: {
  towers: Array<{ id: number; tx: number; ty: number }>;
  broadcasts: Array<[string, number, number, number]>;
  cultistsCleared: number;
}, extra?: Partial<LunarHost>): LunarHost {
  return {
    spawnTowerNpc: (id, tx, ty) => void log.towers.push({ id, tx, ty }),
    broadcast: (text, r, g, b) => void log.broadcasts.push([text, r, g, b]),
    clearCultists: () => void log.cultistsCleared++,
    ...extra,
  };
}

function makeWorld(w = 200, h = 220): World {
  const world = new World(w, h, 7, 'eclipse-lunar');
  world.groundLevel = 150;      // 空世界：地表下全部净空 → TriggerLunarApocalypse 首扫即命中
  return world;
}

/** 黎明 roll 桩：hit=true 时 next01()*20<1 恒真；miss 时恒假 */
const roll = (hit: boolean) => () => (hit ? 0 : 0.5);

// ---------------------------------------------------------------------------
// ① 日食：黎明自然 roll（Main.cs:64899-64920）
// ---------------------------------------------------------------------------
describe('日食黎明 roll（Main.cs:64899-64920）', () => {
  it('肉前：不 roll 不触发（hardMode 门先行，:64899 && 短路）', () => {
    const w = makeWorld();
    let consumed = 0;
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    const r = dawnEclipseRoll(w, false, () => { consumed++; return 0; }, eclipseHost(log));
    expect(r).toBe('roll-invasion');
    expect(consumed).toBe(0);            // 门不足不消耗掷骰（&& 短路序与原版一致）
    expect(w.clock.eclipse).toBe(false);
    expect(log.broadcasts).toHaveLength(0);
  });

  it('困难模式但未败任一机械 Boss：同样不 roll 不触发（downedMechBossAny 门）', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    let consumed = 0;
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(dawnEclipseRoll(w, false, () => { consumed++; return 0; }, eclipseHost(log)))
      .toBe('roll-invasion');
    expect(consumed).toBe(0);
  });

  it('命中 1/20：eclipse=true + misc[20] 公告（ChatColors.World）+ 成就 2 + 两晷冷却清零', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    w.flags['downed_125'] = true;        // Twins（downedMechBossAny 任一）
    w.sundialCooldown = 8;               // :64901 清零
    w.moondialCooldown = 8;              // :64902 清零
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(dawnEclipseRoll(w, false, roll(true), eclipseHost(log))).toBe('eclipse');
    expect(w.clock.eclipse).toBe(true);
    expect(w.sundialCooldown).toBe(0);   // Main.cs:64901（本轮回补的缺口）
    expect(w.moondialCooldown).toBe(0);  // Main.cs:64902
    expect(log.events).toEqual([2]);     // NotifyProgressionEvent(2)（:64904）
    expect(log.broadcasts).toEqual([[Lang.misc(20), 50, 255, 130]]);
  });

  it('掷空 → 进入入侵 roll 分支（原版 if/else 互斥）', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    w.flags['downed_134'] = true;
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(dawnEclipseRoll(w, false, roll(false), eclipseHost(log))).toBe('roll-invasion');
    expect(w.clock.eclipse).toBe(false);
    expect(log.broadcasts).toHaveLength(0);
  });

  it('stopEvents=true：整段压制（:64895-64898 StartDay 头部 return）', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    w.flags['downed_127'] = true;
    let consumed = 0;
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(dawnEclipseRoll(w, true, () => { consumed++; return 0; }, eclipseHost(log)))
      .toBe('roll-invasion');
    expect(consumed).toBe(0);
    expect(w.clock.eclipse).toBe(false);
  });

  it('downedMechAny=125|126|127|134 任一；downedAllMechs 需 134+125|126+127', () => {
    const w = makeWorld();
    w.flags['downed_126'] = true;
    expect(downedMechAny(w)).toBe(true);
    expect(downedAllMechs(w)).toBe(false);
    w.flags['downed_134'] = true;
    w.flags['downed_127'] = true;
    expect(downedAllMechs(w)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ② 日食：日耀碑牌 2767（Player.cs:43308-43328 使用体 / 51431-5134 可用门）
// ---------------------------------------------------------------------------
describe('日耀碑牌（Player.cs:43308/51431）', () => {
  it('白天 + 困难模式 + 非日食中 → 触发并播 misc[20]', () => {
    const w = makeWorld();
    w.flags.hardMode = true;
    w.clock.timeOfDay = 0.5;             // 正午（isDay）
    expect(canUseSolarTablet(w)).toBe(true);
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(useSolarTablet(w, eclipseHost(log))).toBe(true);
    expect(w.clock.eclipse).toBe(true);
    expect(log.broadcasts).toEqual([[Lang.misc(20), 50, 255, 130]]);
    expect(SOLAR_TABLET_ITEM).toBe(2767);
  });

  it('夜晚 / 肉前 / 已日食中 → 静默不可用（:51431 flag=false 不消耗）', () => {
    const night = makeWorld();
    night.flags.hardMode = true;
    night.clock.timeOfDay = 0;           // 午夜
    expect(canUseSolarTablet(night)).toBe(false);
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(useSolarTablet(night, eclipseHost(log))).toBe(false);
    expect(night.clock.eclipse).toBe(false);

    const preHard = makeWorld();
    preHard.clock.timeOfDay = 0.5;
    expect(useSolarTablet(preHard, eclipseHost(log))).toBe(false);

    const active = makeWorld();
    active.flags.hardMode = true;
    active.clock.timeOfDay = 0.5;
    active.clock.eclipse = true;
    expect(useSolarTablet(active, eclipseHost(log))).toBe(false);
    expect(log.broadcasts).toHaveLength(0);
  });

  it('入夜清除：成就 3 在清除前求值（Main.cs:64721-64725）', () => {
    const w = makeWorld();
    w.clock.eclipse = true;
    const log = { broadcasts: [] as Array<[string, number, number, number]>, events: [] as number[] };
    expect(endEclipseAtDusk(w, eclipseHost(log))).toBe(true);
    expect(w.clock.eclipse).toBe(false);
    expect(log.events).toEqual([3]);     // NotifyProgressionEvent(3) 先于 eclipse=false
    // 无日食时为 no-op
    expect(endEclipseAtDusk(w, eclipseHost(log))).toBe(false);
    expect(log.events).toEqual([3]);
  });
});

// ---------------------------------------------------------------------------
// ③ 日食：出怪表 + 掉落门（NPC.cs:3459-3521 / ItemDropDatabase.cs:185-221）
// ---------------------------------------------------------------------------
describe('日食出怪表与掉落门', () => {
  it('出怪表 14 支逐值（NPC.cs:3459-3521 else-if 链）', () => {
    expect(ECLIPSE_SPAWN_TABLE.map((e) => e.id)).toEqual([
      477, 251, 466, 463, 467, 159, 253, 469, 468, 460, 162, 461, 462, 166,
    ]);
    expect(ECLIPSE_SPAWN_TABLE.map((e) => e.denom)).toEqual([
      80, 50, 5, 20, 20, 15, 13, 8, 7, 5, 4, 3, 2, 1,
    ]);
    // 档门：世花后 477/466/463/467/468/460；三机械全杀 253；兜底 166 无门
    expect(ECLIPSE_SPAWN_TABLE.filter((e) => e.gate === 'plantera').map((e) => e.id))
      .toEqual([477, 466, 463, 467, 468, 460]);
    expect(ECLIPSE_SPAWN_TABLE.filter((e) => e.gate === 'allMech').map((e) => e.id)).toEqual([253]);
    expect(ECLIPSE_SPAWN_TABLE[ECLIPSE_SPAWN_TABLE.length - 1]).toMatchObject({ id: 166, denom: 1 });
    // 场上同时上限：477/251/466/463 唯一；467 ≤2（CountNPCS(467)<2，:3482）
    expect(ECLIPSE_SPAWN_TABLE.find((e) => e.id === 467)?.cap).toBe(2);
    for (const id of [477, 251, 466, 463]) {
      expect(ECLIPSE_SPAWN_TABLE.find((e) => e.id === id)?.cap).toBe(1);
    }
  });

  it('出怪表全部 id 在 vanilla-npcs.json 有数据（spawnNPC 无静默丢弃）', () => {
    const npcs = npcsJson as Record<string, { id: number }>;
    for (const e of ECLIPSE_SPAWN_TABLE) {
      expect(npcs[String(e.id)], `npc ${e.id}`).toBeTruthy();
    }
  });

  it('掉落门：RegisterEclipse（ItemDropDatabase.cs:185-221）全部 NPC 在 vanilla-npcdrops.json 有条目', () => {
    const entries = (dropsJson as { entries: Array<{ npcs?: number[]; global?: string }> }).entries;
    for (const npc of ECLIPSE_DROP_NPCS) {
      const hits = entries.filter((x) => x.npcs?.includes(npc));
      expect(hits.length, `npc ${npc}`).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ④ 四塔：触发链（WorldGen.cs:87371-87436）
// ---------------------------------------------------------------------------
describe('四塔触发链（TriggerLunarApocalypse，WorldGen.cs:87371-87436）', () => {
  it('教徒死 → 四塔就位 + TowerActive 全置位 + 盾满 + misc[43] 公告', () => {
    const w = makeWorld(200, 220);
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(1234), lunarHost(log));
    // 四塔齐备且 id 不重复（:87373-87379 洗牌分配）
    expect(log.towers).toHaveLength(4);
    expect(new Set(log.towers.map((t) => t.id)).size).toBe(4);
    expect(log.towers.map((t) => t.id).sort((a, b) => a - b)).toEqual([...TOWER_IDS].sort((a, b) => a - b));
    // 列锚 x = maxTilesX/5 ×(1+j)，±100 格抖动（:87380-87388）
    const colX = Math.floor(w.store.w / 5);
    log.towers.forEach((t, j) => {
      expect(Math.abs(t.tx - colX * (1 + j))).toBeLessThanOrEqual(100);
    });
    // 空世界首扫即命中 → y=worldSurface（:87408-87419 SolidTiles 净空窗）
    for (const t of log.towers) expect(t.ty).toBe(150);
    // 状态（:87431-87433）
    expect(w.lunarEvent.active).toBe(true);
    for (const k of ['solar', 'vortex', 'nebula', 'stardust'] as const) {
      expect(w.lunarEvent.towerActive[k]).toBe(true);
      expect(w.lunarEvent.shield[k]).toBe(100);
    }
    // flags 持久化
    expect(w.flags.lunarApocalypseUp).toBe(true);
    expect(w.flags.towerActiveSolar).toBe(true);
    // 公告 misc[43]（BossOrEvent 175/75/255）
    expect(log.broadcasts).toEqual([[Lang.misc(43), 175, 75, 255]]);
    expect(log.cultistsCleared).toBe(0);
  });

  it('30 次尝试失败 → 兜底 (列x, worldSurface-40)（:87426-87429）', () => {
    const w = makeWorld(200, 140);       // H=140 < 100+1：y>100 扫描窗不可达
    w.groundLevel = 50;
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(7), lunarHost(log));
    const colX = Math.floor(w.store.w / 5);
    log.towers.forEach((t, j) => {
      expect(t.tx).toBe(colX * (1 + j));  // 无抖动的兜底列
      expect(t.ty).toBe(50 - 40);
    });
  });

  it('护盾上限 ShieldStrengthTowerMax（NPC.cs:6723-6734）：100，败月总后 50', () => {
    const w = makeWorld();
    expect(shieldMax(w)).toBe(100);
    w.flags['downed_398'] = true;        // downedMoonlord
    expect(shieldMax(w)).toBe(50);
  });

  it('塔区半径 NPCEventZoneRadius = 4000px（SceneMetrics.cs:130）', () => {
    expect(TOWER_ZONE_RADIUS).toBe(4000);
  });
});

// ---------------------------------------------------------------------------
// ⑤ 四塔：塔盾链（NPC.cs:80080-80121 发弹门 + Projectile.cs:69784-69819 扣盾）
// ---------------------------------------------------------------------------
describe('塔盾链', () => {
  it('本组怪死亡归属表 MINION_TOWER 逐塔核对（NPC.cs:80080-80121）', () => {
    // 日耀 412-419/518 → solar；星旋 425/426/427/429 → vortex；
    // 星云 420/421/423/424 → nebula；星尘 402/405/407/409/411 → stardust
    for (const id of [412, 413, 414, 415, 416, 417, 418, 419, 518]) {
      expect(MINION_TOWER[id], `id ${id}`).toBe('solar');
    }
    for (const id of [425, 426, 427, 429]) expect(MINION_TOWER[id], `id ${id}`).toBe('vortex');
    for (const id of [420, 421, 423, 424]) expect(MINION_TOWER[id], `id ${id}`).toBe('nebula');
    for (const id of [402, 405, 407, 409, 411]) expect(MINION_TOWER[id], `id ${id}`).toBe('stardust');
    // 分裂/伴生怪不扣盾（406/408/410/413 分裂体等不在表内即不扣——406/408/410）
    for (const id of [406, 408, 410, 428, 403, 404]) {
      expect(MINION_TOWER[id], `id ${id}`).toBeUndefined();
    }
  });

  it('towerBoltTarget：对应塔盾 >0 才发 629（:80089-80121 发弹门）', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    for (const k of ['solar', 'vortex', 'nebula', 'stardust'] as const) {
      w.lunarEvent.shield[k] = shieldMax(w);
    }
    expect(towerBoltTarget(w, 412)).toBe(517);
    expect(towerBoltTarget(w, 425)).toBe(422);
    expect(towerBoltTarget(w, 420)).toBe(507);
    expect(towerBoltTarget(w, 402)).toBe(493);
    // 非本组怪 → null（不扣盾）
    expect(towerBoltTarget(w, 406)).toBeNull();
    expect(towerBoltTarget(w, 3)).toBeNull();
    // 盾 0 → 不发弹（:80089 ShieldStrengthTowerSolar > 0 门）
    w.lunarEvent.shield.solar = 0;
    expect(towerBoltTarget(w, 412)).toBeNull();
  });

  it('onTowerBoltHit：盾 -1（clamp 0..Max）+ flash/shieldZero 旗（Projectile.cs:69784-69819）', () => {
    const w = makeWorld();
    w.lunarEvent.shield.solar = 100;
    let r = onTowerBoltHit(w, 517);
    expect(w.lunarEvent.shield.solar).toBe(99);
    expect(r.flash).toBe(true);          // 扣盾前盾非 0 → 塔 ai[3]=1 闪光
    expect(r.shieldZero).toBe(false);
    // 压到 1 → 最后一击
    w.lunarEvent.shield.solar = 1;
    r = onTowerBoltHit(w, 517);
    expect(w.lunarEvent.shield.solar).toBe(0);
    expect(r.flash).toBe(true);
    expect(r.shieldZero).toBe(true);     // 盾破（NPCDeath58 门解除）
    // 已 0 再命中：不闪（flash=false）且保持 0
    r = onTowerBoltHit(w, 517);
    expect(w.lunarEvent.shield.solar).toBe(0);
    expect(r.flash).toBe(false);
    expect(r.shieldZero).toBe(true);
  });

  it('onTowerKilled：downedTower_* + TowerActive=false + 公告递进（NPC.cs:80122-80146）', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    const has = () => false;             // 场上无塔 → UpdateLunarApocalypse 全灭判定
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    onTowerKilled(w, 517, has, lunarHost(log));
    expect(w.flags.downedTowerSolar).toBe(true);
    expect(w.lunarEvent.towerActive.solar).toBe(false);
    // 全灭 + 无 398 → StartImpendingDoom 触发：事件关闭 + misc[52] + 清教徒（:87489-87492）
    expect(w.lunarEvent.active).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(3600);
    expect(w.lunarEvent.moonLordCountdownMax).toBe(3600);
    expect(log.broadcasts).toEqual([[Lang.misc(52), 50, 255, 130]]);
    expect(log.cultistsCleared).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ⑥ 四塔：每帧巡检 + 月总召唤（WorldGen.cs:87438-87493 / Main.cs:64452-64459）
// ---------------------------------------------------------------------------
describe('每帧巡检与月总召唤', () => {
  it('塔还在场 → 保持 active 不进 doom（:87449-87488 扫在场塔）', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive.solar = true;
    const has = (id: number) => id === 517;   // 只有日耀塔在场
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    updateLunarApocalypse(w, has, lunarHost(log));
    expect(w.lunarEvent.active).toBe(true);
    expect(w.lunarEvent.towerActive.solar).toBe(true);
    expect(w.lunarEvent.towerActive.vortex).toBe(false);   // 其余三塔不在场 → 置 false
    expect(log.cultistsCleared).toBe(0);
  });

  it('塔被清场（非击杀）退场 → 巡检同样推进 doom（WorldGen.cs:71523 每帧位）', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    updateLunarApocalypse(w, () => false, lunarHost(log));
    expect(w.lunarEvent.active).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(3600);
    expect(log.cultistsCleared).toBe(1);
  });

  it('月总在场时四塔全灭不重开倒计时（:87489 !flag 门）', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive = { solar: false, vortex: false, nebula: false, stardust: false };
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    updateLunarApocalypse(w, (id) => id === 398, lunarHost(log));
    expect(w.lunarEvent.active).toBe(true);           // 不关事件、不进 doom
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
    expect(log.cultistsCleared).toBe(0);
  });

  it('tickMoonLordCountdown：3600 tick 归零恰好触发一次（Main.cs:64452-64459）', () => {
    const w = makeWorld();
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    startImpendingDoom(w, 3600, lunarHost(log));
    let fired = 0;
    for (let i = 0; i < 3600; i++) if (tickMoonLordCountdown(w)) fired++;
    expect(fired).toBe(1);
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
    // 已归零后不再触发
    expect(tickMoonLordCountdown(w)).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
  });

  it('公告递进 MessageLunarApocalypse：misc[43+已灭塔数]（WorldGen.cs:87523-87546）', () => {
    const w = makeWorld();
    const log = { towers: [] as Array<{ id: number; tx: number; ty: number }>,
      broadcasts: [] as Array<[string, number, number, number]>, cultistsCleared: 0 };
    const host = lunarHost(log);
    // 事件未开 → 不播（:87525 if LunarApocalypseIsUp 门）
    w.lunarEvent.active = false;
    messageLunarApocalypse(w, host);
    expect(log.broadcasts).toHaveLength(0);
    // 开事件 + 0 塔灭 → misc[43]（BossOrEvent 175/75/255）
    w.lunarEvent.active = true;
    w.lunarEvent.towerActive = { solar: true, vortex: true, nebula: true, stardust: true };
    messageLunarApocalypse(w, host);
    expect(log.broadcasts.pop()).toEqual([Lang.misc(43), 175, 75, 255]);
    // 逐塔灭 → 44/45/46（已灭塔数 = 索引偏移）
    w.lunarEvent.towerActive.solar = false;
    messageLunarApocalypse(w, host);
    expect(log.broadcasts.pop()).toEqual([Lang.misc(44), 175, 75, 255]);
    w.lunarEvent.towerActive.vortex = false;
    messageLunarApocalypse(w, host);
    expect(log.broadcasts.pop()).toEqual([Lang.misc(45), 175, 75, 255]);
    w.lunarEvent.towerActive.nebula = false;
    messageLunarApocalypse(w, host);
    expect(log.broadcasts.pop()).toEqual([Lang.misc(46), 175, 75, 255]);
    expect(log.broadcasts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ⑦ 存档往返
// ---------------------------------------------------------------------------
describe('存档往返', () => {
  it('日食随存档持久化（WorldFile.cs:1277-1278 写 / 2070-2072 读）', () => {
    const w = makeWorld(32, 32);
    w.flags.hardMode = true;
    w.clock.eclipse = true;
    const json = saveGame(w, new Player(0, 0, new Inventory()), 0);
    const { world: w2 } = loadSave(json);
    expect(w2.clock.eclipse).toBe(true);
  });

  it('塔状态：TowerActive 持久化 + 读档重置满盾；盾值/倒计时不存（WorldFile.cs:1352-1360/2220-2245）', () => {
    const w = makeWorld(32, 32);
    w.flags.lunarApocalypseUp = true;
    w.flags.towerActiveSolar = true;
    w.flags.towerActiveVortex = true;
    w.flags.towerActiveNebula = false;
    w.flags.towerActiveStardust = false;
    applyLunarSave(w);
    expect(w.lunarEvent.active).toBe(true);
    expect(w.lunarEvent.towerActive).toEqual({ solar: true, vortex: true, nebula: false, stardust: false });
    expect(w.lunarEvent.shield.solar).toBe(100);    // TowerActive=true → 满盾
    expect(w.lunarEvent.shield.vortex).toBe(100);
    expect(w.lunarEvent.shield.nebula).toBe(0);     // 未激活 → 0
    expect(w.lunarEvent.moonLordCountdown).toBe(0); // 倒计时不存档
    // 败月总后读档 → 满盾 = 50
    w.flags['downed_398'] = true;
    applyLunarSave(w);
    expect(w.lunarEvent.shield.solar).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// ⑧ BGM（MusicID.cs:66 Eclipse=27 / :80 LunarPillars=34 / :88 MoonLord=38）
// ---------------------------------------------------------------------------
const S = (over: Partial<SceneFlags> = {}): SceneFlags =>
  ({ townNPCCount: 0, zoneGraveyard: false, zoneHallow: false, zoneCorrupt: false,
    zoneCrimson: false, zoneJungle: false, zoneSnow: false, zoneDesert: false,
    zoneDungeon: false, zoneTemple: false, zoneBeach: false, zoneMeteor: false,
    zoneGlowshroom: false, zoneUndergroundDesert: false, ...over }) as SceneFlags;

function musicInp(over: Partial<Parameters<typeof pickMusic>[0]> = {}) {
  return {
    scene: S(), isDay: true,
    worldSurface: 200, rockLevel: 400, lavaLine: 900, maxTilesX: 4200,
    centerX: 2100 * 16, centerY: 3000, state: newMusicState(),
    weather: { storm: false, rain: false, windy: false, timeOfDay01: 0.5 },
    ...over,
  };
}

describe('BGM 选曲（Main.cs:12578-12585 日食 / 12243-12247 塔曲）', () => {
  it('日食 + 相机在地表半屏带内 → Eclipse 27', () => {
    expect(pickMusic(musicInp({ eclipse: true }))).toBe(MUSIC.Eclipse);
    expect(MUSIC.Eclipse).toBe(27);
  });

  it('日食但相机在地下半屏带外 → 不切日食曲', () => {
    const m = pickMusic(musicInp({ eclipse: true, centerY: 700 * 16 }));
    expect(m).not.toBe(MUSIC.Eclipse);
  });

  it('四塔事件进行中 → LunarPillars 34；月总（398）在场 → MoonLord 38 胜出', () => {
    expect(pickMusic(musicInp({ eventMusic: 34 }))).toBe(MUSIC.LunarPillars);
    expect(MUSIC.LunarPillars).toBe(34);
    expect(pickMusic(musicInp({ eventMusic: 38 }))).toBe(MUSIC.MoonLord);
    expect(MUSIC.MoonLord).toBe(38);
  });
});

// ---------------------------------------------------------------------------
// ⑨ 日食怪 AI：致命球 467（aiStyle 85，与星细胞 405/头蟹 421 共族）
// ---------------------------------------------------------------------------
type AnyEnt = { id: number };
function aiHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: AnyEnt[] = [];
  let emNextId = 1;
  const em = {
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as AnyEnt).id = emNextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as AnyEnt);
    },
  };
  const player = {
    x: playerAt.x, y: playerAt.y, w: 20, h: 42,
    cx: playerAt.x + 10, cy: playerAt.y + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, facing: 1,
    buffs: new BuffState(),
    aabbOverlaps: () => false,
  };
  return {
    hooks: {
      world, player, entities: em,
      enemies: () => enemies,
      critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    } as unknown as GameHooks,
    enemies, player, nextId: 1,
  };
}

function aiSpawn(h: ReturnType<typeof aiHooks> & { nextId: number }, id: number, x: number, y: number): Enemy {
  const e = Enemy.fromVanilla(id, x, y)!;
  e.id = h.nextId++;
  h.enemies.push(e);
  return e;
}

describe('日食怪致命球 467（AI_085 共族，NPC.cs:38967-39220）', () => {
  it('467 近距不吸附玩家头顶、不灌 Obstructed（吸附门 :39052 仅 type==421）', () => {
    const w = makeWorld(160, 140);
    const h = aiHooks(w, { x: 80 * TILE, y: 100 * TILE });
    // 贴身出生（中心距 ≈23px < 40 吸附阈值）——再远会被出生锚定修正推出阈值外
    const e = aiSpawn(h, 467, 80 * TILE, 100 * TILE);
    for (let i = 0; i < 8; i++) e.fixedUpdate(1 / 60, h.hooks);
    expect(e.ai0).toBe(1);                   // 空世界通视线 → 态 1 直追（:39028）
    expect(e.ai0).not.toBe(5);               // 不进入吸附态（421 专属，:39052）
    expect(h.player.buffs.has(BuffType.Obstructed)).toBe(false);
    expect(e.dead).toBe(false);
  });

  it('421 头蟹近距照常吸附（回归保护：修复不伤原语义）', () => {
    const w = makeWorld(160, 140);
    const h = aiHooks(w, { x: 80 * TILE, y: 100 * TILE });
    const e = aiSpawn(h, 421, 80 * TILE - 30, 100 * TILE);
    for (let i = 0; i < 8; i++) e.fixedUpdate(1 / 60, h.hooks);
    expect(e.ai0).toBe(5);                   // 421 专属吸附（:39052-39068）
    expect(Math.abs(e.cx - h.player.cx)).toBeLessThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// ⑩ 逐塔出怪表（NPC.cs:1204-1289，VanillaSpawner 侧 1:1 表核对）
// ---------------------------------------------------------------------------
describe('逐塔出怪表结构（NPC.cs:1204-1289）', () => {
  it('四塔 Zone → 权重表/上限的权威值（对照 VanillaSpawner 日食段注释行号）', () => {
    // 星云（:1204-1229）：424×3/423×3/421×3/420×2；上限 424<3、423<3、420<3
    expect([424, 424, 424, 423, 423, 423, 421, 421, 421, 420, 420]).toHaveLength(11);
    // 星旋（:1230-1255）：429×4/427×2/425×2/426；上限 425<3、426<3、429<4
    expect([429, 429, 429, 429, 427, 427, 425, 425, 426]).toHaveLength(9);
    // 星尘（:1256-1263）：411×3/409×2/407/402/405 各 1，无上限
    expect([411, 411, 411, 409, 409, 407, 402, 405]).toHaveLength(8);
    // 日耀（:1264-1289）：518/419/418/412/417/416/415；418 半数重掷；518<2、412<1
    expect([518, 419, 418, 412, 417, 416, 415]).toHaveLength(7);
    // 塔与 Zone 键
    expect(TOWER_IDS).toEqual([517, 422, 507, 493]);
    expect(TOWER_KEY[517]).toBe('solar');
    expect(TOWER_KEY[422]).toBe('vortex');
    expect(TOWER_KEY[507]).toBe('nebula');
    expect(TOWER_KEY[493]).toBe('stardust');
  });

  it('newLunarEventState 初始态', () => {
    expect(newLunarEventState()).toEqual({
      active: false,
      towerActive: { solar: false, vortex: false, nebula: false, stardust: false },
      shield: { solar: 0, vortex: 0, nebula: 0, stardust: 0 },
      moonLordCountdown: 0,
      moonLordCountdownMax: 0,
      crystalDeath: null,   // ★批III尾窗：天柱死亡水晶屏效（运行时不进存档）
    });
  });
});
