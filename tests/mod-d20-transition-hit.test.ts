// ★D20-M1 清偿守卫(2026-10-13):六致死转态支(realLife/月总/泡泡/石巨人头/四塔/水晶)
//   受击派发。转态≠拒收——伤已受理(hp≤0 入转态),tML OnHitNPC 语义=受理即发
//   (killed=false);onKill 不在转态拍发(转态非死亡,演出终末走标准死亡管线时派发)。
//   锚:Enemy.hurt 六支 return false 前的 dispatchTransitionHit。
import { describe, it, expect, beforeEach } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { registerGlobalNpcHooks, _resetModHooksForTests } from '../src/mods/hooks';

function fakeGame(w: World, enemies: Array<Record<string, unknown>> = []) {
  return {
    world: w,
    player: { dead: false, cx: 0, cy: 0, buffs: { has: () => false, apply: () => {} }, equipStats: {}, addDPS: () => {} },
    recLog: () => {}, addDamageNumber: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnParticles: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
    enemies: () => enemies, critters: () => [],
    dust: { spawn: () => ({}) },
    noSpawnCycleThisFrame: false,
  } as never;
}

describe('D20-M1:六致死转态支受击派发(onHitByAny killed=false)', () => {
  beforeEach(() => _resetModHooksForTests());

  it('月总头 396:血尽转残肢派发 killed=false,不死亡', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(396, 100, 100)!;   // hp 45000——须真致死(9999 不入转态)
    const r = e.hurt(1e9, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(r).toBe(false);                          // 转态支=非死亡返回
    expect(e.dead).toBe(false);
    expect(e.dontTakeDamage).toBe(true);            // PrepareForDeathAnimation 真旗(清偿刀 Y)
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
    expect((seen[0]!.damage as number)).toBe(1e9);
  }, 60_000);

  it('四塔 422:血尽转死亡演出(ai2=1)派发 killed=false', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(422, 100, 100)!;
    e.hurt(1e9, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(e.ai2).toBe(1);                          // 演出态
    expect(e.hp).toBe(e.maxHp);                     // 满血续命
    expect(e.dead).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  it('永恒水晶 548:血尽转败北演出(ai1=1)派发 killed=false', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(548, 100, 100)!;
    e.hurt(9999, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(e.ai1).toBe(1);
    expect(e.dead).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  it('猪鲨泡泡 371:血尽转引信态派发 killed=false', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(371, 100, 100)!;
    e.hurt(9999, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(e.dontTakeDamage).toBe(true);
    expect(e.dead).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  it('石巨人挂载头 246(本体活):血尽转自由态派发 killed=false', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const body = { dead: false, vanillaId: 245 };   // 本体活=转态门
    const e = Enemy.fromVanilla(246, 100, 100)!;   // hp 25000——须真致死
    e.hurt(1e9, 0, 0, fakeGame(new World(64, 64, 7, 't'), [body]), 0, false, 0, true);
    expect(e.dontTakeDamage).toBe(true);
    expect(e.dead).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  it('对照:普通敌 15 致死走标准死亡=killed=true(转态/死亡两链不混淆)', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(15, 100, 100)!;
    const r = e.hurt(9999, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(r).toBe(true);
    expect(e.dead).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(true);
  }, 60_000);

  // ★D20-m1(2026-10-13):训练假人 488(immortal 早退支)受理伤派发 killed=false
  it('训练假人 488:受理伤派发 killed=false,不死亡不倒地', () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const e = Enemy.fromVanilla(488, 100, 100)!;
    const hpBefore = e.hp;
    const r = e.hurt(500, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(r).toBe(true);                            // 受理(摇晃/飘值照走)
    expect(e.dead).toBe(false);
    expect(e.hp).toBe(hpBefore);                     // immortal 免扣血
    expect(e.lastStrikeDealt).toBe(500);             // 足额写(幽灵套 proc 门依赖)
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  // ★D20-m3(2026-10-13):死亡链时序=tML 序(onHitByAny killed=true 先于 onKill)
  it('死亡链时序:onHitByAny(killed=true) 先于 onKill(tML 序)', () => {
    const order: string[] = [];
    registerGlobalNpcHooks('t', {
      onHitByAny: (_e, ctx) => { if (ctx.killed) order.push('onHitByAny'); },
      onKill: () => { order.push('onKill'); },
    });
    const e = Enemy.fromVanilla(15, 100, 100)!;
    e.hurt(9999, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, false, 0, true);
    expect(order).toEqual(['onHitByAny', 'onKill']);
  }, 60_000);
  // ★D20-m5(2026-10-13):城镇 NPC 受击派发(死亡支 killed=true/存活支 false;
  //  mod townNPC 声明域同相)
  it('城镇 NPC 1(受击存活):派发 killed=false', async () => {
    const seen: Array<Record<string, unknown>> = [];
    registerGlobalNpcHooks('t', { onHitByAny: (_e, ctx) => { seen.push({ ...ctx }); } });
    const { TownNPC } = await import('../src/entities/TownNPC');
    const n = new TownNPC('guide', 100, 100);   // 向导(vid 22;ctor 键=vanilla-npcs 键)
    const r = n.hurt(5, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, 0, false, true, true, 0);
    expect(r).toBe(true);
    expect(n.dead).toBe(false);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.killed).toBe(false);
  }, 60_000);

  it('城镇 NPC 1(致死):死亡钩+击杀钩派发 killed=true', async () => {
    const order: string[] = [];
    registerGlobalNpcHooks('t', {
      onHitByAny: (_e, ctx) => { if (ctx.killed) order.push('onHitByAny'); },
      onKill: () => { order.push('onKill'); },
    });
    const { TownNPC } = await import('../src/entities/TownNPC');
    const n = new TownNPC('guide', 100, 100);
    n.hurt(99999, 0, 0, fakeGame(new World(64, 64, 7, 't')), 0, 0, false, true, true, 0);
    expect(n.dead).toBe(true);
    expect(order).toEqual(['onHitByAny', 'onKill']);
  }, 60_000);
  // ★R-B-F2(2026-10-13):realLife 转移死——段 killed=false 一拍,头零受击拍
  //  (tML=OnHit 只对被击段;头 die→hurt(9999) 幻影拍抑制),头击杀钩照发
  it('realLife 转移:段单拍 killed=false;头零幻影拍+击杀钩照发', async () => {
    const beats: Array<Record<string, unknown>> = [];
    const kills: string[] = [];
    registerGlobalNpcHooks('t', {
      onHitByAny: (e, ctx) => { beats.push({ vid: (e as { vanillaId?: number }).vanillaId, ...ctx }); },
      onKill: (e) => { kills.push(String((e as { vanillaId?: number }).vanillaId)); },
    });
    const { Enemy: E2 } = await import('../src/entities/Enemy');
    const head = E2.fromVanilla(134, 100, 100)!;   // 毁灭者头
    const seg = E2.fromVanilla(135, 100, 100)!;    // 段
    (seg as unknown as { realLifeHost: Enemy }).realLifeHost = head;
    const w2 = new World(64, 64, 7, 't');
    const g2 = {
      world: w2,
      player: { dead: false, cx: 0, cy: 0, buffs: { has: () => false, apply: () => {} }, equipStats: {}, addDPS: () => {} },
      recLog: () => {}, addDamageNumber: () => {}, lastDamageCause: null,
      playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
      spawnParticles: () => {}, spawnDrop: () => null, onEnemyKilled: () => {},
      enemies: () => [], critters: () => [],
      dust: { spawn: () => ({}) },
      noSpawnCycleThisFrame: false, bossDamageSink: {},
      lighting: { addLight: () => {} },
    } as never;
    seg.hurt(1e9, 0, 0, g2, 0, false, 0, true);
    const hitBeats = beats.filter((b) => !b.killed);
    const killBeats = beats.filter((b) => b.killed);
    expect(hitBeats).toHaveLength(1);                       // 段单拍
    expect((hitBeats[0]! as { vid?: number }).vid).toBe(135);
    expect(killBeats).toHaveLength(0);                      // 头幻影拍抑制
    expect(kills).toContain('134');                         // 头击杀钩照发
  }, 60_000);
});
