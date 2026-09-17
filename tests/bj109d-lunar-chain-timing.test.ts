// BJ109-D 判别力测：四柱事件态「全链时序」——触发→四塔置位→盾满→塔倒计数→
// 月主解锁链→读档回填。原版链锚（1457，行号已用 command grep 重定位）：
//  - TriggerLunarApocalypse   WorldGen.cs:87909-87974（洗牌分配/列锚/抖动/盾满/lunarEvent 置位）
//  - UpdateLunarApocalypse    WorldGen.cs:87976-88031（每帧巡检 WorldGen.cs:72049）
//  - StartImpendingDoom        WorldGen.cs:88033-88044（关事件+倒计时+清教徒）
//  - MessageLunarApocalypse   WorldGen.cs:88061-88078（misc[43+已倒数]，active 门）
//  - 塔死链（downedTower_*）   NPC.cs:80137-80160（flag→TowerActive=false→Update→Message，序钉死）
//  - 教徒死→触发               NPC.cs:80210-80212
//  - 倒计时递减/召 398         Main.cs:65963-65969（SpawnOnPlayer case 398 :81399-81406）
//  - 盾满回填（读档）          WorldFile.cs:2242-2251（TowerActive→Shield=Max）
//  - 塔碎片掉落（对照用）      ItemDropDatabase.cs:610-629 RegisterBoss_LunarTowers
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TOWER_IDS, TOWER_KEY, triggerLunarApocalypse, updateLunarApocalypse,
  startImpendingDoom, onTowerKilled, onTowerBoltHit, messageLunarApocalypse,
  tickMoonLordCountdown, applyLunarSave, respawnMissingTowers, shieldMax,
  type LunarHost,
} from '../src/world/LunarEvent';
import { World } from '../src/world/World';
import { RNG } from '../src/core/rng';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

interface Log {
  towers: Array<{ id: number; tx: number; ty: number }>;
  broadcasts: Array<[string, number, number, number]>;
  cultistsCleared: number;
}
function lunarHost(log: Log): LunarHost {
  return {
    spawnTowerNpc: (id, tx, ty) => void log.towers.push({ id, tx, ty }),
    broadcast: (text, r, g, b) => void log.broadcasts.push([text, r, g, b]),
    clearCultists: () => void log.cultistsCleared++,
  };
}
function makeWorld(w = 420, h = 220): World {
  const world = new World(w, h, 7, 'bj109d-chain');
  world.groundLevel = 150;
  return world;
}
/** has() 桩：towerActive 为 true 的塔视为在场（对齐 updateLunarApocrisy 消费面） */
function hasByTowerActive(w: World) {
  return (id: number) => w.lunarEvent.towerActive[TOWER_KEY[id]];
}

// ---------------------------------------------------------------------------
// ① 全链时序：触发 → 逐塔击倒（公告递进）→ 第 4 塔只播 doom（序敏感）
// ---------------------------------------------------------------------------
describe('BJ109-D 全链时序（触发→塔倒计数→ImpendingDoom→月主召）', () => {
  it('触发→四塔置位+盾满+misc[43]；杀 1/2/3 塔公告递进 misc[44][45][46] 且 downedTower_* 逐旗翻转', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(1234), lunarHost(log));
    expect(w.lunarEvent.active).toBe(true);
    expect(new Set(log.towers.map((t) => t.id)).size).toBe(4);
    for (const id of TOWER_IDS) {
      expect(w.lunarEvent.towerActive[TOWER_KEY[id]]).toBe(true);
      expect(w.lunarEvent.shield[TOWER_KEY[id]]).toBe(100);
    }
    expect(log.broadcasts).toEqual([[Lang.misc(43), 175, 75, 255]]);

    // 逐塔击倒（模拟场上仍有其余塔的存活态：has=其余 towerActive）
    const killSeq = [517, 422, 507];
    const expectMsg = [44, 45, 46];
    for (let i = 0; i < killSeq.length; i++) {
      const id = killSeq[i] as 517 | 422 | 507;   // ★BJ109-D at 参随伪影拆除
      const alive = hasByTowerActive(w);
      onTowerKilled(w, id, alive, lunarHost(log));
      expect(w.flags[`downedTower${['Solar', 'Vortex', 'Nebula', 'Stardust'][TOWER_IDS.indexOf(id)]}`]).toBe(true);
      expect(w.lunarEvent.towerActive[TOWER_KEY[id]]).toBe(false);
      // 事件仍开（还有塔活着）→ 公告 misc[43+n]（WorldGen.cs:88061 active 门）
      expect(w.lunarEvent.active).toBe(true);
      expect(log.broadcasts[log.broadcasts.length - 1]).toEqual([Lang.misc(expectMsg[i]), 175, 75, 255]);
      expect(w.lunarEvent.moonLordCountdown).toBe(0);   // 未全灭不进 doom
      expect(log.cultistsCleared).toBe(0);
    }
  });

  it('第 4 塔倒 → 先 Update 后 Message（序敏感）：只播 misc[52]，不再补 misc[46]；倒计时 3600 + 清教徒', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(99), lunarHost(log));
    for (const id of TOWER_IDS) onTowerKilled(w, id, hasByTowerActive(w), lunarHost(log));
    // StartImpendingDoom（WorldGen.cs:88033-88044）
    expect(w.lunarEvent.active).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(3600);
    expect(w.lunarEvent.moonLordCountdownMax).toBe(3600);
    expect(w.flags.lunarApocalypseUp).toBe(false);
    // 序敏感：塔倒链为 flag→TowerActive→Update(可能关事件)→Message——第 4 塔时
    // Message 因 active=false 空转（WorldGen.cs:88062 门）→ misc[46] 只在第 3 塔那拍
    // 播一次；若先 Message 后 Update（序颠倒），第 4 塔那拍会再播一次 misc[46]
    expect(log.broadcasts.filter((b) => b[0] === Lang.misc(46))).toHaveLength(1);
    // misc[47]（n=4）原版不可达：第 4 塔那拍 Update 已先关事件（:88062 active 门）
    expect(log.broadcasts.filter((b) => b[0] === Lang.misc(47))).toHaveLength(0);
    expect(log.broadcasts.filter((b) => b[0] === Lang.misc(52))).toHaveLength(1);
    expect(log.broadcasts[log.broadcasts.length - 1]).toEqual([Lang.misc(52), 50, 255, 130]);
    expect(log.cultistsCleared).toBe(1);              // GetRidOfCultists 恰一次
    for (const id of TOWER_IDS) {
      expect(w.flags[`downedTower${['Solar', 'Vortex', 'Nebula', 'Stardust'][TOWER_IDS.indexOf(id)]}`]).toBe(true);
    }
  });

  it('倒计时递减 → 归零恰一次（Main.cs:65963-65969）；归零后不再触发', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    startImpendingDoom(w, 3600, lunarHost(log));
    let fired = 0;
    for (let i = 0; i < 3600; i++) if (tickMoonLordCountdown(w)) fired++;
    expect(fired).toBe(1);
    expect(tickMoonLordCountdown(w)).toBe(false);
  });

  it('天界印记支线：StartImpendingDoom(720)（Player.cs:44376）倒计时走 720', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    startImpendingDoom(w, 720, lunarHost(log));
    expect(w.lunarEvent.moonLordCountdown).toBe(720);
    expect(w.lunarEvent.moonLordCountdownMax).toBe(720);
    let fired = 0;
    for (let i = 0; i < 720; i++) if (tickMoonLordCountdown(w)) fired++;
    expect(fired).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ② 读档回填：TowerActive→盾满（WorldFile.cs:2242-2251）+ 缺塔兜底补位
// ---------------------------------------------------------------------------
describe('BJ109-D 读档回填（applyLunarSave + respawnMissingTowers）', () => {
  it('杀一塔后存读：三活塔盾回满、被杀塔不复活、倒计时清零（★BJ109-D 屏效支拆除）', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(5), lunarHost(log));
    onTowerKilled(w, 517, hasByTowerActive(w), lunarHost(log));
    // 模拟在途脏态：活塔盾被打空 + 倒计时残留
    w.lunarEvent.shield.vortex = 0;
    w.lunarEvent.moonLordCountdown = 1234;

    // 读档回填（SaveFile.loadSaveData 在 flags 赋值后调用 applyLunarSave）
    const w2 = makeWorld();
    for (const [k, v] of Object.entries(w.flags)) w2.flags[k] = v;
    applyLunarSave(w2);
    expect(w2.lunarEvent.active).toBe(true);
    expect(w2.lunarEvent.towerActive.solar).toBe(false);   // 被杀塔旗不复活
    expect(w2.lunarEvent.towerActive.vortex).toBe(true);
    expect(w2.lunarEvent.shield.vortex).toBe(shieldMax(w2)); // WF:2242-2245 盾满
    expect(w2.lunarEvent.shield.stardust).toBe(shieldMax(w2));
    expect(w2.lunarEvent.moonLordCountdown).toBe(0);       // 原版倒计时不落档
    expect('crystalDeath' in w2.lunarEvent).toBe(false);   // ★BJ109-D 伪影键不得复辟
  });

  it('respawnMissingTowers：只补「towerActive 在场旗但实体缺失」的塔（SW-FX11 读档态）', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    triggerLunarApocalypse(w, new RNG(6), lunarHost(log));
    log.towers.length = 0;
    const present = new Set([517, 422, 493]);      // nebula 旗活但实体缺（旧档无 NPC 段）
    respawnMissingTowers(w, new RNG(6), lunarHost(log), (id) => present.has(id));
    expect(log.towers.map((t) => t.id)).toEqual([507]);           // 只补 nebula
    // 列锚算式同触发链：x = maxTilesX/5×(1+j) ± 100 抖动（j 按 missing 序）
    expect(Math.abs(log.towers[0].tx - Math.floor(w.w / 5))).toBeLessThanOrEqual(100);
  });

  it('respawnMissingTowers：事件关 / 无缺 → 空转（零掷骰零生成）', () => {
    const w = makeWorld();
    const log: Log = { towers: [], broadcasts: [], cultistsCleared: 0 };
    respawnMissingTowers(w, new RNG(6), lunarHost(log), () => false);
    expect(log.towers).toHaveLength(0);
    triggerLunarApocalypse(w, new RNG(6), lunarHost(log));
    log.towers.length = 0;
    respawnMissingTowers(w, new RNG(6), lunarHost(log), () => true);
    expect(log.towers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ③ 盾链（扣盾→盾破）与败月总后上限减半
// ---------------------------------------------------------------------------
describe('BJ109-D 盾链上限与钳制', () => {
  it('downed_398 前 100 / 后 50；扣盾钳 [0, Max]；盾破沿 flash/shieldZero 翻转', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    w.lunarEvent.shield.vortex = 100;
    expect(onTowerBoltHit(w, 422)).toEqual({ flash: true, shieldZero: false });
    expect(w.lunarEvent.shield.vortex).toBe(99);
    w.lunarEvent.shield.vortex = 1;
    expect(onTowerBoltHit(w, 422)).toEqual({ flash: true, shieldZero: true });
    expect(onTowerBoltHit(w, 422)).toEqual({ flash: false, shieldZero: true });  // 已 0：不发 flash
    // 败月总（downedMoonlord）→ Max 减半（NPC.cs:6819-6830）
    w.flags['downed_398'] = true;
    expect(shieldMax(w)).toBe(50);
    w.lunarEvent.shield.nebula = 100;
    onTowerBoltHit(w, 507);
    expect(w.lunarEvent.shield.nebula).toBe(50);   // 99→clamp? 钳上限 50
  });
});
