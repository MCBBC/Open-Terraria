// BJ393（2026-09-28）WeaponProj 域两件判别面。标杆 Terarria1457 逐支亲读：
//   件1 947/948 球体锚姊妹债（BJ388 件4 登记）定谳：M.cs:33161 中心锚大表确无 947/948
//       （表内链球族仅 {25,26,35,63,154,247,757}）→ :35492 通用通支锚,且 :30257 有
//       同款特例 num151=4/num152=−4（与 :30252 的 25/26/35/63/154 族同式）→
//       贴图左上=盒左上+(−4,−4)、球心=盒心+(−1,−1)px（Projectile_947.png=26×26 对
//       20×20 盒,num153=13;Main.cs 全文 947/948 仅 :30257 一处,DrawProjDirect
//       :33161→:35492 无 aiStyle15 早退支=通用尾绘可达）。本仓刀面=BJ388 件4 集合门
//       （947/948 ∉ FLAIL_CENTER_ANCHOR → 通用支）+ PROJ_DRAW_OFFSET[947/948]=[4,−4]
//       （off143=4/off144=−4,commit 066d742b 2026-08-17 入表）→ 现行绘制已=原版锚,
//       本件锁判别面防回退（变异=把 947 加回中心锚组/摘偏移表项）。
//   件2 onAccepted→vanillaGated 级联差单刀（BJ388 边界候选）定谳：Enemy.hurt 布尔
//       返真=「本拍击杀/假人」（死亡管线跑完 Enemy.ts:15033/:14184）非「受理」;
//       返假三族=①头部门拒（dead :13971/iframes :13972/dontTakeDamage :13978）=
//       原版拒;②血尽级联转换（realLifeHost 段 :14369/月总 :14377/猪鲨泡 :14383/
//       石巨人头 :14393/四塔 :14398）=原版受理;③普通未致命命中尾档 :15037（BJ388
//       二分漏掉的支配族）=原版受理。原版 proc/penetrate--/numHits++（:13875-13880/
//       :14189-14196/:14263）在免疫门 :12634-12637 后【无死亡·active 复查】,
//       flag10 锚 num41>0=伤害已实扣 → 受理面谓词=!vanillaGated。判别面：
//       血尽级联（毁灭者体节致命拍,hurt 返假形态）仍 proc/仍耗穿透/仍回收;
//       门拒（iframes 残窗）不 proc 不计数（BJ385 判别面保形,夹具补 iframes=忠实化）。
// 运行：cd game && npx vitest run tests/bj393-weaponproj-anchor-accept.test.ts
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { hitEnemies, HitCooldown, FlailProj, RainCloudProj } from '../src/entities/WeaponProj';
import { projDrawOffsetFor } from '../src/entities/WeaponProj';
import { setProjSpriteOverride } from '../src/entities/Arrow';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const PX = 50 * TILE, PY = 90 * TILE;

// ============================================================
// 件1：947/948 = :35492 通用通支锚 + :30257 特例 (−4,−4)
// ============================================================
describe('BJ393 件1: 947/948 通用通支锚（贴图左上=盒左上+(−4,−4),球心=盒心+(−1,−1)）', () => {
  type Call = { m: string; a: unknown[] };
  function makeRecCtx() {
    const calls: Call[] = [];
    const store: Record<string, unknown> = {};
    const ctx = new Proxy(store, {
      get: (t, k) => (typeof k === 'string' && k in t ? t[k] : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
      set: (_t, k, v) => { store[String(k)] = v; calls.push({ m: `set:${String(k)}`, a: [v] }); return true; },
    });
    return { calls, ctx: ctx as unknown as CanvasRenderingContext2D };
  }
  beforeAll(() => {
    // 原版贴图容量：Projectile_947/948.png=26×26（盘上实测）对 20×20 盒
    setProjSpriteOverride(947, { width: 26, height: 26 } as never);
    setProjSpriteOverride(948, { width: 26, height: 26 } as never);
  });
  afterEach(() => vi.restoreAllMocks());

  /** 通用支锚几何（M.cs:35492/:30303/:30257）：anchor=(盒左+num153+num152, 盒上+盒高/2)
   *  =（盒左+13−4, 盒上+10）=（盒左+9, 盒上+10）;origin=(num153, 盒高/2+num151)=(13,14)
   *  → 贴图左上=anchor−origin=(盒左−4, 盒上−4),球心=texTL+(13,13)=盒心+(−1,−1)px */
  function ballDraw(calls: Call[]): { tr: Call[]; di: Call } {
    const tr = calls.filter((c) => c.m === 'translate' && c.a[0] === PX + 9 && c.a[1] === PY + 10);
    const dis = calls.filter((c) => c.m === 'drawImage' && c.a.length === 5);
    return { tr, di: dis[dis.length - 1] };
  }

  it('①947:translate=(盒左+9,盒上+10)、origin=(13,14)——通用支特例锚（中心锚/盒左上锚双红）', () => {
    const { calls, ctx } = makeRecCtx();
    const f = new FlailProj(PX, PY, 10, 2, 947, () => true, () => ({ x: PX + 200, y: PY }));
    f.handX = PX + 10; f.handY = PY + 130;   // 手在球心正下（链节全在 x=PX+10,不撞锚断言）
    f.draw({ ctx, lighting: { lightAt: () => [255, 255, 255] } } as never, {} as never);
    const { tr, di } = ballDraw(calls);
    expect(tr.length).toBeGreaterThanOrEqual(1);   // 通用支锚（中心锚=PX+10 红;盒左上裸锚=PX+13 红）
    expect(di).toBeDefined();
    expect(di.a[1]).toBe(-13);                     // origin.x=num153=贴图宽/2=13
    expect(di.a[2]).toBe(-14);                     // origin.y=盒高/2+num151=10+4（中心锚=−13 红;无特例=−10 红）
    // 贴图左上 = (PX+9−13, PY+10−14) = (PX−4, PY−4) = 盒左上+(−4,−4) → 球心=(PX+9,PY+9)=盒心+(−1,−1)
  });

  it('②948 同 face（:30257 两型同支）', () => {
    const { calls, ctx } = makeRecCtx();
    const f = new FlailProj(PX, PY, 10, 2, 948, () => true, () => ({ x: PX + 200, y: PY }));
    f.handX = PX + 10; f.handY = PY + 130;
    f.draw({ ctx, lighting: { lightAt: () => [255, 255, 255] } } as never, {} as never);
    const { tr, di } = ballDraw(calls);
    expect(tr.length).toBeGreaterThanOrEqual(1);
    expect(di.a[1]).toBe(-13);
    expect(di.a[2]).toBe(-14);
  });

  it('③偏移表语义锚：projDrawOffsetFor(947/948)=[4,−4]（num151=4→盒上−4/num152=−4→盒左−4）;1058 不在表', () => {
    expect(projDrawOffsetFor(947, 0, 20)).toEqual([4, -4, 0]);
    expect(projDrawOffsetFor(948, 0, 20)).toEqual([4, -4, 0]);
    expect(projDrawOffsetFor(1058, 0, 26)).toBeNull();   // BJ388 件4 面保形
  });
});

// ============================================================
// 件2：onAccepted 受理面 = !vanillaGated（血尽级联返假仍受理;门拒静默）
// ============================================================

/** 真实 Enemy 级联形态（毁灭者族 realLife 共享池,FX44b 归属门 1:1）：
 *  体节 hp≤0 且头仍活 → 头走标准死亡管线、节自身返假（Enemy.ts:14367-14370）——
 *  伤害已实扣（lastStrikeDealt>0）=原版 StrikeNPC 照跑的受理形态 */
function makeCascadeGame() {
  const w = new World(64, 64, 7, 'bj393');
  const player = new Player(PX, PY, new Inventory());
  const hooks = {
    world: w,
    player,
    enemies: () => [],
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    onEnemyKilled: () => {},
    entities: { add: () => {}, nextId: 1, projectiles: [] as unknown[] },
    applyLifeSteal: () => 0,
    noSpawnCycleThisFrame: false,
  } as unknown as GameHooks;
  return { hooks, player };
}

describe('BJ393 件2: Enemy.hurt 级联返假=受理形态（毁灭者体节致命拍,真实 Enemy 探针）', () => {
  it('①体节致命拍:hurt 返假+lastStrikeDealt>0+头标准死亡+节自身不死（:14367 归属门）', () => {
    const { hooks } = makeCascadeGame();
    const head = Enemy.fromVanilla(134, PX, PY);          // 毁灭者头（134）
    const seg = Enemy.fromVanilla(135, PX, PY - 60);      // 体节（135）
    expect(head).not.toBeNull();
    expect(seg).not.toBeNull();
    head!.realLifeHost = head;                            // 建链块 self 指（:51859 同式,RB30b）
    seg!.realLifeHost = head!;                            // 节→头共享池（:1306 同式）
    const headHp = head!.hp;
    const r = seg!.hurt(100000, 0, 0, hooks, 0, false, 0, true);
    expect(r).toBe(false);                                // 级联返假——【受理】形态非门拒
    expect(seg!.lastStrikeDealt).toBeGreaterThan(0);      // num41>0 实扣（flag10 锚 :13712）
    expect(head!.dead).toBe(true);                        // 头经标准死亡管线（掉落/账/音全跑）
    expect(seg!.dead).toBe(false);                        // 节自身不进死亡管线（checkDead 首行早退）
    expect(head!.hp).toBeLessThan(headHp);
  });
});

/** 直呼 hitEnemies 判别面（onAccepted 判据唯一消费位=雨滴接线,此处直呼隔离噪声） */
type StealEntry = { numHits: number; isMagic?: boolean; dmg?: number };
function makeHitGame(enemies: unknown[], stealLog: StealEntry[]): GameHooks {
  const w = new World(64, 200, 7, 'bj393b');
  return {
    world: w,
    player: new Player(30 * TILE, 10 * TILE, new Inventory()),
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    onEnemyKilled: () => {},
    entities: { add: () => {}, nextId: 1 },
    applyLifeSteal: (kind: string, dmg: number, numHits: number, _x: number, _y: number, isMagic?: boolean) => {
      if (kind === 'ghost') stealLog.push({ numHits, isMagic: !!isMagic, dmg });
      return 0;
    },
  } as unknown as GameHooks;
}

describe('BJ393 件2: onAccepted 判据 !vanillaGated（直呼 hitEnemies 判别面）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('②血尽级联形态（hurt 恒返假,无 iframes=:14367 同相）:onAccepted 照跑（旧判据=击杀位恒假红）', () => {
    const stealLog: StealEntry[] = [];
    const accepted: unknown[] = [];
    const e = {
      id: 39301, x: PX, y: PY, w: 24, h: 24, dead: false, vx: 0, vy: 0,
      vanillaId: null as number | null, maxHp: 100, lastStrikeDealt: 0, iframes: 0,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - 22); return false; },   // 级联返假形态
    };
    const g = makeHitGame([e], stealLog);
    const self = { x: PX - 2, y: PY - 2, w: 20, h: 20, vx: 1, damage: 50, knockback: 0, projId: 245, critChance: 0 };
    // ★清偿刀 U2（2026-10-01）：ghostHealProc 已上收 hitEnemies 受理位单源（旧档雨滴
    //  onAccepted 内嵌式=本测当时镜像的生产接线,现撤）——回调退纯受理记账面,proc
    //  断言改由共享环单源承载（245 magic 数据面 → isMagic=true 同相）。
    hitEnemies(self, g, new HitCooldown(), 10, 1, 0, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, (ent) => {
        accepted.push(ent);
      });
    expect(accepted.length).toBe(1);                      // ★判据面:返假≠门拒 → 受理
    expect(stealLog.length).toBe(1);                      // ghostHealProc 受理位单源照 proc
    expect(stealLog[0].isMagic).toBe(true);               // 245 magic 数据面
  });

  it('③门拒形态（iframes 残窗>0）:onAccepted 静默（:12634-12637 整跳,BJ385 判别面保形）', () => {
    const stealLog: StealEntry[] = [];
    const accepted: unknown[] = [];
    const e = {
      id: 39302, x: PX, y: PY, w: 24, h: 24, dead: false, vx: 0, vy: 0,
      vanillaId: null as number | null, maxHp: 100, lastStrikeDealt: 0, iframes: 5,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - 22); return false; },
    };
    const g = makeHitGame([e], stealLog);
    const self = { x: PX - 2, y: PY - 2, w: 20, h: 20, vx: 1, damage: 50, knockback: 0, projId: 245, critChance: 0 };
    hitEnemies(self, g, new HitCooldown(), 10, 1, 0, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, (ent) => accepted.push(ent));
    expect(accepted.length).toBe(0);                      // 门拒整段静默
    expect(stealLog.length).toBe(0);
  });
});

// ---------------------------------------------------------------- 雨滴全链（接线面）
function makeDropGame(enemies: unknown[], stealLog: StealEntry[]): GameHooks {
  const w = new World(64, 200, 7, 'bj393c');
  const player = new Player(30 * TILE, 10 * TILE, new Inventory());
  // 245 跌落通道净空（x 28..32,行 20..140 开阔——BJ385 同款）
  for (let x = 28; x <= 32; x++) {
    for (let y = 20; y <= 140; y++) w.store.setTileSilent(x, y, 0, 0, 0);
  }
  return {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    onEnemyKilled: () => {},
    entities: { add: () => {}, nextId: 1 },
    applyLifeSteal: (kind: string, _dmg: number, numHits: number) => {
      if (kind === 'ghost') stealLog.push({ numHits });
      return 0;
    },
  } as unknown as GameHooks;
}

describe('BJ393 件2: 雨滴 245 血尽级联命中仍 proc/仍耗穿透/仍回收（RainCloudProj.aiDrop 全链）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('④级联形态敌（hurt 恒返假）:两跳 proc(numHits 0→1)+pveNumHits=2+穿透尽回收（旧判据=永不耗穿红）', () => {
    const stealLog: StealEntry[] = [];
    const e = {
      id: 39303, x: 30 * TILE - 8, y: 30 * TILE, w: 16, h: 800, dead: false,
      vanillaId: null as number | null, maxHp: 100, lastStrikeDealt: 0,
      hurt(d: number): boolean { this.lastStrikeDealt = Math.max(0, d - 22); return false; },   // 级联返假形态
    };
    const game = makeDropGame([e], stealLog);
    let clockMs = 2_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => clockMs);
    const drop = new RainCloudProj(30 * TILE - 2, 31 * TILE, 0, 5, 30, 0, 245);
    for (let t = 0; t < 120 && !drop.dead; t++) { clockMs += 20; drop.fixedUpdate(1 / 60, game); }
    expect(drop.dead).toBe(true);                         // 仍回收:penetrate(2) 耗尽 → Kill
    expect(stealLog.map((s) => s.numHits)).toEqual([0, 1]);  // 仍 proc:numHits 自增前值衰减（:14263）
    expect((drop as unknown as { pveNumHits: number }).pveNumHits).toBe(2);  // 仍计数
    expect((drop as unknown as { dropHits: number }).dropHits).toBe(2);      // 仍耗穿透（:14189）
  });
});
