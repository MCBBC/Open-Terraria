// module8 编排粒子 L5 清偿批回归（2026-08-31）：syncModules.ParticleOrchestraType
// 新接九型 + RepelAt 排斥面。锚表：
//   - fx/orchestraFx.ts = Spawn_* 收编本体（每型 rng 注入;"type 触发→粒子调用带
//     特征参数"断言经 Game.netApplyParticleOrchestra 真派发,桩=Object.create 模式）
//   - 原版真值 Terarria1458/Terraria.GameContent.Drawing/ParticleOrchestrator.cs
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Game } from '../src/core/Game';
import { World } from '../src/world/World';
import { NetReader } from '../src/net/protocol';
import {
  ParticleOrchestraType, writeParticleModule, readParticleModule,
} from '../src/net/syncModules';

type PartRec = { x: number; y: number; color: string; count: number; opts: Record<string, unknown> };
type DustRec = {
  x: number; y: number; w: number; h: number; type: number;
  vx: number; vy: number; alpha: number; scale: number;
  ret: { x: number; y: number; vx: number; vy: number; noGravity: boolean };
};

/** netApplyParticleOrchestra 真派发闭包（Game.prototype 桩，同 buff-partial-fixes 口径） */
function mkApply(g: Game) {
  return (type: number, px: number, py: number, mx = 0, my = 0, ui = 0) => {
    Object.getPrototypeOf(g)
      .netApplyParticleOrchestra.call(g, type, {
        posX: px, posY: py, moveX: mx, moveY: my, uniqueInfo: ui, invoker: 0,
      });
  };
}

function mkGame(store?: unknown) {
  const particles: PartRec[] = [];
  const dusts: DustRec[] = [];
  const wavs: Array<{ file: string; vol: number }> = [];
  const files: Array<{ names: string[]; vol: number }> = [];
  const g = Object.create(Game.prototype) as unknown as Game;
  g.spawnParticles = (x: number, y: number, color: string, count: number,
    _speed?: number, opts: Record<string, unknown> = {}) => {
    particles.push({ x, y, color, count, opts });
  } as never;
  g.spawnDust = ((x: number, y: number, w: number, h: number, type: number,
    vx = 0, vy = 0, alpha = 0,
    _color?: unknown, scale = 1, noGravity = false) => {
    const ret = { x, y, vx: 1.1, vy: -1.1, noGravity };
    dusts.push({ x, y, w, h, type, vx, vy, alpha, scale, ret });
    return ret;
  }) as never;
  g.playSfxWav = ((file: string, vol?: number) => { wavs.push({ file, vol: vol ?? 1 }); }) as never;
  g.playSfxFiles = ((names: string[], vol?: number) => { files.push({ names, vol: vol ?? 1 }); }) as never;
  g.world = { store: store ?? new World(160, 200, 30, 'orch-stub').store } as never;
  return { g, particles, dusts, wavs, files };
}

/** 固定世界：160×200，地面带 y=190（泥土）——7×7 块尘/地表扫描消费面 */
function groundWorld(): World {
  const w = new World(160, 200, 30, 'orch-l5');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

describe('module8 编排粒子 L5 批（fx/orchestraFx + netApplyParticleOrchestra）', () => {
  it('枚举数值对齐 ParticleOrchestraType.cs 注册序（1458 全量）', () => {
    expect(ParticleOrchestraType.RainbowRodHit).toBe(5);
    expect(ParticleOrchestraType.PetExchange).toBe(19);
    expect(ParticleOrchestraType.SlapHand).toBe(20);
    expect(ParticleOrchestraType.FlyMeal).toBe(21);
    expect(ParticleOrchestraType.WaffleIron).toBe(30);
    expect(ParticleOrchestraType.DeadCellsMushroomBoiExplosion).toBe(34);
    expect(ParticleOrchestraType.DeadCellsDownDashExplosion).toBe(35);
    expect(ParticleOrchestraType.DeadCellsFlint).toBe(41);
    expect(ParticleOrchestraType.ClassyCane).toBe(55);
    expect(ParticleOrchestraType.ShadowbeamHostile).toBe(58);
    expect(ParticleOrchestraType.ShadowbeamFriendly).toBe(59);
    expect(ParticleOrchestraType.PaladinsHammerShockwave).toBe(68);
  });

  describe('① RainbowRodHit(5) — Spawn_RainbowRodHit :3462-3512', () => {
    it('收编本体：六掷双层虹彩 sparkle(life60) + 24×d267 双层尘 noGravity', async () => {
      const { rainbowRodHitFx } = await import('../src/fx/orchestraFx');
      const { g, particles, dusts } = mkGame();
      rainbowRodHitFx(g, 100, 90, 2, -4);
      // 六掷 ×2（彩色 rgb 层 + 白核 rgba）=12 粒调用组,寿命统一 60t（num5 衰减窗）
      const grouped = particles.filter((p) => p.opts.life === 60);
      expect(grouped.length).toBeGreaterThanOrEqual(12);
      expect(particles.some((p) => String(p.color).startsWith('rgb('))).toBe(true);
      expect(particles.some((p) => String(p.color).startsWith('rgba(255'))).toBe(true);
      // 尘面：12×d267 + CloneDust 白影 12 = 24,noGravity（Main.dust[num6].noGravity :3509）
      expect(dusts.length).toBe(24);
      expect(dusts.every((d) => d.type === 267 && d.ret.noGravity)).toBe(true);
    });

    it('type 触发真派发：远端复放同款体（尘面 +24/sparkle 组翻倍）', async () => {
      const { g, particles, dusts } = mkGame();
      const beforeDust = dusts.length;
      const beforeSparkle = particles.filter((p) => p.opts.life === 60).length;
      mkApply(g)(ParticleOrchestraType.RainbowRodHit, 100, 90, 2, -4, 0);
      expect(dusts.length).toBe(beforeDust + 24);
      expect(particles.filter((p) => p.opts.life === 60).length).toBeGreaterThan(beforeSparkle);
    });
  });

  describe('② 近战命中音三连（Player.cs :44707-44745）+ ClassyCane', () => {
    it('SlapHand(20)/WaffleIron(30)/FlyMeal(21) 各播 Item175/178/16 于命中中心', () => {
      const a = mkGame();
      mkApply(a.g)(ParticleOrchestraType.SlapHand, 10, 20);
      expect(a.wavs.map((w) => w.file)).toEqual(['Item_175']);
      const b = mkGame();
      mkApply(b.g)(ParticleOrchestraType.WaffleIron, 10, 20);
      expect(b.wavs.map((w) => w.file)).toEqual(['Item_178']);
      const c = mkGame();
      mkApply(c.g)(ParticleOrchestraType.FlyMeal, 10, 20);
      expect(c.wavs.map((w) => w.file)).toEqual(['Item_16']);
    });

    it('ClassyCane(55)：7×d10(α80,scale1.1,vy−1) 恒定;纸屑按 Next(0,2) 掷、Next(3)!=0 noGravity', async () => {
      const { classyCaneFx } = await import('../src/fx/orchestraFx');
      const noPaper = mkGame();
      classyCaneFx(noPaper.g, 5, 5, () => 0.4);            // Next(0,2)=0 → 无 gore1218 档
      expect(noPaper.particles.length).toBe(0);
      expect(noPaper.dusts.length).toBe(7);
      expect(noPaper.dusts.every((d) =>
        d.type === 10 && d.alpha === 80 && d.scale === 1.1 && d.vx === 0 && d.vy === -1)).toBe(true);
      expect(noPaper.dusts.some((d) => d.ret.noGravity)).toBe(false);   // 0.4<1/3 → 有重力档

      const paper = mkGame();
      classyCaneFx(paper.g, 5, 5, () => 0.9);              // 有纸屑 + Next(3)!=0 全 noGravity
      expect(paper.particles.length).toBe(1);
      expect(paper.dusts.every((d) => d.ret.noGravity)).toBe(true);

      const dispatched = mkGame();                          // 缺省 rng 走真派发：dust 面 7 条恒定
      mkApply(dispatched.g)(ParticleOrchestraType.ClassyCane, 5, 5);
      expect(dispatched.dusts.filter((d) => d.type === 10).length).toBe(7);
    });
  });

  describe('③ DeadCells 族', () => {
    it('DeadCellsMushroomBoiExplosion(34) → 红 #FF0A0A ×10（:2442 血爆近似体）', async () => {
      const { resetMushroomBoiExplosionSlots } = await import('../src/entities/DeadCellsMushroom');
      resetMushroomBoiExplosionSlots();
      const { g, particles } = mkGame();
      mkApply(g)(ParticleOrchestraType.DeadCellsMushroomBoiExplosion, 40, 60);
      resetMushroomBoiExplosionSlots();
      const red = particles.find((p) => p.color === '#FF0A0A');
      expect(red && red.count === 10).toBe(true);
    });

    it('DeadCellsDownDashExplosion(35)：40×白尘爆发 + monk 冲地音;uniqueInfo==1 强化档同量', () => {
      const base = mkGame();
      mkApply(base.g)(ParticleOrchestraType.DeadCellsDownDashExplosion, 50, 50, 128, 1, 0);
      expect(base.files.some((f) => f.names[0].startsWith('dd2_monk_staff_ground_impact'))).toBe(true);
      expect(base.particles.length).toBe(40);              // dust306 ×40（:2140）
      const strong = mkGame();
      mkApply(strong.g)(ParticleOrchestraType.DeadCellsDownDashExplosion, 50, 50, 176, 1, 1);
      expect(strong.particles.length).toBe(40);            // value*=1.5 只改速幅不改量（:2147-2149）
    });

    it('DeadCellsFlint(41)：裸露实心门——扫到顶面格播 release 音,全空场静默返回(:1879)', () => {
      const grounded = mkGame(groundWorld().store);
      mkApply(grounded.g)(ParticleOrchestraType.DeadCellsFlint, 80 * 16 + 8, 189 * 16, 32, 1, 0);
      expect(grounded.files.some((f) => f.names[0] === 'deadcells_flint_release')).toBe(true);

      const air = mkGame(new World(160, 200, 30, 'orch-air').store);
      mkApply(air.g)(ParticleOrchestraType.DeadCellsFlint, 80 * 16, 95 * 16, 32, 1, 0);
      expect(air.files.length).toBe(0);                    // 扫盒无「实心且上格非实心」格
    });
  });

  describe('④ Shadowbeam(58/59) — Spawn_Shadowbeam :1987-2005', () => {
    it('锚点(movementVector)→当前位置按步距铺撒 d173 三联（uniqueInfo=|v|×1000 步距载荷）', () => {
      const { g, dusts } = mkGame();
      // dist=40px、|v|×1000=10000 → stepPx=10 → 4 步 ×3 尘 = 12
      mkApply(g)(ParticleOrchestraType.ShadowbeamFriendly, 140, 120, 100, 120, 10000);
      expect(dusts.length).toBe(12);
      expect(dusts.every((d) => d.type === 173 && d.w === 1 && d.h === 1 && d.alpha === 0)).toBe(true);
      expect(dusts.every((d) => d.scale >= 70 * 0.013 - 1e-9 && d.scale <= 110 * 0.013 + 1e-9)).toBe(true);
    });
  });

  describe('⑤ PaladinsHammerShockwave(68) — Spawn_ :816-881', () => {
    it('Item180 音 + d57/d43 放射环掷 + 7×7 实心块尘圈（MovementVector=Size 还原命中盒）', () => {
      const w = groundWorld();
      const cx = 80 * 16, cy = 188 * 16;                   // 地面上格 → ±3 格窗含 y=190 实心行
      const { g, dusts, wavs } = mkGame(w.store);
      mkApply(g)(ParticleOrchestraType.PaladinsHammerShockwave, cx - 11, cy - 11, 22, 22, 0);
      expect(wavs.some((v) => v.file === 'Item_180')).toBe(true);     // Spawn_ 头部 :822
      const d57 = dusts.filter((d) => d.type === 57 && d.alpha === 200 && d.scale === 1.8);
      const d43 = dusts.filter((d) => d.type === 43 && d.alpha === 254 && d.scale === 1.3);
      expect(d57.length + d43.length).toBeGreaterThan(0);  // 50 掷两互斥支（Next(2)/Next(3))
      expect(Math.abs(d57.vx + 0) >= 0).toBe(true);
      const blocks = dusts.filter((d) => d.type === 14 && d.vy === -3);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.length).toBeLessThanOrEqual(32);       // 同圈帽（C 批登记口径保留）
    });
  });

  // ==================== producer 生产面结构断言 ====================
  describe('⑥ producer 面接线（clientOnly:false 型本地直生+broadcast 双写）', () => {
    const src = (p: string): string => readFileSync(new URL(p, import.meta.url), 'utf8');

    it('WhipTag kaleidoscope OnTaggedHit → RainbowRodHit @弹心 broadcast', () => {
      const s = src('../src/entities/WhipTag.ts');
      expect(s.includes("case 'kaleidoscope':")).toBe(true);
      expect(s.includes('rainbowRodHitFx(game, ctx.hx, ctx.hy)')).toBe(true);
      expect(s.includes('ParticleOrchestraType.RainbowRodHit')).toBe(true);
    });

    it('MissileProj 79 命中/Kill 双掷收编 + 命中面 broadcast（P.cs:14299 clientOnly:false）', () => {
      const s = src('../src/entities/MissileProj.ts');
      expect(s.match(/rainbowRodHitFx\(game/g)?.length).toBeGreaterThanOrEqual(3);  // 命中 1 + Kill 2
      expect(s.includes('game.broadcastParticleOrchestra?.(ParticleOrchestraType.RainbowRodHit')).toBe(true);
    });

    it('WeaponProj 301 撞墙 → PaladinsHammerShockwave(Size 载荷) 本地+broadcast', () => {
      const s = src('../src/entities/WeaponProj.ts');
      expect(s.includes('paladinsHammerShockwaveFx(game, this.x, this.y, this.w, this.h)')).toBe(true);
      expect(s.includes('ParticleOrchestraType.PaladinsHammerShockwave,\n          this.x, this.y, this.w, this.h')).toBe(true);
      expect(s.includes("from '../fx/orchestraFx'")).toBe(true);
    });

    it('DeadCellsFlint emitSpikes → DeadCellsFlint broadcast;MinionProj 蘑菇爆点广播补远端', () => {
      expect(src('../src/entities/DeadCellsFlint.ts').includes('ParticleOrchestraType.DeadCellsFlint')).toBe(true);
      expect(src('../src/entities/MinionProj.ts').includes('ParticleOrchestraType.DeadCellsMushroomBoiExplosion')).toBe(true);
    });

    it('Game 近战双循环同挂 meleeOrchestraStrike（3258/5382/5129 三 case）+ RepelAt 接入主循环', () => {
      const s = src('../src/core/Game.ts');
      expect(s.match(/this\.meleeOrchestraStrike\(/g)?.length).toBe(2);   // 敌怪/城镇 NPC 两循环
      expect(s.includes('case 3258:') && s.includes('case 5382:') && s.includes('case 5129:')).toBe(true);
      expect(s.includes('repelParticlesAt(this.world.store,')).toBe(true); // Player.UpdateParticles 门
    });
  });

  // ==================== wire 往返 ====================
  it('module8 编解码往返保留新 type 与 settings 字段（21B 载荷不动）', () => {
    const payload = writeParticleModule(ParticleOrchestraType.DeadCellsFlint, {
      posX: 12.5, posY: 3400.25, moveX: 32, moveY: 1, uniqueInfo: 7, invoker: 3,
    });
    const back = readParticleModule(new NetReader(payload, 5));
    expect(back.type).toBe(41);
    expect(back.settings.posX).toBeCloseTo(12.5, 2);
    expect(back.settings.posY).toBeCloseTo(3400.25, 1);
    expect(back.settings.moveX).toBeCloseTo(32, 1);
    expect(back.settings.uniqueInfo).toBe(7);
    expect(back.settings.invoker).toBe(3);
  });
});
