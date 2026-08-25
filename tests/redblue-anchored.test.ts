// AI_013 锚定族专支回归(蓝队插队案:石巨人之拳 1297/弹 262 + 鱼叉 160/KO 加农 1314/链刀 1325):
//   原版真态 = 1458 Projectile.cs:24928-25121(出膛超程门→返回制速穿墙)+ :19627-19663
//   (撞块转回收)+ Damage_PVE_Inner :14213-14229(命中转回收;23 特支 penetrate=3)+
//   :25064-25074/:15057(262 返回起手 200×200 一帧冲击盒+Item14)+ Main.cs:29688/29914/
//   29735/29961(玩家→拳 Chain22/18/23/Chain 链索绘制)。
// 此前整族归长矛前刺近似(AI_ANCHORED→'spear'),用户实报"石巨人之拳不对,缺少部件"。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { AnchoredProj, anchoredActive } from '../src/entities/WeaponProj';
import { combatWeapon } from '../src/data/vanillaItemCombat';
import type { GameHooks } from '../src/entities/types';

const combatWeaponOf = (vid: number) => combatWeapon({ key: `vi_${vid}_probe`, vid });

// ------------------------------------------------------------ 公共脚手架
function makeHooks(opts: { enemies?: Array<Record<string, unknown>> } = {}) {
  const store = new TileStore(400, 200);
  for (let x = 0; x < 400; x++) for (let y = 150; y < 200; y++) store.setTile(x, y, 1);
  const sfx: string[] = [];
  const player = new Player(100 * 16, 120 * 16, new Inventory());
  const hooks = {
    world: { store } as never,
    player,
    enemies: () => opts.enemies ?? [],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: (n: string) => { sfx.push(n); },
    playSfxFiles: () => {},
    showPickupLabel: () => {},
  };
  return { hooks: hooks as unknown as GameHooks, sfx, player };
}

/** 敌怪桩:hurt 计数,iframes 恒 0(全局免疫档不拦) */
function foe(id: number, cx: number, cy: number, w = 28, h = 28) {
  const e = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, iframes: 0, hp: 1000,
    hits: 0,
    hurt() { this.hits++; return true; },
  };
  return e;
}

beforeAll(() => {
  vi.stubGlobal('Image', class {
    naturalWidth = 12; naturalHeight = 12;
    width = 12; height = 12; complete = true;
    onload: (() => void) | null = null;
    set src(_v: string) { this.onload?.(); }
  });
});

const fire = (hooks: GameHooks, projId: number, spd?: number) => {
  const p = new AnchoredProj(1, 0, spd ?? 14, 90, 12, projId);
  p.x = hooks.player.cx - p.w / 2;
  p.y = hooks.player.cy - p.h / 2;
  return p;
};

// ================================================================ 状态机
describe('AI_013 出膛→超程回收三段形态(1458 Projectile.cs:24987-25104)', () => {
  it('262 出膛恒速直线;dist>500 转返回(a0=1);峰值 ≤500+单步', () => {
    const { hooks } = makeHooks();
    const f = fire(hooks, 262);
    expect(f.a0).toBe(-1);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.a0).toBe(0);                       // 首子步落位出生态
    expect(f.cx).toBeCloseTo(hooks.player.cx + 14, 0);  // 初速=朝向×14
    let peak = 0;
    let turnTick = -1;
    for (let t = 1; t <= 80; t++) {
      f.fixedUpdate(1 / 60, hooks);
      if (f.dead) break;
      peak = Math.max(peak, f.cx - hooks.player.cx);
      if (turnTick < 0 && f.a0 === 1) turnTick = t;
    }
    expect(turnTick).toBeGreaterThan(0);
    expect(peak).toBeGreaterThan(480);          // 门=500,单步 14 → 峰值∈(500,515)
    expect(peak).toBeLessThanOrEqual(520);
  });

  it('262 返回段制速 30 朝玩家、<50 Kill、全程消亡(:25076-25089)', () => {
    const { hooks } = makeHooks();
    const f = fire(hooks, 262);
    for (let t = 0; t < 40; t++) f.fixedUpdate(1 / 60, hooks);   // 出膛 ~36t 转返
    expect(f.a0).toBe(1);
    // 回收速度模长=30(262 特档;其余 20)
    const vm = Math.hypot(f.vx, f.vy);
    expect(vm).toBeGreaterThan(29.5);
    let alive = true;
    for (let t = 0; t < 60 && alive; t++) {
      f.fixedUpdate(1 / 60, hooks);
      if (f.dead || !anchoredActive([f], 262)) alive = false;
    }
    expect(alive).toBe(false);                  // 回手 Kill(dist<50)
  });

  it('显形门:a[1]>5 前 alpha=255(shown=false),第 6 拍起可见(:25016-25018)', () => {
    const { hooks } = makeHooks();
    const f = fire(hooks, 262);
    f.fixedUpdate(1 / 60, hooks);                // 出生拍 a1=1
    for (let t = 0; t < 4; t++) {                // a1=2..5 仍隐形
      f.fixedUpdate(1 / 60, hooks);
      expect(f.shown).toBe(false);
    }
    f.fixedUpdate(1 / 60, hooks);                // a1=6 >5 → 显形
    expect(f.shown).toBe(true);
  });

  it('ai[1] 钳 8:262 永不触发坠速支(vy 恒 0,:25011-25026);23 不钳→重力弧(:25027-25033)', () => {
    const mk = (projId: number) => {
      const { hooks } = makeHooks();
      const f = fire(hooks, projId);
      for (let t = 0; t < 30; t++) f.fixedUpdate(1 / 60, hooks);
      return f;
    };
    const golem = mk(262);
    expect(golem.vy).toBe(0);                   // 钳 8 → 结构性无坠速
    const harpoon = mk(23);
    expect(Math.abs(harpoon.vy)).toBeGreaterThan(0);   // ai[1]>=17 → vy+=0.6×N
  });
});

describe('回收触发三门(命中敌/撞块/超程)', () => {
  it('262 命中敌立即转返回(Damage aiStyle13 支 :14226-14229)+ 返回起手爆炸音(:25064-25074)', () => {
    const e = foe(1, 100 * 16 + 300, 120 * 16);
    const { hooks, sfx } = makeHooks({ enemies: [e] });
    const f = fire(hooks, 262);
    f.fixedUpdate(1 / 60, hooks);                // 出生拍(a0 -1→0)
    for (let t = 0; t < 60 && f.a0 === 0; t++) f.fixedUpdate(1 / 60, hooks);
    expect(f.a0).toBe(1);                       // 提前回收(远未到 500 门)
    expect(e.hits).toBeGreaterThanOrEqual(1);
    f.fixedUpdate(1 / 60, hooks);                // 返回相首拍:起手冲击结算
    expect(sfx).toContain('explosion');         // dist>=150 → Item14+200×200 冲击盒
  });

  it('262 冲击盒一帧性:localA0 消费后不再触发(localAI[0]==0 单发门 :15057)', () => {
    const e = foe(1, 100 * 16 + 300, 120 * 16);
    const { hooks, sfx } = makeHooks({ enemies: [e] });
    const f = fire(hooks, 262);
    for (let t = 0; t < 90 && !f.dead; t++) f.fixedUpdate(1 / 60, hooks);
    expect(sfx.filter((s) => s === 'explosion')).toHaveLength(1);
  });

  it('262 撞块转回收(HandleMovement aiStyle13 支 :19627-19663)', () => {
    const { hooks } = makeHooks();
    const store = (hooks.world as unknown as { store: TileStore }).store;
    const pt = Math.floor(hooks.player.cx / 16);
    const pr = Math.floor(hooks.player.cy / 16);
    for (let y = pr - 6; y <= pr + 6; y++) store.setTile(pt + 20, y, 1);   // 右侧 20 格立墙
    const f = fire(hooks, 262);
    f.fixedUpdate(1 / 60, hooks);                // 出生拍
    for (let t = 0; t < 40 && f.a0 === 0; t++) f.fixedUpdate(1 / 60, hooks);
    expect(f.a0).toBe(1);                       // 撞墙即回
    expect(f.tileCollide).toBe(false);          // 回收段穿墙
  });

  it('返回段穿墙:回收途中穿过实心墙列不被挡(:25081 tileCollide=false)', () => {
    const { hooks } = makeHooks();
    const store = (hooks.world as unknown as { store: TileStore }).store;
    const f = fire(hooks, 262);
    for (let t = 0; t < 40; t++) f.fixedUpdate(1 / 60, hooks);
    expect(f.a0).toBe(1);
    const pt = Math.floor(hooks.player.cx / 16);
    const pr = Math.floor(hooks.player.cy / 16);
    for (let col = pt + 8; col <= pt + 20; col++) for (let y = pr - 10; y <= pr + 10; y++) store.setTile(col, y, 1);
    let crossed = false;
    for (let t = 0; t < 60 && !f.dead; t++) {
      f.fixedUpdate(1 / 60, hooks);
      if (f.cx < hooks.player.cx + 8 * 16) crossed = true;   // 已穿到墙内侧
    }
    expect(crossed).toBe(true);
  });
});

describe('鱼叉 23 特有语义(penetrate=3 + 私账免疫 12t,:1059-1067/:14213-14224)', () => {
  it('前两击穿透不回收,第三击才 velocity 清零转返回', () => {
    const { hooks } = makeHooks();
    // 敌桩中心对齐玩家心(飞行线),x 各距 100/220/340
    const pcy = hooks.player.cy;
    const es = [foe(1, 100 * 16 + 100, pcy), foe(2, 100 * 16 + 220, pcy), foe(3, 100 * 16 + 340, pcy)];
    (hooks as unknown as { enemies: () => unknown[] }).enemies = () => es;
    const f = fire(hooks, 23, 15);
    f.fixedUpdate(1 / 60, hooks);                // 出生拍
    for (let t = 0; t < 60 && f.a0 === 0; t++) f.fixedUpdate(1 / 60, hooks);
    const totalHits = es.reduce((s, e) => s + e.hits, 0);
    expect(totalHits).toBe(3);                  // 三敌各吃一发
    expect(f.a0).toBe(1);                       // 第三击触发回收
  });

  it('同敌私账 12t 内不再中(usesLocalNPCImmunity/localNPCHitCooldown=12)', () => {
    // 宽体敌:出膛+回收两过场,若无私账则远多于 2 击
    const wide = foe(1, 100 * 16 + 200, 120 * 16, 260, 60);
    const { hooks } = makeHooks({ enemies: [wide] });
    const f = fire(hooks, 23, 15);
    f.fixedUpdate(1 / 60, hooks);                // 出生拍
    for (let t = 0; t < 120 && !f.dead; t++) f.fixedUpdate(1 / 60, hooks);
    // 出膛入体 1 击 + 私账 12t 后体中再击;回收过场同式——无私账时 260px 宽体
    // @15px/t 会吃 ~36 击,有私账应压到个位数;penetrate 耗尽后原版仍可伤(仅转返回)
    expect(wide.hits).toBeGreaterThanOrEqual(2);
    expect(wide.hits).toBeLessThanOrEqual(6);
  });
});

// ================================================================ 路由
describe('combatWeapon 锚定族路由(vanillaItemCombat.ts)', () => {
  it('四件落 kind anchored 且 shoot 各就位;3012 断头台链刃仍走 spear(R30 专支不动)', () => {
    expect(combatWeaponOf(160)).toMatchObject({ kind: 'anchored', shoot: 23 });
    expect(combatWeaponOf(1297)).toMatchObject({ kind: 'anchored', shoot: 262 });
    expect(combatWeaponOf(1314)).toMatchObject({ kind: 'anchored', shoot: 271 });
    expect(combatWeaponOf(1325)).toMatchObject({ kind: 'anchored', shoot: 273 });
    expect(combatWeaponOf(3012)).toMatchObject({ kind: 'spear', shoot: 481 });
  });
});

// ================================================================ 绘制
describe('链索绘制(玩家→拳,Main.cs DrawProjDirect 各型支)', () => {
  function recCtx() {
    const calls: Array<{ m: string; a: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => {
        if (k === 'canvas') return undefined;
        return (...a: unknown[]) => { calls.push({ m: String(k), a }); };
      },
    });
    return { calls, ctx };
  }
  it('262 中段飞行:链条先于弹体逐节绘出,节距≈12px、旋转 atan2−π/2(:29688-29736)', () => {
    const { hooks } = makeHooks();
    const f = fire(hooks, 262);
    for (let t = 0; t < 20; t++) f.fixedUpdate(1 / 60, hooks);   // 飞至 ~280px(fixedUpdate 续约链锚快照)
    const { calls, ctx } = recCtx();
    f.draw({ canvas: {}, ctx } as never, undefined as never);
    const translates = calls.filter((c) => c.m === 'translate').map((c) => c.a as number[]);
    expect(translates.length).toBeGreaterThan(10);               // 280px/12px ≈ 23 节
    // 节距≈12px:相邻链节 translate 距离(末位为本体 drawProj 的 translate,剔除;
    // 取最小值防链锚首节与弹心偏移混入)
    let pitch = Infinity;
    for (let i = 1; i + 1 < translates.length; i++) {
      const d = Math.hypot(translates[i][0] - translates[i - 1][0], translates[i][1] - translates[i - 1][1]);
      if (d > 0) pitch = Math.min(pitch, d);
    }
    expect(pitch).toBeGreaterThan(10);
    expect(pitch).toBeLessThan(14);
    // 链条在弹体之前(下层):首个 translate 早于本体 drawImage
    const firstTr = calls.findIndex((c) => c.m === 'translate');
    const bodyDi = calls.length - 1 - [...calls].reverse().findIndex((c) => c.m === 'drawImage');
    expect(firstTr).toBeLessThan(bodyDi);
    void ctx;
  });

  it('<25px 停距规则:近手段零链节(Main.cs :29722 num126<25f break)', () => {
    const { hooks } = makeHooks();
    const f = fire(hooks, 262);
    f.fixedUpdate(1 / 60, hooks);                // 弹心≈玩家心+14px,<25px
    const { calls, ctx } = recCtx();
    f.draw({ canvas: {}, ctx } as never, undefined as never);
    // 唯一 translate = 弹体本体(drawProj);链条 0 节
    expect(calls.filter((c) => c.m === 'translate').length).toBe(1);
    void ctx;
  });
});
