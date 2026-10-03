// ★BJ450（2026-09-29）：永恒水晶 548（Old One's Army 事件核心,aiStyle 105/
//   lifeMax 1000/friendly=true,NPC.cs:16026-16052 SetDefaults）血尽败北演出转换支
//   + dontTakeDamageFromHostiles 字段建模判别测试。
//   病灶（BJ446 复核批定谳）：原版 checkDead（NPC.cs:78891-78898）血尽转演出——
//   ai1=1/ai0=0/life=lifeMax/dontTakeDamageFromHostiles=true（【不】调
//   PrepareForDeathAnimation,不进死亡动画）→ AI_105 败北演出 600t（:41280-41365,
//   起跑帧 ReportLoss+效果弹 672、96t 上浮→alpha 渐隐、末帧 StopInvasion+life=0+
//   checkDead）→ ReportLoss=起跑帧（:41299,SetEnemySpawningOnHold(30) 事件仍
//   Ongoing）、StopInvasion=末帧（:41372,WipeEntities 清场）。本仓旧档：hurt 死亡
//   级联无 548 支 → 水晶血尽走标准死（死亡动画/掉落）;bossAI_dd2 败北演出支
//   （ai1===1）全仓无 setter=死码;dontTakeDamageFromHostiles 全仓未建模（消费面
//   全部映射在 dontTakeDamage 占位旗上）。
//   落刀：Enemy.ts 级联 548 支（checkDead 位 1:1）+ 字段建模（实例字段/互伤门
//   :93557/仙灵 :49119）+ bossAI_dd2 真名旗置换（win :41170/defeat :41280/
//   OnlyCrystal NPCUtils.cs:16-21/弹幕 flag2 :12626 两通道）+ Game.ts SW-AA1
//   flag2 门。
//   判别力（真 Enemy.fromVanilla,写支在真 hurt 内部,debt-y 同式）：旧码（无 548
//   支）下 ①水晶血尽 dead=true 红;③演出态接触/爆伤落地红。变异：摘 548 支→①红;
//   摘免伤置位→①旗断言+③接触/爆伤拒绝红。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { Enemy } from '../src/entities/Enemy';
import { DD2GoblinBomb, DD2_EVENT_HOOKS, eterniaCrystalAI, resetDD2Hooks } from '../src/entities/bossAI_dd2';
import { newOldOnesArmyState, updateTime } from '../src/world/OldOnesArmy';
import type { OldOnesArmyHost } from '../src/world/OldOnesArmy';

function makeGame(list: Enemy[]): GameHooks {
  return {
    world: new World(200, 200, 30, 'bj450'),
    // 死亡管线读最近玩家（:14749）——最小玩家桩（debt-y 同式）
    player: {
      dead: false, cx: 0, cy: 0, luck: 0, hp: 400, maxHp: 400, mana: 100, maxMana: 100,
    } as unknown,
    enemies: () => list,
    critters: () => [],
    entities: { nextId: 1, add: () => {} },
    playSfxFiles: () => {}, playSfx: () => {}, playSfxFile: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    spawnDust: () => null,
    applyLifeSteal: () => 0,
  } as unknown as GameHooks;
}

describe('BJ450：永恒水晶 548 血尽败北演出转换支 + dontTakeDamageFromHostiles 建模', () => {
  it('①水晶血尽转败北演出（checkDead :78891-78898 1:1）：不进死亡管线/ai1=1/ai0=0/满血/敌意免伤旗置位', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal = Enemy.fromVanilla(548, 80 * TILE, 100 * TILE)!;
    expect(crystal).toBeTruthy();
    list.push(crystal);
    crystal.bInit = true;          // 生产时序:出生拍 AI 已跑首帧初始化
    crystal.hp = 1;
    const ret = crystal.hurt(100, 0, 0, game);
    expect(ret).toBe(false);       // 转换=存活（hurt 返假）
    expect(crystal.dead).toBe(false);                  // 不进死亡管线（无死亡动画/掉落位）
    expect(crystal.ai1).toBe(1);                       // 败北演出态（演出支入口置位）
    expect(crystal.ai0).toBe(0);
    expect(crystal.hp).toBe(crystal.maxHp);            // life=lifeMax 满血续命
    expect(crystal.dontTakeDamageFromHostiles).toBe(true);  // :78896 敌意免伤旗
    expect(crystal.dontTakeDamage).toBe(false);        // 原版【不】置全免旗
    // 同拍补刀窗（转换拍→AI 首拍,X4-债14 同式）：681 爆伤通道照拒——旗来自
    // 转换写支本行（无 AI tick 重写）,摘写支旗 → 本腿红（③(b) 腿钉 AI 重写旗）
    const bombW = new DD2GoblinBomb(crystal.cx, crystal.cy, 0, 0, 50);
    (bombW as unknown as { fuse: number }).fuse = 3;
    bombW.fixedUpdate(1 / 60, game);
    expect(crystal.hp).toBe(crystal.maxHp);            // 窗内旗=转换写支所置
    // 玩家通道语义：FromHostiles 不闭 StrikeNPC（:93557 是唯一免伤门,StrikeNPC
    // 无此门）（先清残留 iframes——免疫帧门与旗门相互独立,本探针只证旗语义）
    crystal.iframes = 0;
    const hp0 = crystal.hp;
    crystal.hurt(100, 0, 0, game);
    expect(crystal.hp).toBeLessThan(hp0);              // 玩家通道不受 FromHostiles 门
  });

  it('②演出支可达+④ReportLoss 起跑帧+⑤StopInvasion 演出末帧：AI_105 ai1==1 序列 600t 全程', () => {
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal = Enemy.fromVanilla(548, 80 * TILE, 100 * TILE)!;
    list.push(crystal);
    crystal.bInit = true;
    const portal = Enemy.fromVanilla(549, 82 * TILE, 100 * TILE)!;
    portal.bInit = true;
    list.push(portal);
    const calls: string[] = [];
    DD2_EVENT_HOOKS.reportLoss = () => { calls.push('reportLoss'); };
    DD2_EVENT_HOOKS.stopInvasion = (_g, win) => { calls.push(win ? 'stop:win' : 'stop:lose'); };
    crystal.hp = 1;
    expect(crystal.hurt(100, 0, 0, game)).toBe(false);
    // 起跑帧（ai0==0 块 :41285-41301）：ReportLoss+549 联动（原版 ReportLoss 在
    // :41299——事件仍 Ongoing,SetEnemySpawningOnHold(30) 冻结出怪 30t）
    eterniaCrystalAI(crystal, game, null);
    expect(calls).toEqual(['reportLoss']);             // ④ReportLoss=起跑帧（非血尽拍）
    expect(portal.ai1).toBe(1);                        // 549 门联动（:41285-41291）
    expect(portal.ai0).toBe(0);
    expect(crystal.vy).toBeLessThan(0);                // 96t 上浮段启动（:42993-42997）
    expect(crystal.dontTakeDamageFromHostiles).toBe(true);  // 演出支每拍重写
    // 中段：96t 起 spawnAlpha 渐隐（alpha+=50/t）
    for (let i = 0; i < 120; i++) eterniaCrystalAI(crystal, game, null);
    expect(crystal.spawnAlpha).toBeGreaterThan(0);
    // ⑤演出期事件保持：水晶在世（active）→ updateTime 不收（原版 :218-220
    //   AnyNPCs(548) 恒真——StopInvasion 只能来自演出支末帧,不来自水晶不在场判定）
    {
      const st = newOldOnesArmyState();
      st.ongoing = true;
      const host = {
        anyNpc: (id: number) => id === 548 && !crystal.dead,
      } as unknown as OldOnesArmyHost;
      const r = updateTime(st, host, null);
      expect(r.stopped).toBeNull();
      expect(st.ongoing).toBe(true);
    }
    // 跑满 600t：末帧（:41365-41372）StopInvasion → WipeEntities/hurt → 标准死收尾
    for (let i = 0; i < 700 && !crystal.dead; i++) eterniaCrystalAI(crystal, game, null);
    expect(crystal.dead).toBe(true);
    expect(calls[calls.length - 1]).toBe('stop:lose');              // ⑤StopInvasion 在演出后
    expect(calls.filter((c) => c === 'reportLoss')).toHaveLength(1);  // ReportLoss 恰一次
    expect(calls.filter((c) => c.startsWith('stop'))).toHaveLength(1);
    resetDD2Hooks();
  });

  it('③演出期敌意伤害被拒：NPC 互伤通道（:93557 三旗并列门）与 681 爆伤通道（:12626 flag2）', () => {
    // (a) NPC 互伤门（GetHurtByOtherNPCs 头门,受害者侧）：friendly 受害者才入通道
    // （本仓 friendly 敌怪唯水晶 548,僵尸对照不适用）——常态水晶（ai1=0,AI 不触旗）
    // 手置旗两腿对照;演出态旗恒真由 (b) 拒腿承载
    const list: Enemy[] = [];
    const game = makeGame(list);
    const crystal0 = Enemy.fromVanilla(548, 80 * TILE, 100 * TILE)!;
    list.push(crystal0);
    crystal0.bInit = true;                          // ai1=0 常态:倒计时支不触旗
    const za = Enemy.fromVanilla(3, 80 * TILE + 4, 100 * TILE + 4)!;
    list.push(za);
    za.vx = 0; za.vy = 0;
    crystal0.dontTakeDamageFromHostiles = true;
    crystal0.fixedUpdate(1 / 60, game);
    expect(crystal0.hp).toBe(crystal0.maxHp);       // 旗置位：接触伤拒（旧码=受伤,红）
    crystal0.dontTakeDamageFromHostiles = false;
    crystal0.fixedUpdate(1 / 60, game);
    expect(crystal0.hp).toBeLessThan(crystal0.maxHp);  // 阳性对照：门判别力（BJ356 Face3 同式）
    // 水晶本体（演出态=旗每拍重写）在爆盒内 → 照拒
    const list2: Enemy[] = [];
    const game2 = makeGame(list2);
    const c2 = Enemy.fromVanilla(548, 80 * TILE, 100 * TILE)!;
    list2.push(c2);
    c2.bInit = true;
    c2.hp = 1;
    expect(c2.hurt(100, 0, 0, game2)).toBe(false);  // 转换 → 演出态（旗置位）
    eterniaCrystalAI(c2, game2, null);
    const bomb = new DD2GoblinBomb(c2.cx, c2.cy, 0, 0, 50);
    (bomb as unknown as { fuse: number }).fuse = 3; // 钳引信 → 本拍爆
    bomb.fixedUpdate(1 / 60, game2);
    expect(c2.hp).toBe(c2.maxHp);                   // flag2 拒（AI 每拍满血+拒伤=恒满血）
    // 阳性对照：常态水晶（ai1=0 无旗）→ 爆伤落地
    const list3: Enemy[] = [];
    const game3 = makeGame(list3);
    const c3 = Enemy.fromVanilla(548, 80 * TILE, 100 * TILE)!;
    list3.push(c3);
    c3.bInit = true;
    const bomb3 = new DD2GoblinBomb(c3.cx, c3.cy, 0, 0, 50);
    (bomb3 as unknown as { fuse: number }).fuse = 3;
    bomb3.fixedUpdate(1 / 60, game3);
    expect(c3.hp).toBeLessThan(c3.maxHp);
  });

  it('⑤对照：水晶真不在场 → updateTime 直收 StopInvasion（原版 :218-220 旧径不变）', () => {
    const st = newOldOnesArmyState();
    st.ongoing = true;
    const host = { anyNpc: () => false } as unknown as OldOnesArmyHost;
    const r = updateTime(st, host, null);
    expect(r.stopped).toBe('lose');
    expect(st.ongoing).toBe(false);
  });
});
