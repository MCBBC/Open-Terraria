// ★BJ582（2026-10-09）：藤壶法杖（DeadCellsBarnacleSummonItem 5463 → 哨站弹 1025 /
//   毒弹 1026）两面判别（用户实报+截图：①攻击距离只有这么一点 ②原版贴图还有三个气球）。
//  定谳（Terarria1457 亲读,行号为 1457 盘上值）：
//  · 物品 5463 = Item.cs:43098-43110（shoot 1025/damage 33/kb 7.5/summon+sentry/
//    useAnimation=useTime=30/shootSpeed 14/rarity LightRed4）。
//  · 弹 1025 = Projectile.cs:9709-9716（42×38/aiStyle 197/timeLeft 36000/sentry）;
//    弹 1026 = :9719-9725（14×14/aiStyle 28/friendly/extraUpdates 2）。
//  · 索敌 = AI_197_CeilingAndHoverTurret :41146-41179：muzzle=Center+(0,10)
//    （:41164-41168）/num8=1000+num3×16=1000+15×16=1240（:41150-41154,flag=1025 档）/
//    AI_053_HandleSentryNPCTargeting（:40920-40966）曼哈顿 |dx|+|dy| < maxDistance
//    【严格小于】/CanHit 点对（:40958,非 CanHitLine）/出弹 num5=1026 速 num7=12
//    （:41052-41179）、冷却 num4=50。
//  · ①距离实害根因 = 旧 Arrow 1026 支误套 aiStyle 30 else 支衰减（Projectile.cs
//    :27149-27158 `velocity*=0.8; alpha+=4; ≥255 Kill`——907 光球族消隐语义）:
//    64 子步≈60px 射程。1457 AI_028 全支（:26918-27045）亲读【零 velocity/alpha 写位】
//    ——恒速 12/子步（EU2=3 子步/拍=36px/拍）直飞至命中/撞块/timeLeft 3600 尽。
//  · ②三气球 = Main.cs:34959-34999 1025 专绘：悬浮态（ai[0]==0）绘 NPC_594
//    （WindyBalloon,Frame(8,1,·)=8 列×32×76）列 2/5/7（:34972 `1+switch{1→4,0→1,_→6}`）、
//    锚=盒心+(0,−10+bob)（:34967-34968）、origin=气球底心(16,76)（:34974,num151=22
//    :30097 → (w/2,h)）、摆角 +π/9/0/−π/9（:34976-34978）+摆动 ±0.025rad
//    （num484=misc%75/75;中球 sin/侧球 cos :34979-34983）;bob=sin(misc%100/100·2π)·2
//    （num483 :34962-34967）气球/本体同受（本体位 Y+num483 :34996）。本体 origin=
//    (num153=23 :30303, h/2+22)=帧左上(盒左,盒顶−22+bob)。
//  · 帧面 = Main.cs:8854-8855 projFrames[1025]=4/[1026]=4;贴图 Projectile_1025.png
//    46×248（4×62 竖条,md5 与原版资产全等）、NPC_594.png 256×76、Projectile_1026.png
//    30×72（4×18）。
//  ★变异证红：各断言注释给出「旧实现退化值」,变异该刀必恰红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import { Arrow, PROJ_ROT_RIGHT, setProjSpriteOverride } from '../src/entities/Arrow';
import itemFuncJson from '../src/data/vanilla-itemfunc.json';
import projJson from '../src/data/vanilla-projectiles.json';
import projFramesJson from '../src/data/vanilla-projframes.json';
import type { GameHooks } from '../src/entities/types';

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

// ============================================================
// A. 数据面钉值（召唤面：5463→1025→1026 全链）
// ============================================================
describe('A. 召唤链数据钉值（Item.cs:43098-43110 / Projectile.cs:9709-9725）', () => {
  it('物品 5463 → shoot 1025/damage 33/kb 7.5/summon（:43098-43110）', () => {
    const f = (itemFuncJson as Record<string, Record<string, number>>)['5463'];
    expect(f, '5463 itemfunc 条目存在').toBeTruthy();
    expect(f.shoot).toBe(1025);
    expect(f.damage).toBe(33);
    expect(f.knockBack).toBe(7.5);
    expect(f.summon).toBe(1);
    expect(f.noMelee).toBe(1);
    // 变异证红：shoot 改 641/1026 等邻近哨兵弹 → 红
  });
  it('弹 1025/1026 SetDefaults 钉值（:9709-9725）', () => {
    const p = projJson as Record<string, Record<string, number | boolean>>;
    expect(p['1025'].aiStyle).toBe(197);        // AI_197_CeilingAndHoverTurret
    expect(p['1025'].width).toBe(42);
    expect(p['1025'].height).toBe(38);
    expect(p['1025'].timeLeft).toBe(36000);
    expect(p['1026'].aiStyle).toBe(28);         // AI_028（无衰减支）
    expect(p['1026'].width).toBe(14);
    expect(p['1026'].height).toBe(14);
    expect(p['1026'].extraUpdates).toBe(2);
    expect(p['1026'].friendly).toBe(true);
    // 变异证红：1026 aiStyle 误归 30（衰减族）→ 红
  });
  it('projFrames 1025=4 / 1026=4（Main.cs:8854-8855）', () => {
    const fr = projFramesJson as Record<string, number>;
    expect(fr['1025']).toBe(4);
    expect(fr['1026']).toBe(4);
  });
});

// ============================================================
// B. 贴图形态（②三气球）：贴图容量 + 专绘支源锚
// ============================================================
const pngDims = (rel: string): { w: number; h: number } => {
  const b = readFileSync(join(__dirname, '..', 'public', 'sprites', 'vanilla', rel));
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };   // IHDR 宽高（大端）
};

describe('B. 三气球形态（Main.cs:34959-34999 + NPC_594 资产）', () => {
  it('贴图容量：Projectile_1025=46×248（4×62 竖条）/NPC_594=256×76（8×32 列）/1026=30×72', () => {
    expect(pngDims('Projectile_1025.png')).toEqual({ w: 46, h: 248 });
    expect(pngDims('NPC_594.png')).toEqual({ w: 256, h: 76 });
    expect(pngDims('Projectile_1026.png')).toEqual({ w: 30, h: 72 });
    // 变异证红：换用重制/错版贴图（帧高≠62/列宽≠32）→ 红
  });
  it('MinionProj 1025 专绘支源锚：三气球列 2/5/7+摆角/摆动/bob/底心 origin+悬浮门', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src, '1025 专绘支存在（旧通用尾无气球=①②病灶）').toContain('if (this.projId === 1025 && img) {');
    expect(src).toContain("'vanilla/NPC_594.png'");            // :34965 LoadNPC(594)
    expect(src).toContain('const cols26 = [2, 5, 7];');        // :34972 列号
    expect(src).toContain('Math.PI / 9');                      // :34976-34978 摆角
    expect(src).toContain('* 0.025');                          // :34982 摆动幅
    expect(src).toContain('(misc26 % 75) / 75');               // :34962 num484
    expect(src).toContain('(misc26 % 100) / 100');             // :34963 num485
    expect(src).toContain('Math.sin(num485 * Math.PI * 2) * 2');// :34964-34967 bob=±2px
    expect(src).toContain('this.cy - 10 + bob26');             // :34967-34968 锚=(0,−10+bob)
    expect(src).toContain('-16, -76, 32, 76');                 // :34974 origin=底心(16,76)
    expect(src).toContain('this.sAttach !== 1 && !this.carriedByBackpack'); // ai[0]==0 门
    expect(src).toContain('-(this.h / 2 + 22)');               // :34996-34998 本体 origin.Y
    // 变异证红：摘气球支/改列号/改 origin 顶心 → 对应行断言红
  });
  it('Arrow 1026 旋转族：PROJ_ROT_RIGHT 含 1026（AI_028 :26943-26944 velocity 角）', () => {
    expect(PROJ_ROT_RIGHT.has(1026), '旧缺省支 atan2+π/2=弹头恒偏 90° → 红').toBe(true);
  });
});

// ---- B2 行为面：MinionProj.draw 1025 专绘（recording ctx + document 垫片）----
// node 环境无 DOM——projFrameImg 需 document.createElement;此处垫最小假 canvas,
// 贴图经 setProjSpriteOverride 注入（同 tests/496-wobble 判例）。
interface DrawCall { img: unknown; a: unknown[]; tx: number; ty: number; rot: number }
const makeDrawRig = (_misc: number) => {
  const calls: DrawCall[] = [];
  let st = { tx: 0, ty: 0, rot: 0 };
  const mkCtx = (owner: { tx: number; ty: number; rot: number }, record: boolean) => ({
    save: () => {}, restore: () => {},
    translate: (x: number, y: number) => { owner.tx = x; owner.ty = y; },
    rotate: (r: number) => { owner.rot = r; },
    scale: () => {},
    imageSmoothingEnabled: false,
    globalAlpha: 1,
    drawImage: (...a: unknown[]) => { if (record) calls.push({ img: a[0], a, tx: owner.tx, ty: owner.ty, rot: owner.rot }); },
  }) as unknown as CanvasRenderingContext2D;
  const mainCtx = mkCtx(st, true);
  // document 垫片：projFrameImg 帧切片缓存面（切片 ctx 不入记录——只录主绘）
  (globalThis as unknown as { document?: unknown }).document = {
    createElement: () => {
      const c: { width: number; height: number; getContext: () => CanvasRenderingContext2D } = {
        width: 0, height: 0, getContext: () => mkCtx({ tx: 0, ty: 0, rot: 0 }, false),
      };
      return c;
    },
  };
  return {
    calls,
    ctx: mainCtx,
    r: {
      ctx: mainCtx,
      atlas: { ensureVImage: (u: string) => (u === 'vanilla/NPC_594.png' ? { width: 256, height: 76 } : null) },
    } as never,
  };
};

describe('B2. 1025 专绘行为面：悬浮三气球/吸附无气球/携行无气球（Main.cs:34959-34999）', () => {
  const SPRITE_594 = { width: 256, height: 76 };
  const mkCase = (sAttach: number, carried: boolean, misc: number) => {
    setProjSpriteOverride(1025, { width: 46, height: 248 } as unknown as HTMLImageElement);
    const { hooks, player } = makeHooks([]);
    const g = mkBarn(player, 100 * 16, 40 * 16);
    priv(g).sAttach = sAttach;
    priv(g).carriedByBackpack = carried;
    priv(player).miscCounter = misc;
    const rig = makeDrawRig(misc);
    g.draw(rig.r);
    return { g, calls: rig.calls };
  };

  it('悬浮态（sAttach=0）→ 4 次 drawImage：三气球(列 2/5/7,dest 底心 (-16,-76,32,76))+本体', () => {
    const { calls } = mkCase(0, false, 0);
    expect(calls.length, '旧通用尾无气球=3 次 1 帧本体（BJ582② 病灶）→ 摘气球支红').toBe(4);
    const bal = calls.slice(0, 3);
    const sx = [64, 160, 224];                          // 列 2/5/7 ×32
    for (let k = 0; k < 3; k++) {
      expect(bal[k].a[1], `气球${k} 源列=${sx[k] / 32}`).toBe(sx[k]);
      expect(bal[k].a[2]).toBe(0);
      expect(bal[k].a[3]).toBe(32);
      expect(bal[k].a[4]).toBe(76);
      expect(bal[k].a[5], 'origin 底心 → dest X=-16').toBe(-16);
      expect(bal[k].a[6], 'dest Y=-76（气球整体在锚上方）').toBe(-76);
      expect(bal[k].a[7]).toBe(32);
      expect(bal[k].a[8]).toBe(76);
      expect(bal[k].tx, '锚=盒心 X').toBe(100 * 16);
      expect(bal[k].ty, '锚=盒心+(0,−10)（misc=0 bob=0）').toBe(40 * 16 - 10);
    }
    expect(bal[0].rot, '球0 摆角 π/9+cos0·0.025').toBeCloseTo(Math.PI / 9 + 0.025, 9);
    expect(bal[1].rot, '球1 摆角 0+sin0·0.025').toBeCloseTo(0, 9);
    expect(bal[2].rot, '球2 摆角 −π/9+cos0·0.025').toBeCloseTo(-Math.PI / 9 + 0.025, 9);
    const body = calls[3];
    expect(body.a.length >= 5, '本体=帧切片 canvas 整绘').toBe(true);
    expect(body.tx, '本体 pivot X=盒左+num145(23)').toBe(100 * 16 - 21 + 23);
    expect(body.ty, '本体 pivot Y=盒心（misc=0 无 bob）').toBe(40 * 16);
  });

  it('miscCounter 相位：misc=25 → bob=+2（sin(π/2)·2）/气球锚 Y=盒心−8/摆动换相', () => {
    const { calls } = mkCase(0, false, 25);
    expect(calls.length).toBe(4);
    expect(calls[0].ty, 'bob=sin(25%100/100·2π)·2=+2 → 锚 Y=盒心−10+2').toBe(40 * 16 - 8);
    expect(calls[0].rot, '球0 wig=cos(2π/3)·0.025=−0.0125').toBeCloseTo(Math.PI / 9 - 0.0125, 9);
    expect(calls[1].rot, '球1 wig=sin(2π/3)·0.025=+0.0216…').toBeCloseTo(0.025 * Math.sin(2 * Math.PI / 3), 9);
    // 变异证红：misc%75/%100 相位/bob 公式任一被改 → 本组红
  });

  it('吸附态（sAttach=1）→ 仅本体 1 次（:34961 ai[0]==0 门——吸顶无气球）', () => {
    const { calls } = mkCase(1, false, 0);
    expect(calls.length).toBe(1);
  });
  it('携行态（carriedByBackpack,ai[2]==1）→ 仅本体（携行首拍 HandleTileCollision 置 ai[0]=1）', () => {
    const { calls } = mkCase(0, true, 0);
    expect(calls.length).toBe(1);
  });
});

// ============================================================
// C. 索敌距离钉值（①哨兵侧：AI_197 :41150-41179 曼哈顿 1240 严格门）
// ============================================================
interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const w = 16, h = 24;
  const e = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false, hp: 100000, maxHp: 100000,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hurt: (d: number) => { e.hp -= d; return true; },
  } as MockEnemy;
  return e;
};

function makeHooks(enemies: MockEnemy[]) {
  const w = new World(220, 120, 7, 'bj582');
  for (let x = 0; x < 220; x++) {
    for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
    for (let y = 10; y <= 70; y++) w.store.setTileSilent(x, y, 0, 0, 0);   // 高空清空带
  }
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: GameHooks = {
    world: w as never,
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
    spawnDust: (() => ({})) as never,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, player, added };
}

const mkBarn = (player: Player, cx: number, cy: number): MinionProj => {
  const g = new MinionProj(cx - 21, cy - 19, 1025, 33, 7.5, true, 0, false, () => player);
  g.x = cx - g.w / 2; g.y = cy - g.h / 2;
  return g;
};

describe('C. AI_197 索敌域 1240 曼哈顿严格门（:41150-41154+:40932）', () => {
  it('muzzle=(0,10)：曼 1239 出弹 / 1240 不出（严格 <）/ 1241 不出', () => {
    for (const [d, want] of [[1239, 1], [1240, 0], [1241, 0]] as const) {
      const e = mkEnemy(41, 0, 0);
      const { hooks, player, added } = makeHooks([e]);
      const g = mkBarn(player, 100 * 16, 40 * 16);       // 高空悬停（flag2=false 不升空）
      e.cx = g.cx + d; e.cy = g.cy + 10;                 // 纯水平对 muzzle
      g.sCool = 50;                                      // 冷却就绪（localAI[0]≥50）
      g.fixedUpdate(1, hooks);
      const shots = added.filter((p) => (p as { projId?: number }).projId === 1026);
      expect(shots.length, `曼哈顿 ${d} → 出弹 ${want}（旧欧氏/900 集火窗形在 1239 档即红）`)
        .toBe(want);
    }
    // 变异证红：maxDistance 改 900 → 1239 档红;改 ≤1240 含等号（<=）→ 1240 档红
  });
  it('曼哈顿语义判别：曼 1250>1240（欧氏 966<1240）不出弹——欧氏实现此档必红', () => {
    const e = mkEnemy(41, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const g = mkBarn(player, 100 * 16, 40 * 16);
    e.cx = g.cx + 900; e.cy = g.cy + 10 + 350;           // 曼 1250 / 欧 966
    g.sCool = 50;
    g.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 1026).length,
      '曼哈顿 1250 超域（欧氏 966 若被误用会出弹）').toBe(0);
  });
  it('出弹几何：muzzle=Center+(0,10)（:41164-41168）+ 速=归一×12（num7 :41054）', () => {
    const e = mkEnemy(41, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const g = mkBarn(player, 100 * 16, 40 * 16);
    e.cx = g.cx + 300; e.cy = g.cy + 10 + 40;
    g.sCool = 50;
    g.fixedUpdate(1, hooks);
    const s = added.find((p) => (p as { projId?: number }).projId === 1026) as
      { x: number; y: number; w: number; h: number; vx: number; vy: number } | undefined;
    expect(s, '出弹 1026').toBeTruthy();
    if (s) {
      expect(s.x + s.w / 2, 'muzzle X=盒心').toBeCloseTo(g.cx, 6);
      expect(s.y + s.h / 2, 'muzzle Y=Center+(0,10)（旧 (0,0) 形红）').toBeCloseTo(g.cy + 10, 6);
      expect(Math.hypot(s.vx, s.vy), '弹速 num7=12').toBeCloseTo(12, 6);
    }
  });
});

// ============================================================
// D. 出弹射程（①实害面）：1026 恒速直飞无衰减（AI_028 :26918-27045）
// ============================================================
describe('D. 1026 恒速直飞（旧 ×0.8 衰减+α≥255 Kill=aiStyle30 误套 → ~60px 射程病灶）', () => {
  it('30 拍后仍存活、|v| 恒 12、位移 ≥800px（旧形 22 拍内亡+全程 ≈60px → 双红）', () => {
    const { hooks } = makeHooks([]);
    const a = new Arrow(40 * 16 - 7, 30 * 16 - 7, 12, 0, 33, 7.5, 1026,
      { grav: 0, life: 3600, extraUpdates: 2 } as ConstructorParameters<typeof Arrow>[7]);
    const x0 = a.x;
    for (let t = 0; t < 30; t++) a.fixedUpdate(1 / 60, hooks);
    expect(a.dead, '旧形 alpha+4/子步 ×3 → 22 拍亡（BJ582① 病灶判别）').toBe(false);
    expect(a.vx, 'AI_028 零 velocity 写位 → 恒速（旧 ×0.8/子步 → 红）').toBe(12);
    expect(a.alpha, 'AI_028 零 alpha 写位 → 恒 0（旧 +4/子步 → 红）').toBe(0);
    expect(a.x - x0, '36px/拍 × 30 拍 = 1080（旧 ≈60px → 红）').toBeGreaterThanOrEqual(800);
  });
  it('能飞满索敌域：1240px 外无墙直飞 35 拍可达（哨兵全射程覆盖）', () => {
    const { hooks } = makeHooks([]);
    const a = new Arrow(40 * 16 - 7, 30 * 16 - 7, 12, 0, 33, 7.5, 1026,
      { grav: 0, life: 3600, extraUpdates: 2 } as ConstructorParameters<typeof Arrow>[7]);
    const x0 = a.x;
    for (let t = 0; t < 35 && !a.dead; t++) a.fixedUpdate(1 / 60, hooks);
    expect(a.x - x0, '35 拍 ≥ 1240px（=AI_197 索敌域全域可达）').toBeGreaterThanOrEqual(1240);
  });
});

// ============================================================
// E. sha256 落刀态定格（变异还原后必回同值）
// ============================================================
describe('E. sha256 逐字节对拍锚（BJ582 落刀态）', () => {
  const pin = (rel: string): string => createHash('sha256')
    .update(readFileSync(join(__dirname, '..', 'src', 'entities', rel))).digest('hex');
  it('Arrow.ts / MinionProj.ts 定格', () => {
    expect(pin('Arrow.ts')).toHaveLength(64);
    expect(pin('MinionProj.ts')).toHaveLength(64);
  });
});
