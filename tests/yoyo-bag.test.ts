// 悠悠球袋装备族全链测试（Player.cs:14174-14226 装备映射 / :12445-12504——★BJ665 勘正 伪锚 :11946-12004
// Player.Counterweight / AI_099_1 配重球 / AI_099_2 悠悠球 ai0 状态机 + 魔法线）：
//   ① equipStats 装备映射逐物品（3366/3334/3309-3314/5547/5540/5541 + 虚荣槽 + 卸下归零）
//   ② counterweightDecision 纯决策（手套二号球/配重球计数门/vanity 优先/kb 公式）
//   ③ CounterweightProj AI_099_1（环绕/收紧轨道/回收/-2 脱离坠落/鼠标反推/魔法线克隆）
//   ④ YoyoProj ai0 状态机（-1 回收/-3 魔法线幽灵/魔法线 75% 克隆/-2 脱离/寿命广播/flag 加速烧）
import { describe, it, expect, afterEach, vi } from 'vitest';
import { statOfInternal } from '../src/data/vanillaItemStats';
import { ITEM_BY_KEY } from '../src/data/items';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TileStore } from '../src/world/TileStore';
import {
  YoyoProj, CounterweightProj, counterweightDecision,
  type CounterweightCtx, type CounterweightPlayView,
} from '../src/entities/WeaponProj';
import type { GameHooks } from '../src/entities/types';

const _iid = (vid: number): number => ITEM_BY_KEY[vanillaItemKey(vid)!];
const mkPlayer = () => new Player(50 * 16, 90 * 16, new Inventory());
const equip = (p: Player, slot: number, vid: number) => { p.inv.armor[slot] = { id: _iid(vid), stack: 1 }; };
const CW_TYPES = [1079, 556, 557, 558, 559, 560, 561];

// ============================================================
// ① equipStats 装备映射（Player.cs:14174-14226 UpdateEquips if-chain）
// ============================================================
describe('悠悠球袋族装备映射（Player.cs:14174-14226）', () => {
  afterEach(() => vi.restoreAllMocks?.());

  it('无装备 → counterWeight=0 / yoyoGlove=false / magicString=false / vanityCounterWeight=0', () => {
    const p = mkPlayer();
    const s = p.equipStats;
    expect(s.counterWeight).toBe(0);
    expect(s.yoyoGlove).toBe(false);
    expect(s.magicString).toBe(false);
    expect(s.vanityCounterWeight).toBe(0);
  });

  it('3366 悠悠球袋 → yoyoBag 旗 + yoyoGlove + yoyoString（掷骰迁消费端,getter 恒 0）', () => {
    const p = mkPlayer();
    equip(p, 3, 3366);
    // 2026-08-19 equipStats 记忆化:配重球颜色掷骰迁 rollYoyoCounterweight(原版
    // ResetEffects 每帧重掷=使用期随机;getter 每访问掷会被缓存冻结成每套装备一次)
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.yoyoBag).toBe(true);
    expect(p.equipStats.yoyoGlove).toBe(true);
    expect(p.equipStats.yoyoString).toBe(true);
    expect(p.equipStats.magicString).toBe(false);
  });

  it('掷骰逐支 1:1（rollYoyoCounterweight）：Next(7)==0 → 1079；否则 556+Next(6)', async () => {
    const { rollYoyoCounterweight } = await import('../src/entities/WeaponProj');
    vi.spyOn(Math, 'random').mockReturnValue(0.1);   // Next(7)=floor(0.7)=0 → 1079
    expect(rollYoyoCounterweight()).toBe(1079);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // Next(7)=3≠0 → 556+Next(6)=556+3
    expect(rollYoyoCounterweight()).toBe(559);
  });

  it('双袋（3366+5541）→ yoyoBag 幂等置位（掷骰迁消费端后 :14824/:14848——★BJ665 勘正 伪锚 :14176/:14200 的==0 门自然消失）', () => {
    const p = mkPlayer();
    equip(p, 3, 3366);
    equip(p, 4, 5541);
    expect(p.equipStats.yoyoBag).toBe(true);
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.magicString).toBe(true);   // 5541 全套旗叠加
  });

  it('3334 悠悠球手套 → 仅 yoyoGlove（:14223-14226）', () => {
    const p = mkPlayer();
    equip(p, 3, 3334);
    expect(p.equipStats.yoyoGlove).toBe(true);
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.magicString).toBe(false);
    expect(p.equipStats.yoyoString).toBe(false);
  });

  it('3309-3314 彩色配重球 → counterWeight=556+vid-3309（:14219-14222,覆盖前后端）', () => {
    for (let v = 3309; v <= 3314; v++) {
      const p = mkPlayer();
      equip(p, 3, v);
      expect(p.equipStats.counterWeight).toBe(556 + v - 3309);
      expect(p.equipStats.yoyoGlove).toBe(false);
    }
  });

  it('5547 黑配重球 → counterWeight=1079 恒定（:14215-14218,不掷骰）', () => {
    const p = mkPlayer();
    equip(p, 3, 5547);
    expect(p.equipStats.counterWeight).toBe(1079);
    expect(p.equipStats.counterWeight).toBe(1079);
    expect(p.equipStats.yoyoGlove).toBe(false);
  });

  it('5540 魔法线 → magicString + stringColor=29,不给 yoyoString（:14195-14197——非线饰品）', () => {
    const p = mkPlayer();
    equip(p, 3, 5540);
    expect(p.equipStats.magicString).toBe(true);
    expect(p.equipStats.stringColor).toBe(29);
    expect(p.equipStats.yoyoString).toBe(false);
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.yoyoGlove).toBe(false);
  });

  it('5541 魔法悠悠球袋 → 全套旗（yoyoBag + glove + string + magicString;掷骰在消费端）', () => {
    const p = mkPlayer();
    equip(p, 3, 5541);
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.yoyoBag).toBe(true);
    expect(p.equipStats.yoyoGlove).toBe(true);
    expect(p.equipStats.yoyoString).toBe(true);
    expect(p.equipStats.magicString).toBe(true);
    expect(p.equipStats.stringColor).toBe(29);
  });

  it('虚荣槽 13-19 彩色配重球 → vanityCounterWeight（ApplyEquipVanity :13800-13803,功能位不置）', () => {
    const p = mkPlayer();
    equip(p, 13, 3310);
    expect(p.equipStats.vanityCounterWeight).toBe(557);
    expect(p.equipStats.counterWeight).toBe(0);   // 社交槽不走功能链
    equip(p, 13, 5547);
    expect(p.equipStats.vanityCounterWeight).toBe(0);   // 黑球无虚荣档（仅 3309-3314）
  });

  it('卸下 → 全部归零', () => {
    const p = mkPlayer();
    equip(p, 3, 3366);
    expect(p.equipStats.yoyoGlove).toBe(true);
    p.inv.armor[3] = null;
    expect(p.equipStats.counterWeight).toBe(0);
    expect(p.equipStats.yoyoGlove).toBe(false);
    expect(p.equipStats.yoyoString).toBe(false);
    p.inv.armor[13] = null;
    expect(p.equipStats.vanityCounterWeight).toBe(0);
  });

  it('3309-3314 可入功能/社交配饰槽（Item.cs:30233-30240 accessory=true——提取器缺口已补）', () => {
    for (const v of [3309, 3314]) {
      const inv = new Inventory();
      expect(inv.armorAccepts(3, _iid(v))).toBe(true);
      expect(inv.armorAccepts(13, _iid(v))).toBe(true);
    }
    expect(statOfInternal(_iid(3309))).toMatchObject({ acc: 1 });
  });
});

// ============================================================
// ② counterweightDecision（Player.cs:12445-12504 纯决策核——★BJ665 勘正 伪锚 :11946-12004）
// ============================================================
describe('Player.Counterweight 决策（Player.cs:12445-12504）', () => {
  const EQ = (o: Partial<{ yoyoGlove: boolean; counterWeight: number; vanityCounterWeight: number }>) => ({
    yoyoGlove: false, counterWeight: 0, vanityCounterWeight: 0, ...o,
  });
  const yoyo = (ai0: number): CounterweightPlayView => ({ isWeight: false, ai0 });
  const weight = (ai0: number): CounterweightPlayView => ({ isWeight: true, ai0 });

  it('无手套无配重 → none（:11947-11950 早退）', () => {
    expect(counterweightDecision(EQ({}), [yoyo(0)], 4)).toEqual({ kind: 'none' });
  });

  it('手套 + 一号球在场（<2）→ 掷同型二号悠悠球（:11973-11985）', () => {
    expect(counterweightDecision(EQ({ yoyoGlove: true }), [yoyo(100)], 4))
      .toEqual({ kind: 'second-yoyo' });
  });

  it('手套 + 两球在场 → 手套分支封顶;无 counterWeight → none（else-if 互斥 :11986）', () => {
    expect(counterweightDecision(EQ({ yoyoGlove: true }), [yoyo(1), yoyo(2)], 4))
      .toEqual({ kind: 'none' });
  });

  it('手套 + 两球 + counterWeight → 掷配重球（kb=(kb+6)/2,:11987;首球 ai0=0）', () => {
    expect(counterweightDecision(EQ({ yoyoGlove: true, counterWeight: 558 }), [yoyo(1), yoyo(2)], 4))
      .toEqual({ kind: 'counterweight', type: 558, kb: 5, secondary: false });
    expect(counterweightDecision(EQ({ yoyoGlove: true, counterWeight: 558 }), [yoyo(1), yoyo(2)], 6.5))
      .toEqual({ kind: 'counterweight', type: 558, kb: 6.25, secondary: false });
  });

  it('无手套 + counterWeight + 一球零配重在场 → 掷配重球;两球一配重 → ai0=1（:11995-12003）', () => {
    expect(counterweightDecision(EQ({ counterWeight: 1079 }), [yoyo(5)], 4))
      .toEqual({ kind: 'counterweight', type: 1079, kb: 5, secondary: false });
    // 一球一配重：weights(1) < yoyos(1) 不成立 → 不掷
    expect(counterweightDecision(EQ({ counterWeight: 1079 }), [yoyo(5), weight(0)], 4))
      .toEqual({ kind: 'none' });
    // 两球一配重：1 < 2 → 掷第二枚（ai0=1 副球档）
    expect(counterweightDecision(EQ({ counterWeight: 1079 }), [yoyo(5), yoyo(6), weight(0)], 4))
      .toEqual({ kind: 'counterweight', type: 1079, kb: 5, secondary: true });
  });

  it('配重球数 ≥ 悠悠球数 → 不再掷（:11983 num3 < num2 门）', () => {
    expect(counterweightDecision(EQ({ counterWeight: 556 }), [yoyo(5), weight(0), weight(1)], 4))
      .toEqual({ kind: 'none' });
    expect(counterweightDecision(EQ({ counterWeight: 556 }), [yoyo(5), yoyo(6), weight(0)], 4))
      .toEqual({ kind: 'counterweight', type: 556, kb: 5, secondary: true });
  });

  it('vanityCounterWeight 优先于 counterWeight（:11990-11994）', () => {
    expect(counterweightDecision(
      EQ({ counterWeight: 1079, vanityCounterWeight: 560 }), [yoyo(5)], 4))
      .toEqual({ kind: 'counterweight', type: 560, kb: 5, secondary: false });
  });

  it('脱离态（ai0=-2）不计入两侧计数（:11960/:11967）', () => {
    // 两球其一脱离 → 有效球数 1 → 手套分支再度触发
    expect(counterweightDecision(EQ({ yoyoGlove: true }), [yoyo(1), yoyo(-2)], 4))
      .toEqual({ kind: 'second-yoyo' });
    // 配重球脱离 → 不占配重计数
    expect(counterweightDecision(EQ({ counterWeight: 556 }), [yoyo(5), weight(-2)], 4))
      .toEqual({ kind: 'counterweight', type: 556, kb: 5, secondary: false });
  });

  it('-3 魔法线幽灵按在场悠悠球计数（ai0!=-2 即计,:11967）', () => {
    expect(counterweightDecision(EQ({ yoyoGlove: true }), [yoyo(-3), yoyo(1)], 4))
      .toEqual({ kind: 'none' });   // 两"球"在场 → 手套封顶,无 counterWeight → none
    expect(counterweightDecision(EQ({ yoyoGlove: true, counterWeight: 556 }), [yoyo(-3)], 4))
      .toEqual({ kind: 'second-yoyo' });   // 幽灵计 1 球 → 手套掷二号
  });

  it('手套在场但无球（yoyos=0）→ 手套分支占用 else-if,不掷配重（:11973-11985 num<0）', () => {
    expect(counterweightDecision(EQ({ yoyoGlove: true, counterWeight: 556 }), [weight(0)], 4))
      .toEqual({ kind: 'none' });
  });
});

// ============================================================
// ③ CounterweightProj（AI_099_1 :64472-64824）
// ============================================================
describe('配重球 AI_099_1', () => {
  const W = 200, H = 120;
  function makeWorld(wallX?: number) {
    const store = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
    if (wallX !== undefined) for (let y = 0; y < 100; y++) store.setTile(wallX, y, 1);
    return store;
  }
  function makeHooks(store: TileStore, enemies: unknown[] = []): GameHooks {
    return {
      world: { store } as never,
      player: mkPlayer() as never,
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
  }
  /** 可变上下文（channel/yoyoInPlay/鼠标位移测试中翻转） */
  function makeCtx(p: Player, over: Partial<CounterweightCtx> = {}): CounterweightCtx & {
    setChannel(v: boolean): void; setYoyo(v: boolean): void; setMouse(dx: number, dy: number): void;
  } {
    let ch = true, yy = true, mdx = 0, mdy = 0;
    const ctx: CounterweightCtx = {
      owner: () => (p.dead ? null : p),
      channel: () => ch,
      yoyoInPlay: () => yy,
      mouseDelta: () => ({ dx: mdx, dy: mdy }),
      ...over,
    };
    return Object.assign(ctx, {
      setChannel: (v: boolean) => { ch = v; },
      setYoyo: (v: boolean) => { yy = v; },
      setMouse: (dx: number, dy: number) => { mdx = dx; mdy = dy; },
    });
  }
  const run = (e: { fixedUpdate: (dt: number, g: GameHooks) => void; dead?: boolean }, g: GameHooks, n: number) => {
    for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
  };

  it('环绕：玩家存活+channel+悠悠球在场 → 存活且钳在轨道半径内（num=125,:64482）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld());
    const cw = new CounterweightProj(p.cx + 60, p.cy, 20, 3, 558, 0, makeCtx(p));
    cw.vx = 12; cw.vy = 0;
    run(cw, hooks, 240);
    expect(cw.dead).toBe(false);
    const d = Math.hypot(cw.cx - p.cx, cw.cy - p.cy);
    expect(d).toBeLessThan(125 + 16);   // 轨道半径 + 单步松弛
    expect(d).toBeGreaterThan(30);      // 未塌缩到玩家身上
  });

  it('ai0=1 副球轨道 ×0.75（:64532-64535）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld());
    const mk = (ai0: number) => {
      const c = new CounterweightProj(p.cx + 200, p.cy, 20, 3, 558, ai0, makeCtx(p));
      c.vx = 0; c.vy = 12;
      for (let i = 0; i < 60 && !c.dead; i++) c.fixedUpdate(1 / 60, hooks);   // 稳定轨道
      return c;
    };
    const c0 = mk(0), c1 = mk(1);
    const d0 = Math.hypot(c0.cx - p.cx, c0.cy - p.cy);
    const d1 = Math.hypot(c1.cx - p.cx, c1.cy - p.cy);
    expect(Math.abs(d0 - 125)).toBeLessThan(6);      // 主球钳到 125
    expect(Math.abs(d1 - 125 * 0.75)).toBeLessThan(6);   // 副球钳到 93.75
  });

  it('鼠标位移反推 ×-0.1（:64614-64642,extraUpdates=1 每 tick 两掷）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld());
    const ctx = makeCtx(p);
    ctx.setMouse(10, 0);
    const cw = new CounterweightProj(p.cx, p.cy, 20, 3, 558, 0, ctx);
    cw.vx = 12; cw.vy = 0;
    cw.fixedUpdate(1 / 60, hooks);
    expect(cw.vx).toBeCloseTo(10, 5);   // 12 - 10×0.1×2 次
  });

  it('松手（channel=false）→ ai0=-1 回收 → 飞回玩家 40px 内消亡（:64643/:64777-64824）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld());
    const ctx = makeCtx(p);
    const cw = new CounterweightProj(p.cx + 60, p.cy, 20, 3, 558, 0, ctx);
    cw.vx = 12; cw.vy = 0;
    run(cw, hooks, 10);
    ctx.setChannel(false);
    run(cw, hooks, 300);
    expect(cw.dead).toBe(true);
  });

  it('场上无悠悠球 → 回收（:64488-64500 扫描门）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld());
    const ctx = makeCtx(p);
    const cw = new CounterweightProj(p.cx + 60, p.cy, 20, 3, 558, 0, ctx);
    cw.vx = 12; cw.vy = 0;
    ctx.setYoyo(false);
    run(cw, hooks, 300);
    expect(cw.dead).toBe(true);
  });

  it('魔法线：回收（-1）→ -3 幽灵 + 掷 75% 伤/击退脱离克隆（AI_099_1 :64727-64733）', () => {
    const p = mkPlayer();
    equip(p, 3, 5540);   // magicString（equipStats 实时读）
    const hooks = makeHooks(makeWorld());
    const ctx = makeCtx(p);
    const clones: Array<{ x: number; y: number; vx: number; vy: number; dmg: number; kb: number; projId: number }> = [];
    ctx.spawnClone = (x, y, vx, vy, dmg, kb, projId) => clones.push({ x, y, vx, vy, dmg, kb, projId });
    const cw = new CounterweightProj(p.cx + 60, p.cy, 20, 4.6, 558, 0, ctx);
    cw.vx = 12; cw.vy = 0;
    run(cw, hooks, 10);
    ctx.setChannel(false);
    const preCx = cw.cx, preVx = cw.vx;   // 克隆出生位/速 = 回收移动【前】的当前值（AI 内先行）
    cw.fixedUpdate(1 / 60, hooks);
    // 同帧转 -3 + 克隆：伤/击退 (int) 截断 ×0.75
    expect(clones).toHaveLength(1);
    expect(clones[0].dmg).toBe(15);   // trunc(20×0.75)
    expect(clones[0].kb).toBe(3);     // trunc(4.6×0.75)
    expect(clones[0].projId).toBe(558);
    expect(clones[0].x).toBe(preCx);
    expect(clones[0].vx).toBeCloseTo(preVx, 5);
    expect((cw as unknown as { ai0: number }).ai0).toBe(-3);
    expect(cw.damage).toBe(0);        // -3 零伤
    expect((cw as unknown as { ghost: boolean }).ghost).toBe(true);
    run(cw, hooks, 300);
    expect(cw.dead).toBe(true);       // 幽灵照常飞回消亡
  });

  it('-2 脱离克隆：重力 0.3 坠落（extraUpdates=0 单跑）+ 落地弹跳 + 撞墙消亡（:64738/:16988-17006）', () => {
    const p = mkPlayer();
    const hooks = makeHooks(makeWorld(60));   // x=60 竖墙
    const ctx = makeCtx(p);
    const cw = new CounterweightProj(p.cx, p.cy - 8, 20, 3, 558, -2, ctx);
    cw.vx = 2;
    cw.fixedUpdate(1 / 60, hooks);
    expect(cw.vy).toBeCloseTo(0.3, 5);   // 单 AI 次
    cw.fixedUpdate(1 / 60, hooks);
    expect(cw.vy).toBeCloseTo(0.6, 5);
    // 落地（地面 y=100×16=1600）：vy>4 撞地弹起 ×-0.6 后缓落漂移,撞 x=60 墙消亡
    run(cw, hooks, 1200);
    expect(cw.dead).toBe(true);
  });

  it('环绕态撞墙：全轴反转 + 朝玩家合成（:17005-17028）', () => {
    const p = mkPlayer();
    const store = makeWorld();   // 地面 y=100
    const hooks = makeHooks(store);
    const cw = new CounterweightProj(p.cx, 100 * 16 - 60, 20, 3, 558, 0, makeCtx(p));
    cw.vx = 0; cw.vy = 12;      // 向地面飞行 → 落地碰撞 → vy 反转非零
    let bounced = false;
    for (let i = 0; i < 40 && !bounced; i++) {
      cw.fixedUpdate(1 / 60, hooks);
      if (cw.vy < 0) bounced = true;   // 反弹朝上（原逻辑撞地即 vy=0）
    }
    expect(bounced).toBe(true);
  });
});

// ============================================================
// ④ YoyoProj ai0 状态机（AI_099_2 :64826-65210 + 魔法线 :65110-65120）
// ============================================================
describe('悠悠球 ai0 状态机/魔法线', () => {
  const W = 200, H = 120;
  function makeHooks(): { hooks: GameHooks; player: Player } {
    const store = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
    const player = mkPlayer();
    const hooks: GameHooks = {
      world: { store } as never,
      player: player as never,
      enemies: () => [],
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
    return { hooks, player };
  }
  const run = (e: YoyoProj, g: GameHooks, n: number) => {
    for (let i = 0; i < n && !e.dead; i++) e.fixedUpdate(1 / 60, g);
  };

  it('松手 → ai0=-1 回收态 → 回手消亡（:65005/:65152-65177）', () => {
    const { hooks, player } = makeHooks();
    let ch = true;
    const y = new YoyoProj(player.cx, player.cy - 4, 20, 4, 547, 0, () => ch,
      () => ({ x: player.cx + 200, y: player.cy }));
    run(y, hooks, 60);
    expect((y as unknown as { ai0: number }).ai0).toBeGreaterThanOrEqual(0);
    ch = false;
    y.fixedUpdate(1 / 60, hooks);
    expect((y as unknown as { ai0: number }).ai0).toBe(-1);
    run(y, hooks, 300);
    expect(y.dead).toBe(true);
  });

  it('魔法线：松手回收 → 原球转 -3 隐身幽灵（零伤）+ 掷 75% 伤/击退 -2 脱离克隆（:65110-65120）', () => {
    const { hooks, player } = makeHooks();
    equip(player, 3, 5540);
    let ch = true;
    const y = new YoyoProj(player.cx, player.cy - 4, 40, 6, 547, 0, () => ch,
      () => ({ x: player.cx + 200, y: player.cy }));
    run(y, hooks, 60);
    ch = false;
    const clones: Array<{ dmg: number; kb: number; ai0: number }> = [];
    y.spawnClone = (x, yy, vx, vy, dmg, kb) => {
      const c = new YoyoProj(x, yy, dmg, kb, 547, 0, () => false, () => ({ x: x, y: yy }));
      c.ai0 = -2;
      clones.push({ dmg, kb, ai0: c.ai0 });
    };
    y.fixedUpdate(1 / 60, hooks);
    expect(clones).toHaveLength(1);
    expect(clones[0].dmg).toBe(30);   // trunc(40×0.75)
    expect(clones[0].kb).toBe(4);     // trunc(6×0.75)
    expect(clones[0].ai0).toBe(-2);
    expect((y as unknown as { ai0: number }).ai0).toBe(-3);
    expect(y.damage).toBe(0);
    expect((y as unknown as { ghost: boolean }).ghost).toBe(true);
    run(y, hooks, 300);
    expect(y.dead).toBe(true);   // 幽灵飞回消亡
  });

  it('无魔法线：松手只回收,不掷克隆（:65110 门）', () => {
    const { hooks, player } = makeHooks();
    let ch = true;
    const y = new YoyoProj(player.cx, player.cy - 4, 40, 6, 547, 0, () => ch,
      () => ({ x: player.cx + 200, y: player.cy }));
    run(y, hooks, 60);
    let cloneCount = 0;
    y.spawnClone = () => { cloneCount++; };
    ch = false;
    y.fixedUpdate(1 / 60, hooks);
    expect(cloneCount).toBe(0);
    expect((y as unknown as { ai0: number }).ai0).toBe(-1);
  });

  it('-2 脱离态：重力 0.3、免画线门数据位（ai0=-2）、撞墙消亡（:65118/:16988-17006）', () => {
    const store = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
    for (let y = 0; y < 100; y++) store.setTile(70, y, 1);   // 竖墙
    const player = mkPlayer();
    const hooks: GameHooks = {
      world: { store } as never, player: player as never, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    };
    const y = new YoyoProj(player.cx, 80 * 16, 20, 4, 547, 0, () => false, () => ({ x: player.cx, y: player.cy }));
    y.ai0 = -2;
    y.vx = 1;
    y.fixedUpdate(1 / 60, hooks);
    expect(y.vy).toBeCloseTo(0.3, 5);
    // 缓落漂移 → 撞 x=70 墙消亡（横撞 Kill）
    run(y, hooks, 3000);
    expect(y.dead).toBe(true);
  });

  it('寿命尽：有限寿命型号回收 + recallFamily 全量广播（:64852-64866）', () => {
    const { hooks, player } = makeHooks();
    let broadcasts = 0;
    const y = new YoyoProj(player.cx, player.cy, 20, 4, 534, 0, () => true,
      () => ({ x: player.cx, y: player.cy }));   // 534 寿命 9s
    y.recallFamily = () => { broadcasts++; };
    run(y, hooks, 600);   // 9s = 540t
    expect(broadcasts).toBeGreaterThanOrEqual(1);
    expect(y.dead).toBe(true);   // 回收到手消亡
  });

  it('flag（手套二号球）：寿命加速烧（localAI[0] += rand(10,31)×0.1,:64833-64835）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);   // 附加 (10+0.5×21)×0.1=2.05/t
    const { hooks: h1, player: p1 } = makeHooks();
    const flagged = new YoyoProj(p1.cx, p1.cy, 20, 4, 534, 0, () => true,
      () => ({ x: p1.cx, y: p1.cy }));
    flagged.secondInPlay = () => true;
    run(flagged, h1, 200);   // 无 flag 需 540t;带 flag ≈ 9×60/3.05 ≈ 177t
    expect((flagged as unknown as { ai0: number }).ai0).toBe(-1);
    const { hooks: h2, player: p2 } = makeHooks();
    const plain = new YoyoProj(p2.cx, p2.cy, 20, 4, 534, 0, () => true,
      () => ({ x: p2.cx, y: p2.cy }));
    run(plain, h2, 200);
    expect((plain as unknown as { ai0: number }).ai0).toBeGreaterThanOrEqual(0);
    vi.restoreAllMocks();
  });

  it('命中链：-2 免 Counterweight/免活跃反弹（只被弹开）;活跃态反弹 + Counterweight 调用（:12467-12508）', () => {
    const store = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
    const player = mkPlayer();
    const enemies: Array<Record<string, unknown>> = [];
    const hits: number[] = [];
    enemies.push({
      id: 1, x: 50 * 16 + 40, y: 89 * 16, w: 24, h: 40, dead: false, vx: 0, vy: 0, hp: 5000,
      hurt: (d: number) => { hits.push(d); enemies[0].hp = (enemies[0].hp as number) - d; return true; },
      def: {},
    });
    const hooks: GameHooks = {
      world: { store } as never, player: player as never, enemies: () => enemies, critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    };
    const y = new YoyoProj(50 * 16 + 30, 89 * 16, 20, 4, 547, 0, () => true,
      () => ({ x: 50 * 16 + 40, y: 89 * 16 }));
    let cwCalls = 0;
    y.counterweight = () => { cwCalls++; };
    run(y, hooks, 30);
    expect(hits.length).toBeGreaterThan(0);   // 命中过敌
    expect(cwCalls).toBe(hits.length);        // 每次命中都调 Counterweight（:13306——★BJ665 勘正 伪锚 :12482）
    // 活跃态命中被弹开：速度反向（-0.5×v + 离敌向 16）
    expect(Math.hypot(y.vx, y.vy)).toBeGreaterThan(0);

    // -2 对照：脱离态命中不调 Counterweight
    const y2 = new YoyoProj(50 * 16 + 30, 89 * 16, 20, 4, 547, 0, () => true,
      () => ({ x: 50 * 16 + 40, y: 89 * 16 }));
    y2.ai0 = -2;
    (y2 as unknown as { pierceLeft: number }).pierceLeft = 5;
    let cw2 = 0;
    y2.counterweight = () => { cw2++; };
    y2.fixedUpdate(1 / 60, hooks);
    expect(cw2).toBe(0);   // -2 免调（:12469 分支）
  });

  it('-2 穿透尽 → 消亡（penetrate=Next(3,7),:65122-65125）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);   // 穿透 3+floor(0.999×4)=6
    const store = new TileStore(W, H);
    for (let x = 0; x < W; x++) for (let y = 100; y < H; y++) store.setTile(x, y, 1);
    const player = mkPlayer();
    const enemies: Array<Record<string, unknown>> = [];
    let hurts = 0;
    // 宽敌平铺地面（脱离态命中弹开/水平漂移两个方向全覆盖——穿透计数 6 次即亡）
    enemies.push({
      id: 1, x: -2000, y: 100 * 16 - 40, w: 8000, h: 40, dead: false, vx: 0, vy: 0, hp: 5000,
      hurt: () => { hurts++; return true; },
      def: {},
    });
    const hooks: GameHooks = {
      world: { store } as never, player: player as never, enemies: () => enemies, critters: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
      onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
      notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    };
    const y = new YoyoProj(50 * 16, 80 * 16, 20, 4, 547, 0, () => false,
      () => ({ x: 50 * 16, y: 80 * 16 }));
    y.ai0 = -2;
    run(y, hooks, 600);
    expect(hurts).toBeGreaterThanOrEqual(6);
    expect(y.dead).toBe(true);   // 第 6 次命中穿透尽 → Kill
    vi.restoreAllMocks();
  });
});
