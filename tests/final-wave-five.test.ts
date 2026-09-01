// 终清波·五小件残留近似 1:1 清偿回归（docs/audit/approx-registry-2026-08-31.md 收尾批）
// 覆盖面：
//   ① MinionProj.findTargetInRangeDual —— Minion_FindTargetInRange 双距择近真值
//      （1458 Projectile.cs:49884-49921 + IsInRangeOfMeOrMyOwner :52406-52424）
//   ② AI_067/AI_026 跳梯探测形统一：前墙列扫行界复核 + 蜘蛛 AI_026 单柱原文形
//      （底行单列支承闸补齐 + 中腰行基准）
//   ③ 俾格米射击门 +40×slot（AI_026 flag10 段 num139<800+num134 曼哈顿+CanHit 面）
//   ④ 圣坦 930 爆散视觉锚收缩盒（cx±11）+ d31×1.4/d6 双档 + gore 两轮四对角
//      （Kill_Bombs case133-930 :79837-79885,GorePiece 通道转正）
//   ⑤ 月总水蛭 d229 双环 customData=this 随行（NPC.cs:37102-37116,followEnt 承载）
//      + VanillaDust followEnt/attractTo 两档 mechanics（幻影之门 Vector2 吸向）
//   ⑥ PetFollower 彩蛋：764 alpha 三角脉冲 / 1050 斧仙树干扫描锚定与掉落 /
//      1090 归位飞行 ShimmerBlock 编排粒子
import { describe, it, expect } from 'vitest';
import { MinionProj } from '../src/entities/MinionProj';
import { PetFollower } from '../src/entities/PetFollower';
import { SantankShellProj } from '../src/entities/Mounts';
import { moonLeechAI } from '../src/entities/bossAI_lunar_misc';
import { VanillaDust } from '../src/fx/VanillaDust';
import { resetGorePool, liveGorePieces } from '../src/entities/GorePiece';
import { VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { TileStore } from '../src/world/TileStore';
import { TILE_DEFS } from '../src/data/tiles';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import type { GameHooks } from '../src/entities/types';

const W = 220, H = 140;
function makeStore(): TileStore {
  const store = new TileStore(W, H);
  for (let x = 0; x < W; x++) for (let y = 112; y < H; y++) store.setTile(x, y, 1);
  return store;
}

interface DustRec {
  x: number; y: number; w: number; h: number; id: number;
  spX: number; spY: number; scale: number; perfect: boolean;
  obj: Record<string, unknown>;
}
function makeHooks(enemies: unknown[] = [], playerAt?: [number, number]) {
  const store = makeStore();
  const player = new Player(playerAt?.[0] ?? 60 * 16, playerAt?.[1] ?? 100 * 16 - 42, new Inventory());
  const dusts: DustRec[] = [];
  const parts: Array<{ opts?: { size?: number }; color: string }> = [];
  const drops: Array<{ key: string; count: number; x: number; y: number }> = [];
  const sfx: string[] = [];
  const projectiles: unknown[] = [];
  const hooks = {
    world: { store, flags: { hardMode: false }, groundLevel: 120 },
    player,
    enemies: () => enemies as never[],
    critters: () => [],
    spawnDrop: ((_x: number, _y: number, key: string, count: number) => {
      drops.push({ key, count, x: _x, y: _y });
      return null;
    }) as never,
    spawnParticles: ((x: number, _y: number, color: string, _n: number,
      _s: number, opts?: { size?: number }) => {
      void x; parts.push({ opts, color });
    }) as never,
    playSfxFiles: ((t: unknown) => { sfx.push(String(Array.isArray(t) ? t[0] : t)); }) as never,
    playSfxFile: ((f: string) => { sfx.push(f); return true; }) as never,
    notifyInventoryChanged: () => {},
    showPickupLabel: () => {},
    addLightAt: (() => undefined) as never,
    broadcastParticleOrchestra: () => {},
    spawnDust: ((x: number, y: number, w: number, h: number, id: number,
      spX = 0, spY = 0, _a = 0, _c: unknown = null, scale = 1,
      _noGravity = false, perfect = false) => {
      // NewDust 引擎基速含盒抖动——mock 以确定基值 (2,2) 承载，乘区面可精确断言
      const obj: Record<string, unknown> = { vx: spX || 2, vy: spY || 2, noGravity: _noGravity,
        followEnt: null as null | (() => unknown), scale };
      const rec: DustRec = { x, y, w, h, id, spX, spY, scale, perfect, obj };
      dusts.push(rec);
      return obj;
    }) as never,
  };
  const game = hooks as unknown as GameHooks;
  Object.assign(game, {
    entities: { add: (e: unknown) => { projectiles.push(e); }, projectiles },
  });
  return { hooks: game, store, player, dusts, parts, drops, sfx, projectiles };
}
const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

function mkEnemyStub(id: number, cx: number, cy: number, extra: Record<string, unknown> = {}) {
  const w = 16, h = 24;
  return {
    id, x: cx - w / 2, y: cy - h / 2, w, h,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    dead: false, ...extra,
  };
}

describe('① findTargetInRangeDual 双距择近（IsInRangeOfMeOrMyOwner 真值）', () => {
  it('我侧失视但主侧 CanHitWithMeleeWeapon 可达 → 仍入选（playerDistance ≤800）', () => {
    // 随从在玩家右 500；敌在玩家右侧 700 → 我侧 1200≥maxDistance 不作废;
    // 主侧 700≤800 且空场视线通 → 入选（旧单距口径此处必落空）
    const e = mkEnemyStub(1, Math.floor(60 * 16) + 700, 100 * 16 - 60);
    const env = makeHooks([e], [60 * 16, 100 * 16]);
    const m = new MinionProj(60 * 16 + 500, 100 * 16 - 60, 758, 10, 20, false, 0, false,
      () => env.player);
    const tgt = priv(m).findTargetInRangeDual(env.hooks, 800);
    expect(tgt).not.toBeNull();
    expect((tgt as unknown as { id: number }).id).toBe(1);
  });

  it('两侧皆不可伤（双墙分断我侧/主侧视线）→ 不入选', () => {
    const env = makeHooks([], [60 * 16, 100 * 16]);
    // 玩家(960)/随从(1460)/敌(1660)：墙列 80 断主侧、96 断我侧——两侧四试全堵
    for (const wc of [80, 96]) for (let y = 88; y <= 112; y++) env.store.setTile(wc, y, 1);
    const e = mkEnemyStub(1, Math.floor(60 * 16) + 700, 100 * 16 - 60);
    env.hooks.enemies = (() => [e]) as never;
    const m = new MinionProj(60 * 16 + 500, 100 * 16 - 60, 758, 10, 20, false, 0, false,
      () => env.player);
    expect(priv(m).findTargetInRangeDual(env.hooks, 800)).toBeNull();
  });
});

describe('② 跳梯探测形统一', () => {
  it('猫族前墙列扫行界自 :51438-51457 复核——h/16 截断外一行不计入探测带', () => {
    const env = makeHooks([]);
    const m = new MinionProj(200, 100 * 16, 1093, 10, 20, false, 0, false, () => env.player);
    m.facing = 1;
    const st = env.store;
    const top = Math.floor(m.y / 16);            // 盒顶行
    const colAhead = Math.floor(m.cx / 16) + 1;  // 中柱 + intent
    st.setTile(colAhead, top + 2, 1);            // floor(h/16)+1 行带之外
    expect(priv(m).ai67FrontWallScan(st, 1)).toBe(false);
    st.setTile(colAhead, top + 1, 1);            // 带内末行
    expect(priv(m).ai67FrontWallScan(st, 1)).toBe(true);
    expect(priv(m).ai67JumpFlags(st, m.cx + 80, m.cy)).toBe(true);   // |Δ|≥64 → flag21 过
  });

  it('蜘蛛 AI_026 单柱支承闸：底行无支承不进梯档；有支承按中腰基准五档首档', () => {
    const env = makeHooks([]);
    const m = new MinionProj(300, 110 * 16 - 16, 390, 10, 20, false, 0, false, () => env.player);
    const st = env.store;
    m.vy = 0;
    const colC = Math.floor((m.x + m.w / 2) / 16);
    for (let y = 108; y <= 116; y++) st.setTile(colC, y, 0);   // 挖空支承与脚下
    priv(m).walkerJumpLadder(st, 1);
    expect(m.vy).toBe(0);                                      // 支承闸拦下 → 不动梯档
    st.setTile(colC, 110, 1);                                  // 恢复单列支承（底行=110）
    priv(m).walkerJumpLadder(st, 1);
    expect(m.vy).toBe(-5.1);                                   // 中腰基准顶双格净空
  });
});

describe('③ 俾格米射击门（曼哈顿 + 40×slot + CanHit）', () => {
  function scene(slotMul: 0 | 2): { game: GameHooks; m: MinionProj; shots: unknown[]; pin(): void } {
    const env = makeHooks([], [60 * 16, 100 * 16]);
    const m = new MinionProj(60 * 16, 100 * 16 - 42, 191, 10, 20, false, slotMul, false,
      () => env.player);
    // 以钉住后的本体中心为基：Δ=(450,380) → 曼哈顿 830（欧氏 ~590——两口径分野）
    const e = mkEnemyStub(1, 0, 0);
    env.hooks.enemies = (() => [e]) as never;
    const mx = 60 * 16, my = (100 * 16 - 42);
    e.cx = mx + 450;
    e.cy = my + 380;
    const EX = e.x, EY = e.y;
    function pin(): void {           // 每拍起点回钉——飞行 homing 关死，专测射击门
      m.x = mx - m.w / 2; m.y = my - m.h / 2; m.vx = 0; m.vy = 0;
      e.x = EX; e.y = EY;
    }
    pin();
    return { game: env.hooks, m, shots: env.projectiles, pin };
  }
  it('slot0：曼哈顿 830 > 800 → 不出手（欧氏旧口径会错出手）', () => {
    const s0 = scene(0);
    for (let k = 0; k < 40; k++) { s0.pin(); priv(s0.m).shootCd = 0; s0.m.fixedUpdate(1, s0.game); }
    expect(s0.shots.length).toBe(0);
  });
  it('slot2：800+80=880 ≥ 830 → 出手且弹型为掷矛 195', () => {
    const s2 = scene(2);
    for (let k = 0; k < 40; k++) { s2.pin(); priv(s2.m).shootCd = 0; s2.m.fixedUpdate(1, s2.game); }
    expect(s2.shots.length).toBeGreaterThan(0);
    expect((s2.shots[0] as unknown as { projId: number }).projId).toBe(195);
  });
});

describe('④ 圣坦 930 爆散视觉（22×22 弹心锚 + d31×1.4 + gore 两轮四对角）', () => {
  it('dust 锚=cx±11;烟量/速度系数/gore 61-63 ×8 全对表', () => {
    resetGorePool();
    const env = makeHooks([], [4000, 1500]);
    const shell = new SantankShellProj(400, 400, 0, -4, 120, 0, 930);
    priv(shell).explode(env.hooks);
    const smoke = env.dusts.filter((d) => d.id === 31);
    const big = env.dusts.filter((d) => d.id === 6 && d.scale === 3.5);
    const small = env.dusts.filter((d) => d.id === 6 && d.scale === 1.5);
    expect(smoke.length).toBe(30);
    expect(big.length).toBe(20);
    expect(small.length).toBe(20);
    expect(big.every((d) => d.obj.noGravity === true)).toBe(true);
    expect(smoke.every((d) => d.obj.vx === 2.8)).toBe(true);     // d31×1.4 于 mock 基值 2
    expect(big.every((d) => d.obj.vx === 14)).toBe(true);        // 大烟 ×7 于基值 2
    expect(small.every((d) => d.obj.vy === 6)).toBe(true);       // 小烟 ×3 于基值 2
    expect(big.every((d) => Math.abs(d.x - (shell.cx - 11)) < 1e-9)).toBe(true);
    expect(small.every((d) => Math.abs(d.y - (shell.cy - 11)) < 1e-9)).toBe(true);
    const g = liveGorePieces();
    expect(g.length).toBe(8);
    for (const gp of g) expect([61, 62, 63]).toContain(gp.goreId);
    resetGorePool();
  });
});

describe('⑤ 月总水蛭 d229 双环 + followEnt/attractTo mechanics', () => {
  function leechScene() {
    const head = mkEnemyStub(9, 60 * 16 + 600, 70 * 16,
      { vanillaId: 396, ai3: 3, maxHp: 50000, hp: 50000 });
    const env = makeHooks([head], [60 * 16, 100 * 16]);
    const w = 32, h = 32;
    const bx = 60 * 16 - 160;
    const leech: Record<string, any> = {
      id: 99, x: bx - w / 2, y: 0 - h / 2, w, h, vx: 0, vy: 0, ai0: 10, ai1: 0,
      ai2: 0, bInit: false, dead: false, vanillaId: 401,
      get cx() { return this.x + this.w / 2; },
      set cx(v: number) { this.x = v - this.w / 2; },
      get cy() { return this.y + this.h / 2; },
      set cy(v: number) { this.y = v - this.h / 2; },
    };
    return { env, head, leech };
  }

  it('每拍外环6+内环3 全 229/perfect 定位/scale .7·1.5/noGravity/followEnt 在位', () => {
    const s = leechScene();
    for (let t = 0; t < 3; t++) moonLeechAI(s.leech as never, s.env.hooks as never, null);
    expect(s.env.dusts.length).toBe(27);
    expect(s.env.dusts.every((d) => d.id === 229 && d.perfect)).toBe(true);
    const inner = s.env.dusts.filter((d) => d.obj.scale === 1.5);
    const outer = s.env.dusts.filter((d) => d.obj.scale === 0.7);
    expect(inner.length).toBe(9);
    expect(outer.length).toBe(18);
    expect(inner.every((d) => typeof d.obj.followEnt === 'function')).toBe(true);
  });

  it('followEnt：position += 位移差（customData=NPC 面,:896-901）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(100, 100, 0, 0, 229, 0, -1, 0, null, 0.7, { perfect: true })!;
    d.followEnt = () => ({ dx: 2.5, dy: 3.5 });
    const px = d.x, py = d.y;
    vd.update(0, 0, 1920, 1200, 0, 0, null, null, null);
    expect(d.x).toBeCloseTo(px + 2.5, 9);
    expect(d.y).toBeCloseTo(py - 1 + 3.5, 9);
  });

  it('attractTo：速度折向锚点（吸向支生效,:906-912）', () => {
    const vd = new VanillaDust();
    const d = vd.spawn(0, 0, 0, 0, 229, 4, 0, 0, null, 1, { perfect: true })!;
    d.attractTo = { x: d.x, y: d.y - 100 };                 // 正上方
    vd.update(0, 0, 1920, 1200, 0, 0, null, null, null);
    // 链内另有通用阻尼/老化扰动——方向折转与模长收束为判别面（<3.2+未落基准即吸向）
    expect(d.vy).toBeLessThan(0);                            // 已出现向上分量
    expect(Math.hypot(d.vx, d.vy)).toBeGreaterThan(0);
    expect(d.vx).toBeLessThan(4 + 1e-9);                     // 无爆冲
  });
});

describe('⑥ PetFollower 彩蛋', () => {
  interface OwnerLike { x: number; y: number; w: number; h: number; cx: number; cy: number;
    facing: number; dead: boolean; vx: number; vy: number }
  function owner(): OwnerLike {
    return { x: 0, y: 0, w: 40, h: 76, cx: 100, cy: 38, facing: 1, dead: false, vx: 0, vy: 0 };
  }
  /** forest trunk 内部格 id（vanilla.sheet===5 的首个 def 下标） */
  const TRUNK_ID = ((): number => {
    for (const [k, td] of Object.entries(TILE_DEFS)) {
      const def = td as unknown as { vanilla?: { sheet?: number } } | undefined;
      if (def?.vanilla?.sheet === 5) return Number(k);
    }
    return -1;
  })();

  it('764 UpbeatStar：alpha 三角脉冲域 [0.4,0.75]、相位推进且无越冲', () => {
    const env = makeHooks([]);
    const o = owner();
    const pf = new PetFollower(o.cx, o.cy - 40, 764, () => ({ ...o }));
    let seenMin = 9, seenMax = 0;
    for (let i = 0; i < 130; i++) {
      pf.fixedUpdate(1 / 60, env.hooks);
      const op = priv(pf).starOpacity as number;
      seenMin = Math.min(seenMin, op);
      seenMax = Math.max(seenMax, op);
    }
    expect(seenMin).toBeGreaterThanOrEqual(0.4 - 1e-9);
    expect(seenMax).toBeLessThanOrEqual(0.75 + 1e-9);
    expect(seenMax).toBeGreaterThan(0.7);                     // 相位确已推进过近峰值域
  });

  it('1050 斧仙：树干侧扫命中即锚定树格近侧 30px;掉木材不毁树', () => {
    const env = makeHooks([], [60 * 16, 100 * 16]);
    const st = env.store;
    expect(TRUNK_ID).toBeGreaterThan(0);
    const petX = 68 * 16, petY = 109 * 16;
    const o = owner(); o.cx = 64 * 16; o.cy = 98 * 16;
    const pf = new PetFollower(petX, petY, 1050, () => ({ ...o }));
    st.setTile(Math.floor(petX / 16) + 1, Math.floor(petY / 16), TRUNK_ID);
    priv(pf).axeCd = 0;
    pf.fixedUpdate(1 / 60, env.hooks);
    expect(priv(pf)._axeTargetX)
      .toBe((Math.floor(petX / 16) + 1) * 16 + 8 - o.facing * 30);
    expect(priv(pf)._axeTargetY).toBe(Math.floor(petY / 16) * 16 + 8);
    // 蓄量压满 + 钉帧 8 → 直呼 KillTile_DropItems 等价口（掉木材、树仍立）
    (VANILLA_ITEM_KEY_BY_ID as Record<number, string>)[9] = '__wood_test__';
    priv(pf).dropFairyWood(env.hooks, Math.floor(petX / 16) + 1, Math.floor(petY / 16));
    expect(env.drops[0]?.key).toBe('__wood_test__');
    expect(st.get(Math.floor(petX / 16) + 1, Math.floor(petY / 16))).toBe(TRUNK_ID); // 不毁树
  });

  it('dropFairyWood 缺省基座 → 木材 vid 9 反查键掉落', () => {
    const env = makeHooks([], [0, 0]);
    (VANILLA_ITEM_KEY_BY_ID as Record<number, string>)[9] = '__wood_test__';
    const o = owner();
    const pf = new PetFollower(200, 200, 1050, () => o);
    priv(pf).dropFairyWood(env.hooks, 30, 30);                 // 无地形 ⇒ 下探越界 → 缺省 9
    expect(env.drops[0]?.key).toBe('__wood_test__');
    expect(env.drops[0]?.count === 1 || env.drops[0]?.count === 2).toBe(true);
  });

  it('1090 彩虹巨石宠：归位飞行拍 ShimmerBlock 微光粒（uniqueInfo500→size0.6）', () => {
    const env = makeHooks([]);
    const o = owner(); o.cx = 0; o.cy = 0;
    const pf = new PetFollower(-400, -260, 1090, () => ({ ...o }));
    priv(pf).flying = true;
    for (let i = 0; i < 10; i++) pf.fixedUpdate(1 / 60, env.hooks);
    const shimmer = env.parts.filter((p) => p.opts?.size === 0.6);
    expect(shimmer.length).toBeGreaterThan(0);
    expect(shimmer.length).toBeLessThanOrEqual(5);
  });
});
