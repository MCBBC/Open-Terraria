// BJ351 判别力测：四柱全灭 → 月总链 doom 门的不变式回填。
// 用户实报：四柱全部打完后不出月亮领主、连倒计时文字提示（Lang.misc[52]）都没有。
//
// 原版锚（1457，1456 行号差见 bj109d 文件头对照）：
//  - 塔死链（case 517/422/507/493）   NPC.cs:80137-80160（downedTower_* 无 IsUp 门，1:1）
//  - UpdateLunarApocalypse !IsUp 早退 WorldGen.cs:87979；四塔全灭 && !AnyNPCs(398)
//                                     → StartImpendingDoom(3600)（:88030-88031）
//  - StartImpendingDoom               WorldGen.cs:88033-88044（IsUp=false + 倒计时 +
//                                     misc[52] 广播 + 清教徒）
//  - 原版不变式「塔在场 ⇒ IsUp=true」：唯一塔生成器 TriggerLunarApocalypse
//                                     （WorldGen.cs:87966-87968 置塔同拍置 IsUp）；
//                                     IsUp 翻 false 仅 :88030（四塔必已全灭）与
//                                     case 398（NPC.cs:80213-80216）→ 原版不可达
//                                     「塔在场 ∧ IsUp=false」。
//  - 盾满回填同式                      WorldFile.cs:2242-2246（TowerActive→Shield=Max）
//  - AnyDanger 倒计时门               NPC.cs:81066（MoonLordCountdown>0 记危险）
//
// 本仓可达破不变式态（=用户实报第一因）：BJ109 前旧档（towerActive*/lunarApocalypseUp
// 未落盘而塔实体经 pillarNpcs 段在场）+ F6 召塔。此态下四塔全灭后 !IsUp 早退把 doom
// 整支吞掉 → 无 misc[52]、无倒计时、月总永不落地。BJ351 落刀 =
// updateLunarApocalypse 头部不变式回填（触发终态 1:1）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  TOWER_IDS, TOWER_KEY, updateLunarApocalypse, onTowerKilled, shieldMax,
  type LunarHost,
} from '../src/world/LunarEvent';
import { World } from '../src/world/World';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';

beforeAll(() => {
  const pack = JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8'));
  languageManager.loadPackJson(pack);
});

interface Log {
  broadcasts: Array<[string, number, number, number]>;
  cultistsCleared: number;
}
function lunarHost(log: Log): LunarHost {
  return {
    spawnTowerNpc: () => undefined,
    broadcast: (text, r, g, b) => void log.broadcasts.push([text, r, g, b]),
    clearCultists: () => void log.cultistsCleared++,
  };
}
function makeWorld(): World {
  const world = new World(420, 220, 7, 'bj351-doom');
  world.groundLevel = 150;
  return world;
}

/** 在场集桩：对齐真实 hasNpcId 语义（查场上存活实体，非 towerActive 旗——
 *  破不变式态下实体在场而旗全 false，二者必须解耦） */
function makeHas(present: Set<number>) {
  return (id: number) => present.has(id);
}

describe('BJ351 不变式回填：塔在场 ∧ active=false → 触发终态 1:1 回填', () => {
  it('回填本体：active=true + 在场塔 towerActive=true + 盾满（WF:2242-2246 同式）+ flags 落档', () => {
    const w = makeWorld();
    // 模拟旧档破不变式态：四塔实体在场（has 桩全真）、事件旗/塔旗全 false、盾 0
    w.lunarEvent.active = false;
    for (const id of TOWER_IDS) w.lunarEvent.towerActive[TOWER_KEY[id]] = false;
    w.lunarEvent.shield.solar = w.lunarEvent.shield.vortex = 0;
    w.lunarEvent.shield.nebula = w.lunarEvent.shield.stardust = 0;
    const log: Log = { broadcasts: [], cultistsCleared: 0 };

    updateLunarApocalypse(w, makeHas(new Set(TOWER_IDS)), lunarHost(log));   // 每帧位（Game.fixedUpdate）

    expect(w.lunarEvent.active).toBe(true);
    for (const id of TOWER_IDS) {
      expect(w.lunarEvent.towerActive[TOWER_KEY[id]]).toBe(true);
      expect(w.lunarEvent.shield[TOWER_KEY[id]]).toBe(shieldMax(w));
    }
    expect(w.flags.lunarApocalypseUp).toBe(true);           // persist 落档
    for (const k of ['Solar', 'Vortex', 'Nebula', 'Stardust']) {
      expect(w.flags[`towerActive${k}`]).toBe(true);
    }
    expect(w.lunarEvent.moonLordCountdown).toBe(0);         // 回填不武装 doom
    expect(log.broadcasts).toHaveLength(0);                 // 静默回填（不补播 misc[43]）
    expect(log.cultistsCleared).toBe(0);
  });

  it('部分在场：只回填在场塔（缺位塔旗保持 false，不被复活）', () => {
    const w = makeWorld();
    w.lunarEvent.active = false;
    const alive = new Set([517, 493]);                      // 只剩日耀/星尘在场
    const log: Log = { broadcasts: [], cultistsCleared: 0 };

    updateLunarApocalypse(w, (id) => alive.has(id), lunarHost(log));

    expect(w.lunarEvent.active).toBe(true);
    expect(w.lunarEvent.towerActive.solar).toBe(true);
    expect(w.lunarEvent.towerActive.stardust).toBe(true);
    expect(w.lunarEvent.towerActive.vortex).toBe(false);    // 缺位不复活
    expect(w.lunarEvent.towerActive.nebula).toBe(false);
    expect(w.lunarEvent.shield.solar).toBe(shieldMax(w));
    expect(w.lunarEvent.shield.vortex).toBe(0);
    // 两塔在场 → 全灭门不触发（doom 不抢跑）
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
  });
});

describe('BJ351 破不变式态全链：四塔逐倒 → doom 落地（用户实报判别面）', () => {
  it('旧档态（active=false+四塔在场）逐塔击杀 → 第 4 塔 doom：misc[52]+倒计时 3600+清教徒', () => {
    const w = makeWorld();
    w.lunarEvent.active = false;                            // 破不变式态起点
    for (const id of TOWER_IDS) w.lunarEvent.towerActive[TOWER_KEY[id]] = false;
    const log: Log = { broadcasts: [], cultistsCleared: 0 };
    const host = lunarHost(log);
    const present = new Set(TOWER_IDS);                     // 四塔实体在场

    // 每帧位先跑一拍 → 回填（塔仍全在场）
    updateLunarApocalypse(w, makeHas(present), host);
    expect(w.lunarEvent.active).toBe(true);

    // 逐塔击杀（onTowerKilled = NPC.cs:80137-80160 无 IsUp 门 1:1）
    const capOf = (id: 517 | 422 | 507 | 493) => ['Solar', 'Vortex', 'Nebula', 'Stardust'][TOWER_IDS.indexOf(id)];
    for (let i = 0; i < TOWER_IDS.length; i++) {
      const id = TOWER_IDS[i];
      present.delete(id);                                   // 死亡实体离场（dead 语义）
      onTowerKilled(w, id, makeHas(present), host);
      expect(w.flags[`downedTower${capOf(id)}`]).toBe(true);   // downed 记账不被吞
      expect(w.lunarEvent.towerActive[TOWER_KEY[id]]).toBe(false);
      if (i < 3) {
        expect(w.lunarEvent.active).toBe(true);                // 未全灭不进 doom
        expect(w.lunarEvent.moonLordCountdown).toBe(0);
        // 递进公告（WorldGen.cs:88061 active 门回填后重开）：misc[44][45][46]
        expect(log.broadcasts[log.broadcasts.length - 1]).toEqual([Lang.misc(44 + i), 175, 75, 255]);
      }
    }
    // 第 4 塔倒 → StartImpendingDoom（:88033-88044）
    expect(w.lunarEvent.active).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(3600);
    expect(w.lunarEvent.moonLordCountdownMax).toBe(3600);
    expect(log.broadcasts.filter((b) => b[0] === Lang.misc(52))).toHaveLength(1);
    expect(log.broadcasts[log.broadcasts.length - 1]).toEqual([Lang.misc(52), 50, 255, 130]);
    expect(log.cultistsCleared).toBe(1);                    // GetRidOfCultists 恰一次
  });
});

describe('BJ351 守卫与原版同相面', () => {
  it('无塔在场 + active=false → 维持原版 !IsUp 早退（:87979）同相：零状态变化零广播', () => {
    const w = makeWorld();
    w.lunarEvent.active = false;
    w.flags.lunarApocalypseUp = false;
    const log: Log = { broadcasts: [], cultistsCleared: 0 };
    updateLunarApocalypse(w, () => false, lunarHost(log));
    expect(w.lunarEvent.active).toBe(false);
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
    expect(log.broadcasts).toHaveLength(0);
    expect(w.flags.lunarApocalypseUp).toBe(false);          // 未被回填写档
  });

  it('倒计时在途（天界印记 720 态）+ 塔在场 → 不重复武装（AnyDanger 门 NPC.cs:81066 同门）', () => {
    const w = makeWorld();
    w.lunarEvent.active = false;
    w.lunarEvent.moonLordCountdown = 720;                   // StartImpendingDoom(720) 已武装
    w.lunarEvent.moonLordCountdownMax = 720;
    const log: Log = { broadcasts: [], cultistsCleared: 0 };
    updateLunarApocalypse(w, () => true, lunarHost(log));   // 四塔在场
    expect(w.lunarEvent.active).toBe(false);                // 未回填
    expect(w.lunarEvent.moonLordCountdown).toBe(720);       // 在途倒计时不受扰
    expect(w.lunarEvent.moonLordCountdownMax).toBe(720);
    expect(log.broadcasts).toHaveLength(0);
  });

  it('正常局（active=true）零行为差：本塔旗清 false + 全灭门不抢跑', () => {
    const w = makeWorld();
    w.lunarEvent.active = true;
    for (const id of TOWER_IDS) {
      w.lunarEvent.towerActive[TOWER_KEY[id]] = true;
      w.lunarEvent.shield[TOWER_KEY[id]] = shieldMax(w);
    }
    const before = w.lunarEvent.shield.solar;
    updateLunarApocalypse(w, makeHas(new Set(TOWER_IDS)), lunarHost({ broadcasts: [], cultistsCleared: 0 }));
    expect(w.lunarEvent.active).toBe(true);
    expect(w.lunarEvent.shield.solar).toBe(before);         // 盾不被重置
    expect(w.lunarEvent.moonLordCountdown).toBe(0);
  });
});
