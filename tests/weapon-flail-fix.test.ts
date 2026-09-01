// 链锤/回旋镖/悠悠球 修复批回归（2026-08-22 武器审计 ❌ 清偿）：
//   ① 链锤命中盒 = (int)(SetDefaults 宽高×scale)（Projectile.cs:10075-10076 SetDefaults 尾段）
//   ② 链锤击杀门 noItems/CCed/mapFullscreen（Projectile.cs:41053-41059）
//   ③ 回旋镖出程 direction=sign(vx)（Projectile.cs:15674-15682 AutomaticallyChangesDirection
//     ——撞墙反弹自旋反向;返回段冻结）
//   ④ melee 投掷初速 shootSpeed/meleeSpeed（Player.cs:46430-46434）+
//     悠悠球出生 16/meleeSpeed 朝光标（:46642-46680 → :48637 NewProjectile）
//   ⑤ 悠悠球玩家级共享免疫门（DefaultToYoyo 无 usesLocalNPCImmunity :10155-10161
//     → Damage_PVE 走 npc.immune[owner] 全局档 :11905）
//   ⑥ 链锤尘 25/154/757（AI_015_Flails_Dust :41740-41812）
// 手法：原型直调（最小 mock GameHooks 跑 fixedUpdate）+ 记录型 spawnDust/mapFullscreen。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Boomerang, FlailProj, YoyoProj, meleeThrowSpeed } from '../src/entities/WeaponProj';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

interface DustRec {
  type: number; x: number; y: number; w: number; h: number;
  alpha: number; scale: number; vx: number; vy: number;
  noGravity: boolean; fadeIn: number;
}

function makeHooks(opts: { mapOpen?: boolean } = {}) {
  const store = new TileStore(200, 120);   // 全空气（无地形碰撞干扰）
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  const enemies: Array<Record<string, unknown>> = [];
  const dusts: DustRec[] = [];
  let mapOpen = !!opts.mapOpen;
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
    mapFullscreen: () => mapOpen,
    spawnDust: (x, y, w, h, type, sx, sy, alpha, _c, scale) => {
      const d: DustRec = {
        type, x, y, w, h, alpha: alpha ?? 0, scale: scale ?? 1,
        vx: sx ?? 0, vy: sy ?? 0, noGravity: false, fadeIn: 0,
      };
      dusts.push(d);
      return d as never;
    },
  };
  return { hooks, player, enemies, dusts, setMap: (v: boolean) => { mapOpen = v; } };
}

const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number) => {
  for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
};

// ============================================================
// ① 链锤命中盒 = (int)(宽高×scale)（Projectile.cs:10075-10076）
// ============================================================
describe('链锤命中盒 scale 消费（Projectile.cs:10075-10076）', () => {
  const mk = (projId: number) =>
    new FlailProj(100, 100, 20, 4, projId, () => false, () => ({ x: 200, y: 100 }));

  it('25 scale 0.9 → 19×19（trunc(22×0.9),曾取裸 22）', () => {
    const f = mk(25);
    expect(f.w).toBe(19);
    expect(f.h).toBe(19);
  });

  it('26/35/154 scale 0.8 → 17×17', () => {
    for (const id of [26, 35, 154]) {
      const f = mk(id);
      expect(f.w, `proj ${id}`).toBe(17);
      expect(f.h, `proj ${id}`).toBe(17);
    }
  });

  it('无 scale 型号保持 SetDefaults 原宽（63=22 / 947=20 / 247=34 / 1058=26）', () => {
    expect(mk(63).w).toBe(22);
    expect(mk(947).w).toBe(20);
    expect(mk(247).w).toBe(34);
    expect(mk(1058).w).toBe(26);
  });
});

// ============================================================
// ② 链锤击杀门（Projectile.cs:41053-41059）
// ============================================================
describe('链锤击杀门 noItems/CCed/mapFullscreen（Projectile.cs:41053-41059）', () => {
  const mkFlail = (hooks: GameHooks) =>
    new FlailProj(hooks.player.cx, hooks.player.cy, 20, 4, 25,
      () => true, () => ({ x: hooks.player.cx + 100, y: hooks.player.cy }));

  it('无门（存活+按住）→ 旋转态不消失', () => {
    const { hooks } = makeHooks();
    const f = mkFlail(hooks);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(false);
    expect(f.aiState).toBe(0);
  });

  it('player.dead → Kill', () => {
    const { hooks, player } = makeHooks();
    player.dead = true;
    const f = mkFlail(hooks);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(true);
  });

  it('冰冻（CCed 三件套）→ Kill', () => {
    const { hooks, player } = makeHooks();
    player.buffs.apply(BuffType.Frozen, 2);
    const f = mkFlail(hooks);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(true);
  });

  it('石化（CCed 三件套）→ Kill', () => {
    const { hooks, player } = makeHooks();
    player.buffs.apply(BuffType.Stoned, 2);
    const f = mkFlail(hooks);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(true);
  });

  it('诅咒（noItems :11326-11330）→ Kill', () => {
    const { hooks, player } = makeHooks();
    player.buffs.apply(BuffType.Cursed, 2);
    const f = mkFlail(hooks);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(true);
  });

  it('全屏地图打开 → Kill（:41057-41059）;关图不再误杀', () => {
    const { hooks, setMap } = makeHooks();
    const f = mkFlail(hooks);
    setMap(true);
    f.fixedUpdate(1 / 60, hooks);
    expect(f.dead).toBe(true);
    const f2 = mkFlail(hooks);
    setMap(false);
    f2.fixedUpdate(1 / 60, hooks);
    expect(f2.dead).toBe(false);
  });
});

// ============================================================
// ③ 回旋镖 direction=sign(vx)（Projectile.cs:15674-15682）
// ============================================================
describe('回旋镖自旋方向（Projectile.cs:15674-15682 AutomaticallyChangesDirection）', () => {
  it('出程每 tick 跟随 vx 符号——撞墙反弹（速度反向）后自旋反向', () => {
    const { hooks } = makeHooks();
    const b = new Boomerang(1000, 1000, 10, 0, 15, 4, 6, 1);   // 6 木回旋镖向右
    b.fixedUpdate(1 / 60, hooks);
    expect(b['dir']).toBe(1);
    b.vx = -6;                                                 // 模拟反弹（lastVelocity 取反）
    b.fixedUpdate(1 / 60, hooks);
    expect(b['dir']).toBe(-1);
  });

  it('返回段（ai[0]==1）direction 冻结——不被 sign(vx) 覆写', () => {
    const { hooks } = makeHooks();
    const b = new Boomerang(1000, 1000, 10, 0, 15, 4, 6, 1);
    run(b, hooks, 32);                                          // ai[1]≥30 → 回收
    expect(b.ai0).toBe(1);
    b['dir'] = -1;
    run(b, hooks, 6);
    expect(b['dir']).toBe(-1);
  });
});

// ============================================================
// ④ melee 投掷初速（Player.cs:46430-46434 / :46642-46680）
// ============================================================
describe('melee 投掷初速 shootSpeed/meleeSpeed（Player.cs:46430-46434）', () => {
  it('meleeThrowSpeed = shootSpeed×attackSpeedMult（attackSpeedMult=1/meleeSpeed）', () => {
    expect(meleeThrowSpeed(16, 1)).toBe(16);
    expect(meleeThrowSpeed(16, 0.8)).toBeCloseTo(12.8);   // meleeSpeed 1.25 → 12.8
    expect(meleeThrowSpeed(9, 0.5)).toBeCloseTo(4.5);
    expect(meleeThrowSpeed(16, 0)).toBe(16);              // 缺省基 1（|| 1 门）
  });

  it('悠悠球出生初速 = 16/meleeSpeed 朝光标（:46642-46680 归一×speed → :48637）', () => {
    const ch = () => false;
    const right = new YoyoProj(100, 100, 10, 2, 541, 0, ch, () => ({ x: 1100, y: 100 }), 16);
    expect(right.vx).toBeCloseTo(16, 1);
    expect(Math.abs(right.vy)).toBeLessThan(0.2);
    const up = new YoyoProj(100, 100, 10, 2, 541, 0, ch, () => ({ x: 100, y: -900 }), 12.8);
    expect(up.vy).toBeLessThan(-12.5);
    expect(Math.abs(up.vx)).toBeLessThan(0.5);
  });

  it('克隆/手套二号球生成点（initSpeed 缺省 0）不注入初速——自带速度不被覆写', () => {
    const y = new YoyoProj(100, 100, 10, 2, 541, 0, () => false, () => ({ x: 1100, y: 100 }));
    expect(y.vx).toBe(0);
    expect(y.vy).toBe(0);
  });
});

// ============================================================
// ⑤ 悠悠球玩家级共享免疫（Projectile.cs:10155-10161 / :11905）
// ============================================================
describe('悠悠球玩家级共享免疫门（DefaultToYoyo 无 usesLocalNPCImmunity）', () => {
  const mkEnemy = (id: number, iframes: number) => ({
    id, x: 100, y: 100, w: 24, h: 24, cx: 112, cy: 112, dead: false, iframes, hurtCalls: 0,
    hurt(this: { hurtCalls: number; iframes: number }) {
      this.hurtCalls++;
      this.iframes = 10;              // Enemy.hurt :11554 通用档 10t（immune[owner] 镜像）
      return false;
    },
  });
  const mkYoyo = (hooks: GameHooks) =>
    new YoyoProj(104, 104, 10, 2, 541, 0, () => true, () => ({ x: 112, y: 112 }));

  it('敌方 iframes>0（同玩家任意弹已命中）→ 不结算不触发 hurt', () => {
    const { hooks } = makeHooks();
    const e = mkEnemy(1, 5);
    hooks.enemies = () => [e] as never;
    const y = mkYoyo(hooks);
    run(y, hooks, 6);
    expect(e.hurtCalls).toBe(0);
    expect(y.dead).toBe(false);
  });

  it('iframes==0 → 正常命中（hurt 落地置 10t）', () => {
    const { hooks } = makeHooks();
    const e = mkEnemy(1, 0);
    hooks.enemies = () => [e] as never;
    const y = mkYoyo(hooks);
    y.fixedUpdate(1 / 60, hooks);
    expect(e.hurtCalls).toBe(1);
  });
});

// ============================================================
// ⑥ 链锤尘（AI_015_Flails_Dust Projectile.cs:41740-41812）
// ============================================================
describe('链锤尘 25/154/757（AI_015_Flails_Dust :41740-41812）', () => {
  it('25 掷出态（doFastThrowDust）→ 尘 14 每 tick（Next(1)==0）', () => {
    const { hooks, player, dusts } = makeHooks();
    const target = { x: player.cx + 300, y: player.cy };
    const f = new FlailProj(player.cx, player.cy, 20, 4, 25, () => false, () => target);
    f.fixedUpdate(1 / 60, hooks);          // 首 tick：松手 → 掷出（fastThrow 次 tick 生效）
    const n0 = dusts.length;
    f.fixedUpdate(1 / 60, hooks);          // 掷出态 tick → 必出尘
    expect(dusts.length).toBeGreaterThan(n0);
    expect(dusts[dusts.length - 1]?.type).toBe(14);
  });

  it('154 → 尘 115 noGravity（1/15 率,120t 必现）', () => {
    const { hooks, player, dusts } = makeHooks();
    const f = new FlailProj(player.cx, player.cy, 20, 4, 154, () => true,
      () => ({ x: player.cx + 100, y: player.cy }));
    run(f, hooks, 120);                    // 旋转态 1/15 率
    expect(dusts.some((d) => d.type === 115 && d.noGravity)).toBe(true);
  });

  it('757 → 尘 5（弹体段 + 链上 lerp 段）', () => {
    const { hooks, player, dusts } = makeHooks();
    const target = { x: player.cx + 300, y: player.cy };
    const f = new FlailProj(player.cx, player.cy, 20, 4, 757, () => false, () => target);
    run(f, hooks, 30);                     // 掷出+回拉段均出尘
    expect(dusts.some((d) => d.type === 5)).toBe(true);
    const seg = dusts.filter((d) => d.type === 5);
    expect(seg.some((d) => d.scale > 1.2)).toBe(true);   // lerp 段 scale 1.3（弹体段 0.8）
  });
});
