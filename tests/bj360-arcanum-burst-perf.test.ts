// ★BJ360 星云奥秘爆炸 perf 批（用户实报"最终爆炸消逝掉帧"）：
//   刀1 A=0 恒等乘数直绘快路径（Renderer.drawVanillaDustPass A=0 加性支）——86-91 族
//       GetAlpha :2511 恒档 rgb=1 → 逐尘 getImageData×2 重着色为纯 no-op,星云爆炸窗
//       2000+ 活跃尘曾测 lit pass 4-9ms/帧（gidT≈5ms@2600 枚）= 掉帧主因。快路径直接
//       从图集帧源 drawImage,输出逐位等价（×1 恒等、α 通道本就不进循环）。
//       本面 = 结构锁（源码锚,era-guard 家族范式）。
//   刀2 爆炸生成量判别面（数量钉值,对拍 Projectile.Kill :73553-73612）：84 尘
//       （4×d240α100s1.5 + 30 循环×(d62α200s3.7 + d90α100s1.5/fadeIn1) +
//       10×d62α0s2.7 + 10×d240α0s1.5）+ 2 烟 gore(61..63) + 620 伤×0.65/击退×0.8。
//       （BJ348b 已钉 620×(5..8)+(5..8) 色键 86|90 与 618 清场链——本面钉尘/gore 组成。）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';
import { Arrow } from '../src/entities/Arrow';
import { GorePiece } from '../src/entities/GorePiece';

interface DustRec {
  type: number; alpha: number; scale: number; noGravity: boolean; fadeIn?: number;
}

function makeGame(w: World, dusts: DustRec[], bucket?: Arrow[]) {
  return {
    world: w, player: null as unknown, enemies: () => [], critters: () => [],
    projectiles: () => [],
    entities: { nextId: 1, add: (e: unknown) => { if (bucket) bucket.push(e as Arrow); } },
    playSfx: () => {}, playSfxFiles: (() => {}) as unknown,
    playSfxFile: () => {},
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: (): number => 0, notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    addLightAt: () => {},
    spawnDust: (_x: number, _y: number, _w: number, _h: number, type: number,
      _sx = 0, _sy = 0, alpha = 0, _c: unknown = null, scale = 1, ng = false) => {
      const d: DustRec = { type, alpha, scale, noGravity: !!ng };
      dusts.push(d);
      return d;
    },
    broadcastParticleOrchestra: () => {},
  } as unknown as GameHooks;
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  return w;
}

const GAME_ROOT = join(__dirname, '..');

describe('BJ360 刀1：A=0 恒等乘数直绘快路径 perf 结构锁（Renderer A=0 加性支）', () => {
  const src = readFileSync(join(GAME_ROOT, 'src/render/Renderer.ts'), 'utf8');

  it('源码锚：A=0 支内恒等快路径存在（排除 43/66,mR/mG/mB 全 ===1）', () => {
    const a0 = src.indexOf('(a <= 0.004 && !d.color) || d.type === 43 || d.type === 66');
    expect(a0, 'A=0 加性支判据存在').toBeGreaterThan(0);
    const fast = src.indexOf('d.type !== 43 && d.type !== 66 && mR === 1 && mG === 1 && mB === 1', a0);
    expect(fast, '★BJ360 恒等快路径判据缺失（perf 结构被回退?）').toBeGreaterThan(a0);
  });

  it('源码锚：快路径先于逐尘 getImageData 读回（读回只服务非恒等乘数/43/66）', () => {
    const a0 = src.indexOf('(a <= 0.004 && !d.color) || d.type === 43 || d.type === 66');
    const fast = src.indexOf('d.type !== 43 && d.type !== 66 && mR === 1 && mG === 1 && mB === 1', a0);
    // A=0 支的读回点 = a0 之后首个 c1.getImageData（尘 8×8 重着色）
    const gid = src.indexOf('c1.getImageData(0, 0, 8, 8)', a0);
    expect(gid).toBeGreaterThan(0);
    expect(fast, '快路径必须在读回之前（否则 A=0 主力族仍走逐尘读回）').toBeLessThan(gid);
    // 快路径体内 = 图集帧源直绘（8×8 源矩形 + origin(-4,-4) + 'lighter'）
    const body = src.slice(fast, gid);
    expect(body).toContain("ctx.drawImage(img, d.fx, d.fy, 8, 8, -4, -4, 8, 8)");
    expect(body).toContain("'lighter'");
  });

  it('源码锚：非恒等读回重着色链仍在（43/66 与 rgb≠1 族不落快路径）', () => {
    expect(src).toContain('c1.getImageData(0, 0, 8, 8)');
    expect(src).toContain('ida.data[i] = ida.data[i] * mR');
    expect(src).toContain('c2.getImageData(0, 0, 8, 8)');   // 43/66 colorPass 读回面
  });
});

describe('BJ360 刀2：617 死亡爆生成量判别面（对拍 Projectile.Kill :73553-73612）', () => {
  it('尘组成钉值：d240×14（α100×4+α0×10,s1.5）+ d62×40（s3.7×30+s2.7×10）+ d90×30（fadeIn1）= 84', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const a = new Arrow(800, 1500, 3.9, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
    const h240 = dusts.filter((d) => d.type === 240);
    const h62 = dusts.filter((d) => d.type === 62);
    const h90 = dusts.filter((d) => d.type === 90);
    expect(h240.length, 'd240 = 4×(:73562 α100) + 10×(:73593 α0)').toBe(14);
    expect(h240.filter((d) => d.alpha === 100).length).toBe(4);
    expect(h240.filter((d) => d.alpha === 0).length).toBe(10);
    for (const d of h240) expect(d.scale).toBe(1.5);
    expect(h62.length, 'd62 = 30×(:73567 α200 s3.7) + 10×(:73580 α0 s2.7)').toBe(40);
    expect(h62.filter((d) => d.scale === 3.7).length).toBe(30);
    expect(h62.filter((d) => d.scale === 3.7 && d.alpha === 200).length).toBe(30);
    expect(h62.filter((d) => d.scale === 2.7).length).toBe(10);
    expect(h90.length, 'd90 = 30×(:73573 α100 s1.5)').toBe(30);
    for (const d of h90) { expect(d.alpha).toBe(100); expect(d.scale).toBe(1.5); }
    expect(dusts.length, '爆裂面总尘 = 84（零 618 清场尘混入,t0 杀无在场火花）').toBe(84);
    // ★碎片链收口刃勘正（2026-09-28）：4×d240(α100) 原版【无】noGravity 写行
    //   （:73563-73564 仅覆 position → 重力开）；其余 80 尘 noGravity=true
    //   （:73570/:73577/:73585/:73593）
    for (const d of dusts.filter((q) => q.type === 240 && q.alpha === 100)) {
      expect(d.noGravity, '4×d240 α100 无 noGravity 写行').toBe(false);
    }
    for (const d of dusts.filter((q) => !(q.type === 240 && q.alpha === 100))) {
      expect(d.noGravity).toBe(true);
    }
  });

  it('烟 gore×2 全落 61..63（:73604-73610 Next(61,64) 右开）', () => {
    const dusts: DustRec[] = [];
    const game = makeGame(emptyWorld(), dusts);
    const seen: number[] = [];
    const orig = GorePiece.newGore;
    (GorePiece as unknown as { newGore: unknown }).newGore = function (
      this: unknown, type: number, ...rest: unknown[]) {
      seen.push(type);
      return null as unknown as GorePiece;   // 桩返回 null：爆裂面不消费返回值
    };
    try {
      const a = new Arrow(800, 1500, 3.9, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
      (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
    } finally {
      (GorePiece as unknown as { newGore: unknown }).newGore = orig;
    }
    expect(seen.length).toBe(2);
    for (const t of seen) expect(t).toBeGreaterThanOrEqual(61);
    for (const t of seen) expect(t).toBeLessThanOrEqual(63);
  });

  it('620 碎片伤×0.65/击退×0.8 int 截断（70→45、5→4）——BJ348b 数量/色键面外补', () => {
    const dusts: DustRec[] = [];
    const bucket: Arrow[] = [];
    const game = makeGame(emptyWorld(), dusts, bucket);
    const a = new Arrow(800, 1500, 3.9, 0, 70, 5, 617, { grav: 0, life: 3600, pierce: 3 });
    (a as unknown as { killNow: (g: GameHooks) => void }).killNow(game);
    const shards = bucket.filter((q) => q.projId === 620);
    expect(shards.length).toBeGreaterThanOrEqual(10);
    expect(shards.length).toBeLessThanOrEqual(16);
    for (const sh of shards) {
      const s = sh as unknown as { damage: number; knockback: number };
      expect(s.damage, 'trunc(70×0.65)=45').toBe(45);
      expect(s.knockback, '5×0.8=4').toBe(4);
    }
  });
});
