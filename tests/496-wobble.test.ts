// 496 暗影炎弓箭 aiStyle 91 波动 AI 行为锁（红蓝台账 R2 批 2026-09-03）。
// 权威：Projectile.cs:33097-33148（AI_091 缩径/摆动/尘）、:18822-18843（撞块反射/碎裂）、
// :11473-11476（影焰 buff 153 Next(240,480)t）、:5694-5704（SetDefaults）。
// 桩参考 tests/rain-cloud.test.ts（World+Player+GameHooks 假件）。
// ★几何口径：Arrow ctor 判定盒取 SetDefaults 40×40（vanilla-projectiles.json）→
//   出生 Center = 顶左 + 20;首子步 AI_091 即把盒改写为 20×scale 并 Center 锚定。
import { describe, it, expect } from 'vitest';
import { Arrow, setProjSpriteOverride } from '../src/entities/Arrow';
import { projectileData } from '../src/data/vanillaProjectiles';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import projJson from '../src/data/vanilla-projectiles.json';
import statusJson from '../src/data/vanilla-projstatus.json';
import type { GameHooks } from '../src/entities/types';

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; hits: number[];
  hurt: (d: number, kx: number, ky: number, g: GameHooks) => boolean;
  [k: string]: unknown;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - 8, y: cy - 12, w: 16, h: 24, dead: false, cx, cy, hp: 10000, hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

function mkHooks(enemies: MockEnemy[] = []) {
  const w = new World(60, 200, 1, 'sf496');
  // 清出高空测试带(行 20-70):种子 1 生成地形会填满洞周
  for (let x = 0; x < 60; x++) {
    for (let y = 20; y <= 70; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  const player = new Player(30 * 16, 20 * 16, new Inventory());
  const hooks = {
    world: w,
    player,
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
  (hooks as unknown as { entities: { nextId: number; add: () => void } }).entities = {
    nextId: 1, add: () => {},
  };
  return { hooks: hooks as unknown as GameHooks, world: w, player };
}

type SFOpts = Partial<ConstructorParameters<typeof Arrow>[7]>;
/** NewProjectile 496 出手参缺省：重力 0（aiStyle91 无重力段）+ 穿透 3。
 *  top-left 传「意想 Center − 20」（出生盒 40×40 → Center=top-left+20） */
const mkArrow = (cx: number, cy: number, vx: number, vy: number,
  opts: SFOpts = {}): Arrow => new Arrow(cx - 20, cy - 20, vx, vy, 32, 2, 496,
  { grav: 0, pierce: 3, extraUpdates: 0, ...opts } as ConstructorParameters<typeof Arrow>[7]);

describe('496 暗影炎弓箭 aiStyle 91（Projectile.cs:33097-33148）', () => {
  it('【数据面】vanilla-projectiles/projstatus 496 条目（缺口登记哨兵）', () => {
    const p = (projJson as Record<string, Record<string, number | boolean>>)['496'];
    expect(p.aiStyle).toBe(91);            // :5697
    expect(p.penetrate).toBe(3);           // :5701
    expect(p.width).toBe(40);              // :5695（仅贴图面;AI 逐子步改写为 20×scale）
    expect(p.height).toBe(40);
    expect(p.magic).toBe(true);            // :5700
    expect(p.extraUpdates).toBe(2);        // MaxUpdates=3 ≡ extraUpdates+1（:5702 提取器并表）
    // ★登记缺口（recon 双闸门外禁直改 json）：1457 终值 alpha=255/usesLocalNPCImmunity/
    // localNPCHitCooldown=-1 三键在【json 提取面】仍缺（本哨兵锁 raw json 形态）——
    // 2026-09-03 登记项①已由 vanillaProjectiles.ts DATA_PATCH['496'] 注入消费面
    // （合并面断言见下方「登记项①」describe;免疫行为等价锁 = ⑥b）
    expect(p.alpha).toBeUndefined();
    expect(p.usesLocalNPCImmunity).toBeUndefined();
    expect(p.localNPCHitCooldown).toBeUndefined();
    expect(p.timeLeft).toBeUndefined();    // SetDefaults 无 timeLeft 行 → 缺省 3600（:526）
    const s = (statusJson as Record<string, Array<{ buff: number; chance: number; durMin: number; durMax: number }>>)['496'];
    expect(s).toHaveLength(1);
    expect(s[0].buff).toBe(153);           // 影焰 buff（:11473-11476）
    expect(s[0].chance).toBe(1);           // 恒中（非掷骰档）
    expect(s[0].durMin).toBe(240);         // Next(240,480)
    expect(s[0].durMax).toBe(479);
  });

  it('①摆动子步数学:v+=ai×1.5 每子步、ai×1.05/子步（:33118-33124）', () => {
    const { hooks } = mkHooks();
    // EU=0 → 每 fixedUpdate 恰 1 子步,数值逐子步可锁
    const a = mkArrow(500, 500, 5, 0, { ai0: 0.05, ai1: 0.02 });
    a.fixedUpdate(1 / 60, hooks);
    expect(a.vx).toBeCloseTo(5 + 0.05 * 1.5, 10);        // :33118
    expect(a.vy).toBeCloseTo(0.02 * 1.5, 10);            // :33119
    a.fixedUpdate(1 / 60, hooks);
    expect(a.vx).toBeCloseTo(5.075 + 0.05 * 1.05 * 1.5, 10);   // :33123 ×1.05 后再加速
    expect(a.vy).toBeCloseTo(0.03 + 0.02 * 1.05 * 1.5, 10);
  });

  it('①b 速度帽:|v|>16 → 归一×16（:33120-33122）', () => {
    const { hooks } = mkHooks();
    const b = mkArrow(500, 500, 15.9, 0, { ai0: 1, ai1: 0 });
    b.fixedUpdate(1 / 60, hooks);                        // 15.9+1.5=17.4 → 钳 16
    expect(b.vx).toBeCloseTo(16, 6);
    expect(b.vy).toBeCloseTo(0, 6);
    const c = mkArrow(500, 500, -15.9, 0, { ai0: -1, ai1: 0 });   // 负向对称
    c.fixedUpdate(1 / 60, hooks);
    expect(c.vx).toBeCloseTo(-16, 6);
    expect(c.vy).toBeCloseTo(0, 6);
  });

  it('②缩径:盒 width=height=20×scale Center 锚定、drawScale=scale（:33101-33105）', () => {
    const { hooks } = mkHooks();
    const a = mkArrow(500, 500, 2, 0);
    // 子步 1:scale=1 → 盒 20×20（SetDefaults 40×40 被 AI 逐子步改写）
    a.fixedUpdate(1 / 60, hooks);
    expect(a.w).toBe(20); expect(a.h).toBe(20);
    expect(a.cx).toBeCloseTo(502, 6);                    // 出生 Center 500 + 位移 2
    // 盒序 20,19,19,19,19,19,18…（scale=1−localAI,(int)(20×scale) 截断）
    const seq: number[] = [a.w];
    for (let t = 0; t < 6; t++) { a.fixedUpdate(1 / 60, hooks); seq.push(a.w); }
    expect(seq).toEqual([20, 19, 19, 19, 19, 19, 18]);
    expect(a.drawScale).toBeCloseTo(1 - 0.06, 10);       // 第 7 子步 localAI_pre=0.06
    // Center 锚定:每拍 cx 恰进 |v|（缩径不得平移中心）
    const c1 = a.cx;
    a.fixedUpdate(1 / 60, hooks);
    expect(a.cx - c1).toBeCloseTo(2, 6);
  });

  it('②b 缩径 Kill 时点:45 子步（11×0.01+34×0.025;float32/float64 同相）', () => {
    const { hooks } = mkHooks();
    // EU=0:第 44 子步 localAI=0.935 仍活,第 45 子步 0.96≥0.95 → Kill（:33110-33113）
    const a = mkArrow(500, 500, 2, 0);
    for (let t = 0; t < 44; t++) a.fixedUpdate(1 / 60, hooks);
    expect(a.dead).toBe(false);
    a.fixedUpdate(1 / 60, hooks);
    expect(a.dead).toBe(true);
    // EU=2（Game 3053 支实传,MaxUpdates=3 别名式）:45 子步 → 第 15 tick 第 3 子步亡
    const b = mkArrow(500, 500, 2, 0, { extraUpdates: 2 });
    for (let t = 0; t < 14; t++) b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(false);
    b.fixedUpdate(1 / 60, hooks);
    expect(b.dead).toBe(true);
    // timeLeft 缺省 3600（SetDefaults 无覆写）→ 缩径判亡恒先于寿命尽
    expect(b.life).toBeGreaterThan(45);
  });

  it('③影焰尘 27:scale<1 起每子步 i<scale×10 粒、Center 折半+noGravity（:33125-33147）', () => {
    const { hooks } = mkHooks();
    const dusts: Array<Record<string, number | boolean>> = [];
    (hooks as unknown as { spawnDust: unknown }).spawnDust =
      (x: number, y: number, _w: number, _h: number, type: number,
       sx: number, sy: number, alpha: number, _c: unknown, _s: number,
       noGravity: boolean) => {
        const d: Record<string, number | boolean> = {
          type, x, y, vx: sx, vy: sy, scale: 1.1, alpha, fadeIn: 0,
          noGravity: !!noGravity,     // Game.spawnDust 末参同式后置（桩 1:1 复刻）
        };
        dusts.push(d);
        return d;
      };
    const a = mkArrow(500, 500, 0, 0, { ai0: 0.05, ai1: 0 });
    a.fixedUpdate(1 / 60, hooks);                        // 子步 1:scale=1 → 无尘
    expect(dusts.length).toBe(0);
    a.fixedUpdate(1 / 60, hooks);                        // 子步 2:scale=0.99 → i<9.9 → 10 粒
    expect(dusts.length).toBe(10);
    const d0 = dusts[0];
    expect(d0.type).toBe(27);                            // 影焰尘
    expect(d0.alpha).toBe(100);                          // NewDust α=100
    expect(d0.noGravity).toBe(true);                     // 后置 noGravity
    expect(d0.fadeIn).toBe(100);                         // 100+owner（单机 owner=0）
    expect(d0.scale).toBeCloseTo(1.1 + 0.99 * 0.75, 10); // += scale×0.75
    // position=(NewDust 位+Center)/2 折半;尘速=v×0.1−v弹×(1.3−scale)
    // 子步 1 已加速 v=0.075 并位移 → 子步 2 锚定 Center=500.075、盒顶左 x=491.075
    expect(d0.x).toBeCloseTo((491.075 + 500.075) / 2, 6);
    // y 无加速:Center 500、盒顶左 491 → 折半 495.5
    expect(d0.y).toBeCloseTo(495.5, 6);
    // v弹@子步2 = 0.075+0.0525×1.5 = 0.15375;尘速 = v弹×0.1 − v弹×(1.3−scale)
    expect(d0.vx).toBeCloseTo(0.15375 * 0.1 - 0.15375 * (1.3 - 0.99), 10);
  });

  it('④精确发直线对照:ai=0 → v 恒向;cx 逐子步对齐原版锚定式（含半像素漂移）', () => {
    const { hooks } = mkHooks();
    const a = mkArrow(500, 500, 4, 0, { extraUpdates: 2 });       // EU=2 → 3 子步/拍
    for (let t = 0; t < 2; t++) a.fixedUpdate(1 / 60, hooks);
    expect(a.vy).toBe(0);                                // 无 ai → vy 恒 0（直线）
    // 原版锚定式直算（:33100-33105 逐式 + 每子步位移 4）——width 奇数拍
    // (int)(w/2) 整除使 Center 每子步 +0.5px（vanilla 同源逐字,非本仓近似）
    let x = 480, y = 480, w = 40, l = 0;
    for (let s = 0; s < 6; s++) {
      const cx0 = x + w / 2, cy0 = y + w / 2;
      w = Math.trunc(20 * (1 - l));
      x = cx0 - Math.trunc(w / 2) + 4;
      y = cy0 - Math.trunc(w / 2);
      l = l < 0.1 ? l + 0.01 : l + 0.025;
    }
    expect(a.cx).toBeCloseTo(x + w / 2, 6);
    expect(a.cy).toBeCloseTo(y + w / 2, 6);
    // 对照 wobble 发:ai≠0 → 同拍 vy 已累积偏离直线
    const b = mkArrow(500, 500, 4, 0, { extraUpdates: 2, ai0: 0.05, ai1: 0.03 });
    b.fixedUpdate(1 / 60, hooks);
    expect(b.vy).toBeGreaterThan(0);
  });

  it('⑤撞块:实心正撞 → 主轴全速反弹不消亡（:18824-18827 残余0≡<1反射支;R2-01 翻案）', () => {
    // 原版 lastVelocity=HandleMovement 入口速度(:17696),TileCollision 实心正撞把该轴
    // 截为 0 → |残余|<1 恒成立 → velocity = −lastVelocity（快弹撞墙=反弹,同段 94/311/
    // 312/522/620/524 无门槛全速反同构）;≥1 Kill 支仅斜坡/半砖部分截断可及,单点碰撞
    // 模型下不可达（Arrow.ts 496 支头注）
    const { hooks, world } = mkHooks();
    const dirt = TILE_BY_KEY['dirt'] ?? 1;
    for (let y = 24; y <= 38; y++) world.store.setTileSilent(36, y, dirt, 0, 0);
    const a = mkArrow(33 * 16, 30 * 16, 4, 0, { ai0: 0, ai1: 0 });
    let flips = 0;
    // 45 子步内缩径判亡 → 窗口锁 44 拍（EU=0）
    for (let t = 0; t < 44 && !a.dead; t++) {
      const vx0 = a.vx;
      a.fixedUpdate(1 / 60, hooks);
      if (Math.sign(a.vx) !== Math.sign(vx0)) flips++;
    }
    expect(a.dead).toBe(false);                         // 反弹不碎裂（曾按 ≥1 门误 Kill）
    expect(flips).toBe(1);                              // 入墙轴恰一反
    expect(a.vx).toBeCloseTo(-4, 6);                    // 全速反 −lastVelocity（4px/子步）
  });

  it('⑤b 撞块:慢轴蹭壁 → 该轴全速反射不消亡（:18824-18827）', () => {
    const { hooks, world } = mkHooks();
    const dirt = TILE_BY_KEY['dirt'] ?? 1;
    for (let y = 24; y <= 38; y++) world.store.setTileSilent(36, y, dirt, 0, 0);
    const b = mkArrow(548, 30 * 16, 0.5, 0, { ai0: 0, ai1: 0 });   // Center 548,墙 576
    let flips = 0;
    // 45 子步内缩径判亡 → 窗口锁 44 拍（EU=0）
    for (let t = 0; t < 44 && !b.dead; t++) {
      const vx0 = b.vx;
      b.fixedUpdate(1 / 60, hooks);
      if (Math.sign(b.vx) !== Math.sign(vx0)) flips++;
    }
    expect(b.dead).toBe(false);                         // 反射档不消亡（曾缺 return 落通用碎裂口）
    expect(flips).toBe(1);                              // 入墙轴恰一反
    expect(b.vx).toBeCloseTo(-0.5, 6);                  // 全速反 −lastVelocity
  });

  it('⑥命中敌:影焰 buff 153 Next(240,480)t=4..8s（表驱动 applyProjStatus;:11473-11476）', () => {
    // 敌中心 (544,503):箭盒 y≈490..510(+半像素漂移)全程重叠敌盒 y 491..515
    const e = mkEnemy(4901, 34 * 16, 30 * 16 + 23);
    const { hooks } = mkHooks([e]);
    const a = mkArrow(500, 500, 4, 0);
    for (let t = 0; t < 30 && !a.dead; t++) a.fixedUpdate(1 / 60, hooks);
    expect(e.hits.length).toBeGreaterThanOrEqual(1);    // 20×scale 缩径盒承伤
    const t153 = (e as unknown as { shadowFlameT?: number }).shadowFlameT ?? 0;
    expect(t153).toBeGreaterThanOrEqual(4);
    expect(t153).toBeLessThanOrEqual(8);
  });

  it('⑥b 同敌不二跳（vanilla localNPCHitCooldown=-1 永久局部免疫 ↔ hitSet 等价）', () => {
    const e = mkEnemy(4902, 34 * 16, 30 * 16 + 23);
    const { hooks } = mkHooks([e]);
    const a = mkArrow(500, 500, 4, 0);
    for (let t = 0; t < 44 && !a.dead; t++) a.fixedUpdate(1 / 60, hooks);
    expect(e.hits.length).toBe(1);                      // penetrate 3 但同敌免账恒 1 跳
  });

  it('⑦88 激光支零影响:ai0 槽双消费面分流（88=extraUpdates 接管/496=纯数据）', () => {
    const { hooks } = mkHooks();
    // 88：opts.ai0 → hostileAi0 → AI 支头 extraUpdates 直写（Projectile.cs:54979-54982）
    const laser = new Arrow(500, 500, 6, 0, 10, 1, 88, { grav: 0, ai0: 3 });
    const lk = laser as unknown as { hostileAi0: number; extraUpdates: number };
    expect(lk.hostileAi0).toBe(3);
    laser.fixedUpdate(1 / 60, hooks);
    expect(lk.extraUpdates).toBe(3);
    // 496：opts.ai0/ai1 → 摆动台账,extraUpdates 保持 opts 值不被接管
    const sf = mkArrow(500, 500, 4, 0, { extraUpdates: 2, ai0: 0.05, ai1: 0.03 });
    const sk = sf as unknown as { hostileAi0: number; extraUpdates: number };
    expect(sk.hostileAi0).toBeCloseTo(0.05, 10);        // 台账同值（88 门内才消费）
    sf.fixedUpdate(1 / 60, hooks);
    expect(sk.extraUpdates).toBe(2);                    // ← 零影响核心断言
  });
});

// ==================== 登记项①（2026-09-03）：496 数据面 DATA_PATCH 三键 + α=255 隐身面 ====================
// 权威：Projectile.cs:5694-5705（SetDefaults 终值 alpha=255/:5695、usesLocalNPCImmunity/
// :5703、localNPCHitCooldown=-1/:5704）。GetAlpha 无 496 专属支 → 缺省路径 :81507-81521
// num14=(255−alpha)/255=0 → 精灵本体【恒隐】,可见面=AI 影焰尘 27 拖尾（本文件 ③ 已锁）。
// json 直改被 recon 双闸门外禁令锁定 → 三键唯一入口 = vanillaProjectiles.ts DATA_PATCH。
/** 录制型 ctx（arrow-fx-audit 同款）：只在 drawImage 快照 globalAlpha/gco（node 无 canvas） */
function makeDrawCtx496() {
  const calls: Array<{ ga: number; gco: string }> = [];
  let ga = 1;
  let gco = 'source-over';
  const ctx = {
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {}, scale: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {},
    set globalAlpha(v: number) { ga = v; },
    get globalAlpha() { return ga; },
    set globalCompositeOperation(v: string) { gco = v; },
    get globalCompositeOperation() { return gco; },
    filter: 'none',
    imageSmoothingEnabled: false,
    drawImage: () => { calls.push({ ga, gco }); },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe('496 数据面 DATA_PATCH 三键 + α=255 贴图隐身（登记项①）', () => {
  it('【合并面】projectileData(496) 三键=1457 终值；raw json 三列仍缺（哨兵面不变）', () => {
    const d = projectileData(496);
    expect(d).not.toBeNull();
    expect(d!.alpha).toBe(255);                       // :5695
    expect(d!.usesLocalNPCImmunity).toBe(true);       // :5703
    expect(d!.localNPCHitCooldown).toBe(-1);          // :5704
    expect(d!.extraUpdates).toBe(2);                  // MaxUpdates=3 并表面不变
    expect(d!.penetrate).toBe(3);                     // :5701
    expect((projJson as Record<string, Record<string, unknown>>)['496'].alpha).toBeUndefined();
    expect((projJson as Record<string, Record<string, unknown>>)['496'].localNPCHitCooldown)
      .toBeUndefined();
  });

  it('【α 运行时面】ctor alpha=255（PROJ_ALPHA0[496],GetAlpha 缺省路径读 α 的起点）', () => {
    const { hooks } = mkHooks();
    const a = mkArrow(500, 500, 4, 0);
    expect(a.alpha).toBe(255);
    void hooks;
  });

  it('【免疫面·接线后零变】ctor localImmune=-1 不吃 >0 门 → hitSet 永久同敌免（≡ vanilla -1）', () => {
    const e = mkEnemy(4903, 34 * 16, 30 * 16 + 23);
    const { hooks } = mkHooks([e]);
    const a = mkArrow(500, 500, 4, 0);
    expect((a as unknown as { localImmune: number }).localImmune).toBe(-1);   // ctor 数据列接线
    for (let t = 0; t < 44 && !a.dead; t++) a.fixedUpdate(1 / 60, hooks);
    expect(e.hits.length).toBe(1);                    // 与 ⑥b 修前同值（行为零变锁）
  });

  it('【draw 面】精灵本体 ga=0 恒隐（本体不画）+ 影焰尘 27 拖尾照常（拖尾照画）', () => {
    const { hooks } = mkHooks();
    const dusts: Array<{ type: number }> = [];
    (hooks as unknown as { spawnDust: unknown }).spawnDust =
      (_x: number, _y: number, _w: number, _h: number, type: number) => {
        const d = { type };
        dusts.push(d);
        return d;
      };
    setProjSpriteOverride(496, { width: 40, height: 40 } as unknown as HTMLImageElement);
    const a = mkArrow(500, 500, 4, 0);
    for (let t = 0; t < 3; t++) a.fixedUpdate(1 / 60, hooks);   // 缩径期 → 影焰尘持续
    expect(dusts.filter((d) => d.type === 27).length).toBeGreaterThan(0);   // 拖尾照画
    const { ctx, calls } = makeDrawCtx496();
    a.draw({ ctx, mainPlayer: undefined } as never, undefined as never);
    expect(calls.length).toBeGreaterThanOrEqual(1);   // 本体确走 drawImage 路径（非缺图兜底）
    expect(calls.every((c) => c.ga === 0)).toBe(true);          // (255−255)/255 = 0 恒隐
    expect(calls.every((c) => c.gco === 'source-over')).toBe(true);   // 非加算组（常规合成）
  });
});
