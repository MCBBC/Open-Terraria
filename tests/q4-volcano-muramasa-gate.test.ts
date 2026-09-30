// ★Q4 刀 2026-09-30（任务5：C5 同族 P1 定谳#2——977/978 全局免疫窗读域勘误判别面）：
//   原文 Damage_PVE_Inner :12635-12641：`flag3 = maxPenetrate==1 && !usesLocalNPCImmunity
//   && !usesIDStaticNPCImmunity; if (!((owner<0||targetNPC.immune[owner]==0)|flag3)) return;`
//   —— 978（:9255-9271 maxPenetrate=3∧usesLocal=true）/ 977（:9210-9226 penetrate=1 但
//   usesLocal=true）flag3 恒 false ⇒ 全局窗门【生效】，读【弹幕域】targetNPC.immune[owner]
//   ≙ 本仓 Enemy.iframes 共享窗（清偿刀 T 单源 snapshotVanillaGate 快照判据）。
//   旧档 duck-call Game.meleeNpcImmuneGateOf（近战三重门 :44598 immune 分量的仓内独立簿
//   npcImmuneByAttacker——近战管线不写+命中尾清零桥=事实恒空）系错域投影（与 856 同病）：
//   ①弹幕域有窗（他弹残窗 iframes>0）敌被误放行 ②近战簿有窗敌被误拒。
//   写半面（清偿刀 W 同族）：usesLocal 族命中尾原文写 `immune[owner]=0`（:14175-14178）
//   ⇒ Enemy.hurt pierce=-3 清零档（BJ398 现役梯），节流归弹内局部表（hitSet）——
//   旧档 pierce=0 写 10t 新窗=无中生有。
//   门拒语义 = 原文 return：不落 hitSet、penetrate 不减、弹体存活、清窗桥不写。
//   变异证红（手工执行实录）：
//     M1 978 门换回 meleeNpcImmuneGateOf 独立簿（stub 恒开）→ C1 红（残窗敌被误放行）
//     M2 977 hurt pierce -3→0 → C4 红（写面 10t 新窗回归）
//     M3 978 门拒支 hitSet.add 前置（拒收也落标）→ C2 红（原文 return 不落标）
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { VolcanoBlastProj } from '../src/entities/VolcanoBlastProj';
import { MuramasaSlashProj } from '../src/entities/meleeOnHitProjs';

type GateFE = {
  id: number; x: number; y: number; w: number; h: number; cx: number; cy: number;
  dead: boolean; iframes?: number; dontTakeDamage?: boolean;
  hurtCalls: Array<{ pierce?: number }>;
  hurt: (d: number, kx: number, ky: number, g: unknown, pen?: number, crit?: boolean,
    pierce?: number, fromPlayer?: boolean) => boolean;
};

function mkEnemy(id: number, x: number, y: number, opts: { iframes?: number; dontTakeDamage?: boolean } = {}): GateFE {
  const e: GateFE = {
    id, x, y, w: 16, h: 16, cx: x + 8, cy: y + 8, dead: false,
    iframes: opts.iframes, dontTakeDamage: opts.dontTakeDamage,
    hurtCalls: [],
    hurt: function (this: GateFE, _d, _kx, _ky, _g, _pen, _crit, pierce) {
      this.hurtCalls.push({ pierce });
      return false;
    },
  };
  return e;
}

function mkGame(...enemies: GateFE[]) {
  const world = new World(200, 200, 30, 'q4-gate');
  const immuneWrites: Array<[number, number]> = [];
  const gg = {
    world,
    player: { cx: 500, cy: 500, x: 490, y: 479, w: 20, h: 42, facing: 1 },
    enemies: () => enemies,
    critters: () => [],
    playSfx: vi.fn(),
    spawnDust: () => null,
    noteNpcPlayerImmune: (id: number, t: number) => immuneWrites.push([id, t]),
  } as never;
  return { gg, immuneWrites };
}

// ═══ 978 火山大剑爆焰（VolcanoBlastProj） ═══
describe('Q4-F 978 全局免疫窗读域（弹幕域 Enemy.iframes）', () => {
  it('C1 残窗敌（iframes=10）→ 整个跳过：零 hurt/零清窗桥/弹存活（原文 return 面）', () => {
    const tgt = mkEnemy(1, 450, 450, { iframes: 10 });
    const { gg, immuneWrites } = mkGame(tgt);
    const b = new VolcanoBlastProj(458, 458, 0, -1, 40, 3, 1);
    b.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(0);
    expect(immuneWrites).toHaveLength(0);              // 门拒在任何写尾之前
    expect(b.dead).toBe(false);
    expect((b as unknown as { penLeft: number }).penLeft).toBe(3);  // penetrate 不减
  });

  it('C2 空窗敌 → 受理：hurt(pierce=-3)+清窗桥[id,0]+hitSet 落标（次拍不双扣）', () => {
    const tgt = mkEnemy(2, 450, 450);
    const { gg, immuneWrites } = mkGame(tgt);
    const b = new VolcanoBlastProj(458, 458, 0, -1, 40, 3, 1);
    b.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(1);
    expect(tgt.hurtCalls[0]!.pierce).toBe(-3);          // usesLocal 族清零档（BJ398 梯）
    expect(immuneWrites).toContainEqual([2, 0]);        // :14177 immune[owner]=0 桥
    expect((b as unknown as { penLeft: number }).penLeft).toBe(2);
    b.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(1);              // localNPCHitCooldown=-1 终生一跳
  });

  it('C3 dontTakeDamage → 拒（vanillaGateRejected 双判据第二腿;:12600 外门同相）', () => {
    const tgt = mkEnemy(3, 450, 450, { dontTakeDamage: true });
    const { gg } = mkGame(tgt);
    const b = new VolcanoBlastProj(458, 458, 0, -1, 40, 3, 1);
    b.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(0);
  });
});

// ═══ 977 村正斩月光波（MuramasaSlashProj） ═══
describe('Q4-G 977 全局免疫窗读域（弹幕域 Enemy.iframes）', () => {
  it('C4 残窗敌（iframes=10）→ 跳过不落标、弹存活（flag3=false 门,penetrate=1 也门控）', () => {
    const tgt = mkEnemy(4, 450, 450, { iframes: 10 });
    const { gg } = mkGame(tgt);
    const cut = new MuramasaSlashProj(458, 458, 0, 0, 20, 0, 0);
    cut.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(0);
    expect(cut.dead).toBe(false);                       // 原文 return：penetrate 不减
  });

  it('C5 空窗敌 → 受理 hurt(pierce=-3)+清窗桥+单发消亡（penetrate=1）', () => {
    const tgt = mkEnemy(5, 450, 450);
    const { gg, immuneWrites } = mkGame(tgt);
    const cut = new MuramasaSlashProj(458, 458, 0, 0, 20, 0, 0);
    cut.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(1);
    expect(tgt.hurtCalls[0]!.pierce).toBe(-3);
    expect(immuneWrites).toContainEqual([5, 0]);
    expect(cut.dead).toBe(true);                        // penetrate=1 单发即亡
  });

  it('C6 dontTakeDamage → 拒', () => {
    const tgt = mkEnemy(6, 450, 450, { dontTakeDamage: true });
    const { gg } = mkGame(tgt);
    const cut = new MuramasaSlashProj(458, 458, 0, 0, 20, 0, 0);
    cut.fixedUpdate(1 / 60, gg);
    expect(tgt.hurtCalls).toHaveLength(0);
  });
});
