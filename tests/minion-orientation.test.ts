// 召唤兽朝向/旋转语义（2026-08-17 镜像修复批，Projectile.cs 真值）：
// ① 双子 387/388（aiStyle 66）= 旋转制：rotation = velocity.ToRotation()+π
//    （:28859-28861/:28864-28868；387 交战中朝 LOS 目标 :28867）——贴图朝左
//    +π 补偿，恒不水平翻转（原版 dir=SpriteEffects.None）
// ② AI_062 族（373/375/407/423/613，:62983-62990）velocity.X>0 →
//    spriteDirection=-1——贴图朝左、右行才翻转 → facing=-sign(vx)
//    （曾误 facing=sign(vx) 全族镜像）
// ③ AI_026/AI_164 族（266/191-194/313/379/831/970/1094）原版零
//    spriteDirection 赋值——恒不翻转（我们曾按 facing 翻转=错向）。
//    2026-08-23 订正：390-392 蜘蛛有赋值（共享 :63316-63323 `type != 313` + flag7
//    专属 :65162 spriteDirection=-direction）→ 已移出 MINION_NO_FLIP（见
//    weapon-minion-ai.test.ts 蜘蛛镜像断言）
// ④ 963 阿比盖尔特判 ×-1（:62992）贴图朝右——常规 facing=sign(目标方向) 不变
import { describe, expect, it } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow } from '../src/entities/Arrow';
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
    damagePlayer: (): number => 0,
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
  return { hooks, player, projectiles };
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
  m.draw({ ctx } as never);
  return rec;
}

function mkMinion(projId: number, ground: boolean, owner: Player): MinionProj {
  return new MinionProj(owner.cx, owner.cy - 40, projId, 10, 2, false, 0, ground,
    () => owner);
}
/** AI_062 私有态读口（a62A0=ai[0]/a62A1=ai[1]） */
const priv = (m: MinionProj): { a62A0: number; a62A1: number } =>
  m as unknown as { a62A0: number; a62A1: number };

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

  it('AI_062 族全表（373/375/407/423/613）右行 facing=-1;423/613 冲刺触发拍冻结（:66562/:66600 return）', () => {
    // 2026-08-23 冲刺真实化更新：423/613 在 600px 入冲刺门（:66555/:66593）→ 触发拍
    // return 跳过姿态段（:66827 rotation/:66947-66954 spriteDirection）→ facing 冻结
    // 初值;非冲刺拍照常 :66947-66954 右行 facing=-1
    for (const id of [373, 375, 407]) {
      const { hooks, player } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
      const m = mkMinion(id, false, player);
      m.fixedUpdate(1, hooks);
      expect(m.vx, `proj ${id} 应朝右目标移动`).toBeGreaterThan(0);
      expect(m.facing, `proj ${id} 右行应 facing=-1`).toBe(-1);
    }
    for (const id of [423, 613]) {
      const far = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
      const mF = mkMinion(id, false, far.player);
      mF.fixedUpdate(1, far.hooks);
      expect(priv(mF).a62A0, `proj ${id} 600px 应触发冲刺`).toBe(2);
      expect(mF.facing, `proj ${id} 触发拍姿态冻结（初值 1）`).toBe(1);
      // 非冲刺档：423 瞄准距 262（200<距≤300 门内不冲）、613 距 290（≤400）→
      // >200 通用加速段 vx>0 → facing=-1。613 压射击冷却（:67116 门 a62A1≠0 不出手
      // ——隔离 :67129 后坐 velocity-=向×速/3 对朝向断言的干扰）
      const ex = id === 423 ? 250 : 350;
      const near = makeHooks([mkEnemy(1, 60 * 16 + ex, 90 * 16 - 40)]);
      const mN = mkMinion(id, false, near.player);
      priv(mN).a62A1 = 1;
      mN.fixedUpdate(1, near.hooks);
      expect(priv(mN).a62A0, `proj ${id} 近距不冲`).toBe(0);
      expect(mN.vx, `proj ${id} 应朝右目标移动`).toBeGreaterThan(0);
      expect(mN.facing, `proj ${id} 右行应 facing=-1`).toBe(-1);
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

  it('387 激光出弹锚点 = 本体中心（NewProjectile @Center :28977-38981）', () => {
    const { hooks, player, projectiles } = makeHooks([mkEnemy(1, 60 * 16 + 600, 90 * 16 - 40)]);
    const m = mkMinion(387, false, player);
    const before = projectiles.length;
    m.fixedUpdate(1, hooks);                   // 首帧即射（shootCd 初 0）
    const shots = projectiles.slice(before)
      .filter((e): e is Arrow => e instanceof Arrow);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const s = shots[0];
    expect(s.projId).toBe(389);                // MiniRetinaLaser
    expect(s.life).toBe(300);                  // :28981 timeLeft=300
    // 4×4 判定盒 → 左上 = Center−2；弹体中心精确等于随从中心（曾 -5 写死偏 3px）
    expect(s.x + s.w / 2).toBeCloseTo(m.cx, 6);
    expect(s.y + s.h / 2).toBeCloseTo(m.cy, 6);
  });

  it('俾格米 191 掷矛锚点 = Center−8（AI_026 vector15 :58764）+ timeLeft 300', () => {
    const { hooks, player, projectiles } = makeHooks([mkEnemy(1, 60 * 16 + 400, 90 * 16 - 8)]);
    const m = new MinionProj(player.cx, player.cy - 40, 191, 10, 2, false, 0, true, () => player);
    const before = projectiles.length;
    m.fixedUpdate(1, hooks);
    const shots = projectiles.slice(before).filter((e): e is Arrow => e instanceof Arrow);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const s = shots[0];
    expect(s.projId).toBe(195);
    expect(s.life).toBe(300);                       // :58798 timeLeft=300
    expect(s.x + s.w / 2).toBeCloseTo(m.cx, 6);     // 水平 = 中心
    expect(s.y + s.h / 2).toBeCloseTo(m.cy - 8, 6); // 手部高度 −8（曾缺此偏移）
  });

  it('弩车哨兵 677 弩箭 680 锚点 = Center+(0,-4)−8（批②:1457 :69597-9599/65717-65719 '
    + 'center.Y−4 字面怪癖——仅 677 不随方向镜像）', () => {
    const { hooks, player, projectiles } = makeHooks([mkEnemy(1, 60 * 16 + 300, 90 * 16 - 30)]);
    // 哨兵 16×16 落在地面行(100)之上——避免下落漂移干扰锚点断言
    const m = new MinionProj(player.cx, 100 * 16 - 16, 677, 20, 6, true, 0, false, () => player);
    const before = projectiles.length;
    // 初冷 + 开火状态机（出弹帧 ai[1]==num2=num6=5，旧"12t"是 num2 初值误读）
    for (let i = 0; i < 200; i++) m.fixedUpdate(1, hooks);
    const shots = projectiles.slice(before).filter((e): e is Arrow => e instanceof Arrow);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const s = shots[0];
    expect(s.projId).toBe(680);
    expect(s.x + s.w / 2).toBeCloseTo(m.cx, 6);     // 原版 center=base.Center（曾 y+20 左上角语义偏半格）
    expect(s.y + s.h / 2).toBeCloseTo(m.cy - 4, 6); // ★Y−4 仅 677（2026-08-31 批②接入）
  });

  it('冰九头蛇哨兵 308 冰弹 309 按 14×14 判定盒居中（309 SetDefaults）', () => {
    const { hooks, player, projectiles } = makeHooks([mkEnemy(1, 60 * 16 + 300, 90 * 16 - 60)]);
    const m = new MinionProj(player.cx, 100 * 16 - 16, 308, 20, 3, true, 0, false, () => player);
    const before = projectiles.length;
    for (let i = 0; i < 200; i++) m.fixedUpdate(1, hooks);
    const shots = projectiles.slice(before).filter((e): e is Arrow => e instanceof Arrow);
    expect(shots.length).toBeGreaterThanOrEqual(1);
    const s = shots[0];
    expect(s.projId).toBe(309);
    expect(s.w).toBe(14);                            // 14×14 判定盒
    // 目标在右上 ~35° → 扇区 2：炮口 = Center+(24×facing,−2)（:27291-27318）
    expect(s.x + s.w / 2).toBeCloseTo(m.cx + 24 * Math.sign(60 * 16 + 300 - m.cx), 6);
    expect(s.y + s.h / 2).toBeCloseTo(m.cy - 2, 6);
  });

  it('双子互斥：同点出生的两只眼会分开（AI_66 :28514-28539 曼哈顿距<40 互推）', () => {
    const { hooks, player, projectiles } = makeHooks();   // 无敌怪 → 悬停态
    const a = new MinionProj(player.cx, player.cy - 60, 387, 10, 2, false, 0, false, () => player);
    const b = new MinionProj(player.cx, player.cy - 60, 388, 10, 2, false, 0, false, () => player);
    projectiles.push(a, b);                           // 互斥扫描走 entities.projectiles
    const d0 = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    expect(d0).toBe(0);                               // 成对同点出生
    for (let i = 0; i < 90; i++) { a.fixedUpdate(1, hooks); b.fixedUpdate(1, hooks); }
    const d1 = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    expect(d1).toBeGreaterThanOrEqual(20);            // 分开（原版互斥平衡 ~40px）
  });
});

describe('随从世界点光（AI 侧 AddLight/CastLightOpen，2026-08-17 血蝙蝠红光批）', () => {
  it('755 血蝙蝠 = Crimson(220,20,60)/255（AI_156_GetColor :48604/:48613）', () => {
    const { player } = makeHooks();
    const m = new MinionProj(player.cx, player.cy, 755, 10, 2, false, 0, false, () => player);
    const l = (m as unknown as { lightRGB: [number, number, number] | null }).lightRGB;
    expect(l).toEqual([220 / 255, 20 / 255, 60 / 255]);
  });

  it('613 细胞(0.2,0.6,0.7)/623 守护者(0.9,0.9,0.7)/1094 狐火(0.5,0.3,0.1)', () => {
    const { player } = makeHooks();
    const mk = (id: number): [number, number, number] | null =>
      (new MinionProj(0, 0, id, 10, 2, false, 0, false, () => player) as unknown as { lightRGB: [number, number, number] | null }).lightRGB;
    expect(mk(613)).toEqual([0.2, 0.6, 0.7]);
    expect(mk(623)).toEqual([0.9, 0.9, 0.7]);
    expect(mk(1094)).toEqual([0.5, 0.3, 0.1]);
  });

  it('387/388 双子原版零自发光（AI_66 仅 533 有 AddLight）', () => {
    const { player } = makeHooks();
    const mk = (id: number): [number, number, number] | null =>
      (new MinionProj(0, 0, id, 10, 2, false, 0, false, () => player) as unknown as { lightRGB: [number, number, number] | null }).lightRGB;
    expect(mk(387)).toBeNull();
    expect(mk(388)).toBeNull();
  });
});
