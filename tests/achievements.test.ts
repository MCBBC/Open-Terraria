// 成就系统引擎 + 注册表回归（对照 AchievementInitializer.cs / AchievementsHelper.cs）
import { describe, it, expect } from 'vitest';
import { Achievements } from '../src/core/Achievements';
import { ACH_DEFS, ACH_ICON_ORDER, ACH_ICON_INDEX, WORKBENCH_ITEMS } from '../src/data/vanillaAchievements';

/** 内存持久化（localStorage 门面替身） */
function memStore() {
  let s: string | null = null;
  return { load: () => s, save: (v: string) => { s = v; }, peek: () => s };
}

describe('vanillaAchievements 注册表（AchievementInitializer.cs 1:1）', () => {
  it('成就数 / 图标序完整互达', () => {
    // 注册条目数 = C# new Achievement(...) 计数 137（AchievementInitializer.cs 全量）
    expect(ACH_DEFS.length).toBe(137);
    expect(ACH_ICON_ORDER.length).toBe(137);
    const names = new Set(ACH_DEFS.map((d) => d.name));
    for (const n of ACH_ICON_ORDER) expect(names.has(n), `图标序含未注册成就 ${n}`).toBe(true);
    for (const d of ACH_DEFS) expect(ACH_ICON_INDEX[d.name], `${d.name} 缺图标`).toBeDefined();
  });

  it('类别注册：四类 + 全覆盖（cs:582-737）', () => {
    const counts = [0, 0, 0, 0, 0];
    for (const d of ACH_DEFS) counts[d.category + 1]++;
    // Slayer 31 / Explorer 32 / Challenger 43 / Collector 30（cs 各块行数）
    expect(counts[1]).toBe(31);   // Slayer
    expect(counts[3]).toBe(32);   // Explorer
    expect(counts[4]).toBe(43);   // Challenger
    expect(counts[2]).toBe(30);   // Collector
    // GAIN_TORCH_GODS_FAVOR 是原版唯一的未归类成就（隐藏成就，cs 无其
    // RegisterAchievementCategory 条目）
    expect(counts[0]).toBe(1);
    const uncategorized = ACH_DEFS.filter((d) => d.category === -1).map((d) => d.name);
    expect(uncategorized).toEqual(['GAIN_TORCH_GODS_FAVOR']);
  });

  it('图标序号抽查（RegisterIconIndex num++ 原序）', () => {
    expect(ACH_ICON_INDEX['TIMBER']).toBe(0);
    expect(ACH_ICON_INDEX['NO_HOBO']).toBe(1);
    expect(ACH_ICON_INDEX['BENCHED']).toBe(88);
    expect(ACH_ICON_INDEX['GET_ZENITH']).toBe(91);
    expect(ACH_ICON_INDEX['INTERDIMENSIONAL_RECYCLING']).toBe(136);
  });

  it('条件链抽查（AddCondition/AddConditions 1:1）', () => {
    const byName = (n: string) => ACH_DEFS.find((d) => d.name === n)!;
    // TIMBER：单条件 pickup 任一木材族
    expect(byName('TIMBER').conditions).toHaveLength(1);
    expect(byName('TIMBER').conditions[0].ids).toContain(9);
    // BENCHED：Workbenches 44 项
    expect(byName('BENCHED').conditions[0].ids).toEqual(WORKBENCH_ITEMS);
    expect(WORKBENCH_ITEMS).toHaveLength(44);
    // BUCKETS_OF_BOLTS：Create(125,126) + CreateMany(127,134)
    expect(byName('BUCKETS_OF_BOLTS').conditions).toHaveLength(2);
    expect(byName('BUCKETS_OF_BOLTS').conditions[1].many).toBe(true);
    // GELATIN_WORLD_TOUR：CreateMany(22 ids) + Create(3 ids) + Create(-4)（AddConditions 包单个 Create）
    const gwt = byName('GELATIN_WORLD_TOUR').conditions;
    expect(gwt).toHaveLength(3);
    expect(gwt[0].ids).toHaveLength(22);
    expect(gwt[0].many).toBe(true);
    expect(gwt[1].ids).toEqual([183, -24, -25]);
    expect(gwt[2].ids).toEqual([-4]);
    expect(gwt[2].many).toBeFalsy();
    // SLAYER_OF_WORLDS：3×Create + CreateMany(12)
    expect(byName('SLAYER_OF_WORLDS').conditions).toHaveLength(4);
    // DUNGEON_HEIST：pickup(327) + prog(19) 双条件
    expect(byName('DUNGEON_HEIST').conditions).toHaveLength(2);
    // 计数型阈值（CustomInt/Float）
    expect(byName('BULLDOZER').conditions[0].value).toBe(10000);
    expect(byName('MARATHON_MEDALIST').conditions[0].value).toBe(1106688);
  });
});

describe('Achievements 引擎语义', () => {
  it('击杀/拾取/合成/破坏/事件 五路通知', () => {
    const a = new Achievements(null);
    a.notifyNPCKilled(4);                    // EoC → EYE_ON_YOU
    expect(a.isCompleted('EYE_ON_YOU')).toBe(true);
    a.notifyItemPickup(9);                   // 木头 → TIMBER
    expect(a.isCompleted('TIMBER')).toBe(true);
    a.notifyItemCraft(WORKBENCH_ITEMS[0]);   // 工作台 → BENCHED
    expect(a.isCompleted('BENCHED')).toBe(true);
    a.notifyTileDestroyed(7);                // 铜矿 → OOO_SHINY
    expect(a.isCompleted('OOO_SHINY')).toBe(true);
    a.notifyProgressionEvent(1);             // 熬过一夜 → YOU_CAN_DO_IT
    expect(a.isCompleted('YOU_CAN_DO_IT')).toBe(true);
  });

  it('CreateMany 逐 id 全完成（STAR_DESTROYER 四塔）', () => {
    const a = new Achievements(null);
    a.notifyNPCKilled(517);
    expect(a.isCompleted('STAR_DESTROYER')).toBe(false);
    a.notifyNPCKilled(422);
    a.notifyNPCKilled(507);
    expect(a.isCompleted('STAR_DESTROYER')).toBe(false);
    a.notifyNPCKilled(493);
    expect(a.isCompleted('STAR_DESTROYER')).toBe(true);
  });

  it('多条件成就全完成才解锁（DUNGEON_HEIST）', () => {
    const a = new Achievements(null);
    a.notifyItemPickup(327);
    expect(a.isCompleted('DUNGEON_HEIST')).toBe(false);
    a.notifyProgressionEvent(19);
    expect(a.isCompleted('DUNGEON_HEIST')).toBe(true);
  });

  it('计数型（BULLDOZER 10000 镐击）与持久化往返', () => {
    const st = memStore();
    const a1 = new Achievements(st);
    for (let i = 0; i < 9999; i++) a1.handleMining();
    expect(a1.isCompleted('BULLDOZER')).toBe(false);
    a1.handleMining();
    expect(a1.isCompleted('BULLDOZER')).toBe(true);
    // 重开（同 store）→ 完成态与计数都恢复
    const a2 = new Achievements(st);
    expect(a2.isCompleted('BULLDOZER')).toBe(true);
    expect(a2.progressOf('BULLDOZER').ratio).toBe(1);
  });

  it('HandleSpecialEvent switch（cs:282-381）', () => {
    const a = new Achievements(null);
    const p = { statLifeMax: 500, statManaMax: 200 };
    a.handleSpecialEvent(1, p);   // STAR_POWER + TOPPED_OFF
    expect(a.isCompleted('STAR_POWER')).toBe(true);
    expect(a.isCompleted('TOPPED_OFF')).toBe(true);
    a.handleSpecialEvent(10, p);  // ROCK_BOTTOM
    expect(a.isCompleted('ROCK_BOTTOM')).toBe(true);
    a.handleSpecialEvent(24, p);  // GAIN_TORCH_GODS_FAVOR
    expect(a.isCompleted('GAIN_TORCH_GODS_FAVOR')).toBe(true);
  });

  it('钓鱼四档计数（HandleAnglerService）', () => {
    const a = new Achievements(null);
    a.handleAnglerService();
    expect(a.isCompleted('SERVANT_IN_TRAINING')).toBe(true);
    expect(a.isCompleted('GOOD_LITTLE_SLAVE')).toBe(false);
    for (let i = 1; i < 10; i++) a.handleAnglerService();
    expect(a.isCompleted('GOOD_LITTLE_SLAVE')).toBe(true);
    expect(a.isCompleted('TROUT_MONKEY')).toBe(false);
  });

  it('MechaMayhem 三杀窗口（cs:433-503）', () => {
    const a = new Achievements(null);
    // 双子(125,126) + 毁灭者(134) + 骷髅王(127) 同夜在场 → Start 置 OK
    a.mechaMayhemStart([125, 126, 134, 127]);
    a.mechaMayhemKill(126, [125, 134, 127]);      // 双子其一
    expect(a.isCompleted('MECHA_MAYHEM')).toBe(false);
    a.mechaMayhemKill(125, [134, 127]);           // 双子其二 → 1down
    a.mechaMayhemKill(134, [127]);                // 2down
    a.mechaMayhemKill(127, []);                   // 3down → event 21
    expect(a.isCompleted('MECHA_MAYHEM')).toBe(true);
  });

  it('MechaMayhem 缺席惩罚（非 Mech 死亡且无补充 → 窗口失效）', () => {
    const a = new Achievements(null);
    a.mechaMayhemStart([125, 126, 134, 127]);
    a.mechaMayhemKill(125, [134, 127]);   // 1down（126 已先死）
    a.mechaMayhemKill(134, [127]);
    a.mechaMayhemKill(999, []);           // 非 Mech 死亡 + 场上无 127 → mayhemOK=false
    a.mechaMayhemKill(127, []);
    expect(a.isCompleted('MECHA_MAYHEM')).toBe(false);
  });

  it('计数条件中途进度持久化不误判完成（review 修复：load 对阈值判 done）', () => {
    const st = memStore();
    const a1 = new Achievements(st);
    for (let i = 0; i < 5000; i++) a1.handleMining();   // 中途进度 5000/10000
    a1.notifyItemPickup(9);                             // TIMBER 完成 → 触发一次落盘
    const a2 = new Achievements(st);                    // 重载
    expect(a2.isCompleted('BULLDOZER')).toBe(false);    // ★ 不得因 v>=1 误判完成
    expect(a2.progressOf('BULLDOZER').ratio).toBeCloseTo(0.5);
    for (let i = 0; i < 5000; i++) a2.handleMining();
    expect(a2.isCompleted('BULLDOZER')).toBe(true);
  });

  it('CreateMany 逐 id 部分进度持久化往返（STAR_DESTROYER 3/4 塔）', () => {
    const st = memStore();
    const a1 = new Achievements(st);
    a1.notifyNPCKilled(517);
    a1.notifyNPCKilled(422);
    a1.notifyNPCKilled(507);
    a1.flush();
    const a2 = new Achievements(st);
    expect(a2.isCompleted('STAR_DESTROYER')).toBe(false);
    expect(a2.progressOf('STAR_DESTROYER').doneConds).toBe(0); // 主条件未完成
    a2.notifyNPCKilled(493);                                    // 第四塔
    expect(a2.isCompleted('STAR_DESTROYER')).toBe(true);
  });

  it('MechaMayhem 场上双子单眼在场即无 Mech（ScanForMechs twins=双眼同在）', () => {
    const a = new Achievements(null);
    a.mechaMayhemStart([125, 126, 134, 127]);
    a.mechaMayhemKill(125, [126, 134, 127]);
    a.mechaMayhemKill(126, [134, 127]);
    a.mechaMayhemKill(134, [127]);
    a.mechaMayhemKill(127, []);
    expect(a.isCompleted('MECHA_MAYHEM')).toBe(true);
    // 下一夜召唤：Clear 扫描单眼在场（126 残留）——Twins 需双眼同在 → 视为无 Mech → 重置
    a.mechaMayhemClear([126]);
    // 新窗口重开：双眼 + 毁灭者 + 骷髅王
    a.mechaMayhemStart([125, 126, 134, 127]);
    a.mechaMayhemKill(127, [125, 126, 134]);
    expect(a.isCompleted('MECHA_MAYHEM')).toBe(true); // 已完成（成就粘性）
  });
});

  // ★0 哨兵钉（2026-09-03 红蓝对抗 B2）：vanillaNetId 缺省 0 非 nullish——Game 调用点
  // 归一 `!==0 ? netId : id` 前曾把 0 直送 notify → 全部 npcKilled 成就死。本钉保证
  // 0 永不完成任何成就（0 非合法 NPC id 条件），归一逻辑回归时在此爆红。
  it('notifyNPCKilled(0) 不得完成任何 npcKilled 成就（0=缺省哨兵非合法 id）', () => {
    const a = new Achievements(null);
    a.notifyNPCKilled(0);
    for (const def of ACH_DEFS) {
      if (def.conditions.some((c) => c.kind === 'npcKilled')) {
        expect(a.isCompleted(def.name)).toBe(false);
      }
    }
    a.notifyNPCKilled(370);   // 归一后的真 id 通路照常
    expect(a.isCompleted('FISH_OUT_OF_WATER')).toBe(true);
  });
