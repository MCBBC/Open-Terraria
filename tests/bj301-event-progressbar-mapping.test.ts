// ★BJ301（2026-09-23）事件进度条文案映射（用户实报：火星暴乱进行中顶条显「哥布林军队 0%」）。
//  · 判别面：invasionBarNameKey —— 原版 Main.DrawInvasionProgress :48536-48551 的
//    icon→Lang.inter 表反解（icon = invasionType+3,CheckInvasionProgressDisplay :47040-47044 /
//    SyncAnInvasion :48481）。旧实现三元 else 兜底把火星(4)吞进 88 哥布林——本表锁死四型。
//  · 全族对拍：哥布林/雪人军团/海盗/火星（inter 88/87/86/85）+ 月事件 83/84（Game.ts
//    月分支内联）+ 撒旦军队（DD2 分支,DungeonDefenders2.InvasionProgressTitle）。
//  · DD2 组号表 DD2_EVENT_GROUP（NPC.GetNPCInvasionGroup -3 支,NPC.cs:79190-79228）。
//  · 结构锁：Game.ts 进度条块消费 invasionBarNameKey + DD2 分支接线（codeOf 源码锚,
//    按 bj280-unload-guard.test.ts 模式）——摘支变异即爆红。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INVASION_GOBLIN, INVASION_SNOW_LEGION, INVASION_PIRATE, INVASION_MARTIAN,
  invasionBarNameKey,
} from '../src/world/Invasion';
import { DD2_EVENT_GROUP } from '../src/world/OldOnesArmy';
import { Lang } from '../src/i18n/Lang';

const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（结构锁只禁代码改动,判定注释含词不误伤） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

beforeAll(async () => {
  await Lang.init('zh-Hans').catch(() => undefined);
});

describe('BJ301 判别面：invasionBarNameKey（icon=invasionType+3 → inter[85..88] 反解）', () => {
  it('火星(4) → 85（LegacyInterface.85 = 火星暴乱）——用户实报病灶判别', () => {
    expect(invasionBarNameKey(INVASION_MARTIAN)).toBe(85);
  });
  it('哥布林(1) → 88 / 雪人军团(2) → 87 / 海盗(3) → 86（同族四型逐一对拍）', () => {
    expect(invasionBarNameKey(INVASION_GOBLIN)).toBe(88);
    expect(invasionBarNameKey(INVASION_SNOW_LEGION)).toBe(87);
    expect(invasionBarNameKey(INVASION_PIRATE)).toBe(86);
  });
  it('文案值对拍（zh-Hans 官译：85 火星暴乱 / 86 海盗入侵 / 87 雪人军团 / 88 哥布林军队）', () => {
    if (!Lang.loaded) return;   // l10n 资产不可达时跳过（纯表断言已在上面锁死）
    expect(Lang.inter(85)).toBe('火星暴乱');
    expect(Lang.inter(86)).toBe('海盗入侵');
    expect(Lang.inter(87)).toBe('雪人军团');
    expect(Lang.inter(88)).toBe('哥布林军队');
  });
  it('月事件键对拍：83 霜月 / 84 南瓜月（Game.ts 月分支内联 83/84,顺带普查）', () => {
    if (!Lang.loaded) return;
    expect(Lang.inter(83)).toBe('霜月');
    expect(Lang.inter(84)).toBe('南瓜月');
  });
  it('撒旦军队键对拍：DungeonDefenders2.InvasionProgressTitle（DD2 分支文案源）', () => {
    if (!Lang.loaded) return;
    expect(Lang.text('DungeonDefenders2.InvasionProgressTitle')).toBe('撒旦军队');
  });
});

describe('BJ301 全族收口：DD2_EVENT_GROUP（NPC.GetNPCInvasionGroup -3 支,NPC.cs:79190-79228）', () => {
  it('547/548/549/551-578 → -3（水晶 548/传送门 549/Betsy 551/门怪族全组）', () => {
    expect(DD2_EVENT_GROUP[547]).toBe(-3);
    expect(DD2_EVENT_GROUP[548]).toBe(-3);
    expect(DD2_EVENT_GROUP[549]).toBe(-3);
    expect(DD2_EVENT_GROUP[551]).toBe(-3);
    expect(DD2_EVENT_GROUP[578]).toBe(-3);
    expect(DD2_EVENT_GROUP[565]).toBe(-3);
  });
  it('550 不在原版 case 表；非 DD2 族（哥布林 26/火星 395/月怪 338）不得混入', () => {
    expect(DD2_EVENT_GROUP[550]).toBeUndefined();
    expect(DD2_EVENT_GROUP[26]).toBeUndefined();
    expect(DD2_EVENT_GROUP[395]).toBeUndefined();
    expect(DD2_EVENT_GROUP[338]).toBeUndefined();
  });
});

describe('BJ301 结构锁：Game.ts 进度条块接线（codeOf 源码锚）', () => {
  const game = codeOf('src/core/Game.ts');

  it('常规入侵文案消费 invasionBarNameKey（旧三元 else 兜底已除）', () => {
    expect(game).toContain('invasionBarNameKey(w.invasionType)');
    // 旧病灶形态（三元 else 把 4 吞进 88）不得回潮
    expect(game).not.toContain('? 87 : 88');
  });
  it('DD2 分支接线：ongoing 门 + -3 组显示门 + 撒旦军队文案', () => {
    expect(game).toContain('w.oldOnesArmy.ongoing');
    expect(game).toContain('DD2_EVENT_GROUP[en.vanillaId] === -3');
    expect(game).toContain("Lang.text('DungeonDefenders2.InvasionProgressTitle')");
    expect(game).toContain('dd2InvasionStatus(w.oldOnesArmy');
  });
});
