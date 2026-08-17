// 召唤兽朝向/旋转语义（2026-08-17 镜像修复批，Projectile.cs 真值）：
// ① 双子 387/388（aiStyle 66）= 旋转制：rotation = velocity.ToRotation()+π
//    （:28859-28861/:28864-28868；387 交战中朝 LOS 目标 :28867）——贴图朝左
//    +π 补偿，恒不水平翻转（原版 dir=SpriteEffects.None）
// ② AI_062 族（373/375/407/423/613，:62983-62990）velocity.X>0 →
//    spriteDirection=-1——贴图朝左、右行才翻转 → facing=-sign(vx)
//    （曾误 facing=sign(vx) 全族镜像）
// ③ AI_026/AI_164 族（266/191-194/313/379/390/391/831/970/1094）原版零
//    spriteDirection 赋值——恒不翻转（我们曾按 facing 翻转=错向）
// ④ 963 阿比盖尔特判 ×-1（:62992）贴图朝右——常规 facing=sign(目标方向) 不变
import { describe, expect, it } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 120;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
  return store;
}
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; damage: number;
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
}
function mkEnemy(id: number, cx: number, cy: number, w = 16, h = 24): MockEnemy {
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, cx, cy, hp: 10000, damage: 10,
    hurt: () => true,
  };
  return e;
}
function makeHooks(enemies: MockEnemy[] = []) {
  const store = makeStore();
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const projectiles: unknown[] = [];
  const hooks: GameHooks = {
    world: { store } as never,
    player: player as never,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  (hooks as unknown as { entities: { add: (e: unknown, b: string) => void; projectiles: unknown[] } }).entities = {
    add: (e: unknown) => { projectiles.push(e); },
    projectiles,
  };
  return { hooks, player };
}

/** 记录型 ctx 桩：捕获 rotate/scale/drawImage 调用序 */
function recCtx() {
  const rec: { rotate: number[]; scale: number[][]; calls: string[] } = {
    rotate: [], scale: [], calls: [],
  };
  return {
    rec,
    ctx: {
      set imageSmoothingEnabled(_: boolean) {}
      , get imageSmoothingEnabled() { return false; },
      save() { rec.calls.push('save'); },
      restore() { rec.calls.push('restore'); },
      translate(_x: number, _y: number) { rec.calls.push('translate'); },
      rotate(a: number) { rec.rotate.push(a); rec.calls.push('rotate'); },
      scale(x: number, y: number) { rec.scale.push([x, y]); rec.calls.push('scale'); },
      drawImage() { rec.calls.push('drawImage'); },
      fillRect() {}, strokeRect() {}, set fillStyle(_: string) {}, set strokeStyle(_: string) {},
    } as unknown as CanvasRenderingContext2D,
  };
}

function drawAndRecord(m: MinionProj): ReturnType<typeof recCtx>['rec'] {
  const { rec, ctx } = recCtx();
  m.draw({ canvas: { getContext: () => ctx } } as never);
  return rec;
}

function mkMinion(projId: number, ground: boolean, owner: Player): MinionProj {
  return new MinionProj(owner.cx, owner.cy - 40, projId, 10, 2, false, 0, ground,
    () => owner);
}

describe('召唤兽朝向/旋转语义（镜像修复回归）', () => {
  it('双子 387：交战中朝目标旋转 +π、恒不水平翻转（:28864-28868）', () => {
    const enemy = mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40);
    const { hooks, player } = makeHooks([enemy]);
    const m = mkMinion(387, false, player);
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBeGreaterThan(0);            // 朝目标飞行
    // 交战瞄准：目标角 + π（贴图朝左 +π 补偿，LOS 达成）
    const aim = Math.atan2(enemy.cy - m.cy, enemy.cx - m.cx) + Math.PI;
    expect(m.rot).toBeCloseTo(aim, 3);
    const rec = drawAndRecord(m);
    expect(rec.rotate).toHaveLength(1);         // 旋转制
    expect(rec.rotate[0]).toBeCloseTo(aim, 3);
    expect(rec.scale).toHaveLength(0);          // 恒不翻转
  });

  it('双子 388：rotation = velocity.ToRotation()+π（:28859-28861）', () => {
    const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
    const m = mkMinion(388, false, player);
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBeGreaterThan(0);
    expect(m.rot).toBeCloseTo(Math.atan2(m.vy, m.vx) + Math.PI, 3);
    const rec = drawAndRecord(m);
    expect(rec.rotate).toHaveLength(1);
    expect(rec.scale).toHaveLength(0);
  });

  it('AI_062 族 373：velocity.X>0 → spriteDirection=-1（贴图朝左 → facing 反号）', () => {
    const right = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
    const mR = mkMinion(373, false, right.player);
    mR.fixedUpdate(1, right.hooks);
    expect(mR.vx).toBeGreaterThan(0);
    expect(mR.facing).toBe(-1);                 // 右行才翻转（:62983-62985）
    const left = makeHooks([mkEnemy(1, 60 * 16 - 600, 90 * 16 - 40)]);
    const mL = mkMinion(373, false, left.player);
    mL.fixedUpdate(1, left.hooks);
    expect(mL.vx).toBeLessThan(0);
    expect(mL.facing).toBe(1);                  // 左行不翻（:62986-62988）
  });

  it('AI_062 族全表（373/375/407/423/613）右行 facing=-1', () => {
    for (const id of [373, 375, 407, 423, 613]) {
      const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
      const m = mkMinion(id, false, player);
      m.fixedUpdate(1, hooks);
      expect(m.vx, `proj ${id} 应朝右目标移动`).toBeGreaterThan(0);
      expect(m.facing, `proj ${id} 右行应 facing=-1`).toBe(-1);
    }
  });

  it('AI_026 族 266 宝宝史莱姆：恒不翻转（原版零 spriteDirection 赋值）', () => {
    const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16 + 200, 90 * 16 - 16)]);
    const m = mkMinion(266, true, player);
    for (let i = 0; i < 30; i++) m.fixedUpdate(1, hooks);   // 走向右侧敌
    expect(m.facing).toBe(1);                  // facing 值随移动方向（内部逻辑用）
    const rec = drawAndRecord(m);
    expect(rec.scale).toHaveLength(0);          // 渲染恒不翻（MINION_NO_FLIP）
  });

  it('963 阿比盖尔：贴图朝右特判（:62992 ×-1）——常规朝向不受左贴图表影响', () => {
    const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
    const m = mkMinion(963, false, player);
    m.fixedUpdate(1, hooks);
    expect(m.vx).toBeGreaterThan(0);
    expect(m.facing).toBe(1);                  // 朝右不翻（贴图朝右）
  });
});
