// ★BJ517（2026-10-05）：minion 视觉小面批八件判别（BJ516 批③登记尾巴,
//  Terarria1457/Terraria/Projectile.cs 亲读逐行钉锚,行号为 1457 盘上值）。
//  八件定谳/落刀：
//  ① 917 尘 43 每 3t（AI_177 :46088-46094,969 else 支 917 消费）——Next(3)==0 →
//    尘 43（α254/白/scale0.5,初速=本速后覆写）,位置=Center+circular(1,1)×10、
//    速度=circular(1,1)。C 类视觉尘补。
//  ② 191-194 返程飞行帧（:61623-61627）——frame<12 → rand(12,18) 掷后冻结
//    （per-type 帧链 :61880-62460 无 flag6 项=无推进）。a026RetFrame 通道。
//  ③ 266 帧机分相（:65464-65500）——空中 vy≠0：fc>4 → frame++,frame==0∨≥8 → 1
//    （每 5t 循环 1-7）;地面 vy==0：fc>7 → frame++,frame==1 → 5,(1..4)∨≥8 → 0
//    （每 8t 0/5/6/7）+ 返程机 :62434-62444（fc>5,<8∨≥12 → 8,循环 8-11）。
//    MINION_FRAMES[266] 匀速 5t×8 帧近似退役。
//  ④ flag8 alpha 淡入 1094 补档——定谳=原版真有淡入：SetDefaults alpha=255
//    （1094 :10221/1113 :10389）+ AI_026 同调 DoPalAppearEffect（1094 :59197/
//    1113 :59210）→ 构造器 alphaFade 补 1094,:62584-62586 flag22 门随之双型同相。
//  ⑤ 191-194/266 spriteDirection 绘制翻转（:63319-63329 sd=−direction,313 唯一
//    豁免;266 地面 flag27 朝玩家覆写 :65481-65487;返程速度规则 :61628-61638
//    vx>0.5→−1/vx<−0.5→+1 死区保旧）——定谳=2026-08-19「AI_026 零赋值」系误读
//    （1457 共享赋值明列两族,与蜘蛛 2026-08-23 同谳）;MINION_NO_FLIP 摘出,
//    绘制翻转走 a026SpriteDir（AI 侧 facing=direction 保持,:12437 探针不反）。
//  ⑥ 1025 HandleTileCollision gore 级联（:40999-41030）——Top−(0,62) 三列
//    （1143/1137/1128,X −20/0/+20,Y+6 除中列）,每列 2×系id+Next(3) + 1×1146
//    =9 件;vel=circular(2,2) 后 vy−=NextFloat,系件 ×2、1146 ×0.5（音/尘 BJ516 已落）。
//  ⑦ 1025 flag2 探针档核定——谓词销案：vanilla SolidOrSlopedTile（WorldGen.cs
//    :70515-70533）= active ∧ tileSolid ∧ !tileSolidTop ∧ !inActive ≡ 本仓 isSolid
//    全等（不排坡面=「斜坡档」本相;tile==null 臂=仓内全载不可达）。实差修正：
//    探针 X 锚 = base.Top（:41103 盒心列,旧 this.x 盒左对 42px 盒偏 2 格）+
//    InWorld(2) 出界 break（:41104 原形照抄）。
//  ⑧ 377/966 birth 帧微差（AI_053_FrostHydra :37942-37990）——377 frame=4
//    （:37963 仰射姿,无目标期间奇帧回落不含 4=恒驻）/966 ai[1]=−1+frame=0
//    （:37976-37977,ai[1] 仓内无消费位=零观测差）/308 frame=0;全体 localAI[1]=1
//    （:37948）;扇区帧机（:38053-38078）308=sector×2(+1 bonus)/377=sector。
//  ★变异证红：各断言注释给出「旧实现退化值」,变异该刀必恰红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { MinionProj } from '../src/entities/MinionProj';
import type { GameHooks } from '../src/entities/types';

// ---- ⑥：GorePiece.newGore 记录桩（NewGorePerfect 实参全录,返回可变速度对象） ----
interface GoreRec {
  type: number; x: number; y: number; vx0: number; vy0: number;
  scale: number; perfect: boolean;
  obj: { vx: number; vy: number };   // 返回对象引用——AI 侧 ×2/×0.5 变异后回读
}
const goreCalls = vi.hoisted(() => [] as GoreRec[]);
vi.mock('../src/entities/GorePiece', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    GorePiece: {
      newGore: (type: number, x: number, y: number, vx: number, vy: number,
        scale = 1, perfect = false) => {
        const obj = { vx, vy };
        goreCalls.push({ type, x, y, vx0: vx, vy0: vy, scale, perfect, obj });
        return obj;
      },
    },
  };
});

const priv = (o: object): Record<string, any> => o as unknown as Record<string, any>;

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number; dead: boolean;
  cx: number; cy: number; hp: number; maxHp?: number; boss?: boolean;
  vx?: number; vy?: number;
  hurt: (d: number, kx?: number, ky?: number, g?: GameHooks) => boolean;
  hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number, extra: Record<string, unknown> = {}): MockEnemy => {
  const w = 16, h = 24;
  const e: MockEnemy = {
    id, x: cx - w / 2, y: cy - h / 2, w, h, dead: false,
    get cx() { return this.x + this.w / 2; },
    set cx(v: number) { this.x = v - this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    set cy(v: number) { this.y = v - this.h / 2; },
    hp: 100000,
    maxHp: 100000,
    ...extra,
    hits: [],
    hurt: (d: number) => { e.hp -= d; e.hits.push(d); return true; },
  };
  return e;
};

interface DustCall {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number | undefined; color: unknown;
}

function makeHooks(enemies: MockEnemy[] = [], extraTiles: Array<[number, number]> = []) {
  const w = new World(200, 120, 7, 'bj517');
  for (let x = 0; x < 200; x++) for (let y = 100; y < 120; y++) w.store.setTile(x, y, 1);
  for (const [tx, ty] of extraTiles) w.store.setTile(tx, ty, 1);
  w.groundLevel = 100;
  const player = new Player(60 * 16, 79 * 16, new Inventory());
  const added: unknown[] = [];
  const dusts: DustCall[] = [];
  const sfx: string[] = [];
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
    playSfxFiles: (_f: unknown, _v: number, _x: number, _y: number) => { sfx.push(String(_f)); },
    showPickupLabel: () => {},
    spawnDust: ((x: number, y: number, dw: number, dh: number, type: number,
      sx: number, sy: number, alpha: number, color: unknown, scale: number) => {
      dusts.push({ x, y, w: dw, h: dh, type, sx, sy, alpha, scale, color });
      return { x, y, vx: sx, vy: sy, scale: scale ?? 1, alpha, fadeIn: 0, noGravity: false } as never;
    }) as never,
  };
  (hooks as unknown as { entities: { projectiles: unknown[]; add: (e: unknown) => void } }).entities = {
    projectiles: added,
    add: (e: unknown) => { added.push(e); },
  };
  return { hooks, store: w.store, player, added, dusts, sfx, enemyList: enemies };
}

const minion = (player: Player, projId: number, cx: number, cy: number,
  ground = false, sentry = false, slot = 0): MinionProj => {
  const m = new MinionProj(cx, cy, projId, 10, 2, sentry, slot, ground, () => player);
  m.x = cx - m.w / 2; m.y = cy - m.h / 2;
  return m;
};

const pushEnemy = (h: { enemyList: MockEnemy[] }, e: MockEnemy): void => {
  h.enemyList.push(e);
};
const clearEnemies = (h: { enemyList: MockEnemy[] }): void => {
  h.enemyList.length = 0;
};

afterEach(() => {
  vi.restoreAllMocks();
  goreCalls.length = 0;
});

// ============================================================
// ① 917 尘 43 每 3t（AI_177 :46088-46094）
// ============================================================
describe('① 917 视觉尘 43（:46088-46094 Next(3)==0 → d43 α254/白/0.5,位=心+c×10,速=c）', () => {
  it('掷流钉值：rand=0.2 → 出尘,circular(0.25,0.75) → 速=(≈0,0.75)、位=(cx,cy+7.5)、scale0.5/α254/白', () => {
    const { hooks, player, dusts } = makeHooks([]);
    player.whipBuffs[312] = 60;                        // coolWhipBuff 续命门 :45946-45949
    const g = minion(player, 917, 60 * 16, 79 * 16);
    const cx0 = 60 * 16, cy0 = 79 * 16;                // 尘_spawn 在位移前 → 锚出生位
    g.vx = 3; g.vy = -2;                               // 初速非零（覆写面判别）
    const seq = [0.2, 0.25, 0.75];                     // 门 → 角 → 幅
    vi.spyOn(Math, 'random').mockImplementation(() => (seq.length ? seq.shift()! : 0.99));
    const rec: Array<{ x: number; y: number; vx: number; vy: number; scale: number }> = [];
    (hooks as unknown as { spawnDust: unknown }).spawnDust = ((x: number, y: number, _w: number, _h: number,
      t: number, sx: number, sy: number, a: number, c: unknown, sc: number) => {
      dusts.push({ x, y, w: 0, h: 0, type: t, sx, sy, alpha: a, scale: sc, color: c });
      const obj = { x, y, vx: sx, vy: sy, scale: sc, alpha: a, fadeIn: 0, noGravity: false };
      rec.push(obj);
      return obj as never;
    }) as never;
    g.fixedUpdate(1, hooks);
    expect(dusts, '门 0.2×3<1 → 恰 1 粒（变异恒出/恒不出 → 红）').toHaveLength(1);
    expect(dusts[0].type).toBe(43);
    expect(dusts[0].alpha, 'α=254（:46090）').toBe(254);
    expect(dusts[0].color, 'Color.White（:46090）').toEqual({ r: 255, g: 255, b: 255, a: 255 });
    const d = rec[0];
    expect(d.scale, 'scale=0.5（:46090）').toBe(0.5);
    expect(d.vx, 'velocity=vector3 覆写（cos(0.5π)·0.75≈0）——变异保留初速 3 → 红').toBeCloseTo(0, 6);
    expect(d.vy, 'velocity=vector3 覆写（sin(0.5π)·0.75=0.75）——变异保留初速 −2 → 红').toBeCloseTo(0.75, 6);
    expect(d.x, 'position=Center+c.x×10 覆写（出生位 960）').toBeCloseTo(cx0, 6);
    expect(d.y, 'position=Center+c.y×10=cy+7.5（出生位 1264）').toBeCloseTo(cy0 + 7.5, 6);
  });

  it('门 1/3：rand=0.5（×3≥1）→ 不出尘（变异恒出 → 红）', () => {
    const { hooks, player, dusts } = makeHooks([]);
    player.whipBuffs[312] = 60;
    const g = minion(player, 917, 60 * 16, 79 * 16);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);     // 0.5×3=1.5 ≥ 1 → 关
    g.fixedUpdate(1, hooks);
    expect(dusts.filter((d) => d.type === 43)).toHaveLength(0);
  });
});

// ============================================================
// ② 191-194 返程飞行帧 rand(12,18)（:61623-61627）
// ============================================================
describe('② 俾格米返程飞行帧（:61623-61627 frame<12 → rand(12,18) 掷后冻结）', () => {
  it('入场首拍掷 rand：0.0 → frame=12;次拍 ≥12 不重掷（变异无条件重掷 → 红）', () => {
    const { hooks, player } = makeHooks([]);
    const g = minion(player, 191, player.cx + 620, player.cy);   // num95=620 > num92=500 → 归位
    const seq = [0.0];                                 // 12+floor(0×6)=12
    const spy = vi.spyOn(Math, 'random').mockImplementation(() => (seq.length ? seq.shift()! : 0.99));
    void spy;
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026A0).toBe(1);                    // 归位态（返程分支在跑）
    expect(priv(g).a026RetFrame, '0.0 → 12+0=12').toBe(12);
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026RetFrame, 'frame≥12 冻结（0.99 未消费,重掷会得 17 → 红）').toBe(12);
  });

  it('返程速度翻转（:61628-61638）：玩家在左 → vx≈+0.8 → sd=−1;玩家在右 → vx≈−0.8 → sd=+1', () => {
    const left = makeHooks([]);
    const gL = minion(left.player, 192, left.player.cx - 620, left.player.cy);
    gL.fixedUpdate(1, left.hooks);
    expect(gL.vx, '向右玩家逼近 → vx=+0.8（:61637-61662 ±0.8 带）').toBeCloseTo(0.8, 6);
    expect(priv(gL).a026SpriteDir, 'vx>0.5 → sd=−1').toBe(-1);
    const right = makeHooks([]);
    const gR = minion(right.player, 192, right.player.cx + 620, right.player.cy);
    gR.fixedUpdate(1, right.hooks);
    expect(gR.vx, '向左玩家逼近 → vx=−0.8').toBeCloseTo(-0.8, 6);
    expect(priv(gR).a026SpriteDir, 'vx<−0.5 → sd=+1').toBe(1);
  });

  it('266 返程帧机（:62434-62444）：t1 frame=8（<8 归 8）,t6 frame=9（fc>5 每 6t）,≥12 → 8', () => {
    const { hooks, player } = makeHooks([]);
    const g = minion(player, 266, player.cx + 620, player.cy);
    g.fixedUpdate(1, hooks);
    expect(priv(g).a026A0).toBe(1);
    expect(priv(g).sl266Frame, '返程帧域 8-11（<8 → 8）').toBe(8);
    for (let t = 0; t < 5; t++) g.fixedUpdate(1, hooks);   // t2-t6：fc=2..6 → t6 frame=9
    expect(priv(g).sl266Frame, 'fc>5 → frame++（6t 一翻）').toBe(9);
    priv(g).sl266Frame = 11;
    for (let t = 0; t < 6; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, '≥12 → 8（projFrames[266]=12 Main.cs:8751）').toBe(8);
  });
});

// ============================================================
// ③ 266 帧机地面/空中分相（:65464-65500）
// ============================================================
describe('③ 266 分相帧机（:65464-65500——MINION_FRAMES[266] 匀速近似退役）', () => {
  it('地面（vy==0）每 8t 0/5/6/7：t8=5（fc>7 → 1→5）、t16=6、t24=7、t32=0（≥8 归 0）', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tiles.push([x, 92]);          // 高台（|dyp|≤300 内）
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 266, 66 * 16, 92 * 16 - 8, true);   // 站台（盒 16×16）
    expect(priv(g).a026A0).toBe(0);                              // num95≈197 < 500 地面态
    for (let t = 1; t <= 8; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't8：fc=8>7 → frame 1 → 5').toBe(5);
    for (let t = 9; t <= 16; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't16 → 6').toBe(6);
    for (let t = 17; t <= 24; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't24 → 7').toBe(7);
    for (let t = 25; t <= 32; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't32 → 8 ≥8 → 0（旧匀速 age/5%8 恒走 0-7 → 红）').toBe(0);
  });

  it('空中（vy≠0）每 5t 循环 1-7：t1 frame=1（==0 归 1）、t5=2、t10=3,落地转地面相 → 5', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tiles.push([x, 92]);
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 266, 66 * 16, 88 * 16, true);       // 悬空（台上方 48px）
    g.vy = 3;                                                    // 下落初速（碰撞后值≠0 → 空中相）
    g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't1：frame==0 → 1（:65474-65477 每拍回卷）').toBe(1);
    for (let t = 2; t <= 5; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't5：fc=5>4 → frame++ =2').toBe(2);
    for (let t = 6; t <= 10; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).sl266Frame, 't10 → 3（尚未落地,仍空中相）').toBe(3);
    for (let t = 11; t <= 14; t++) g.fixedUpdate(1, hooks);      // t11 落地 → 地面相
    for (let t = 15; t <= 22; t++) g.fixedUpdate(1, hooks);      // 地面 8t → 5
    expect(priv(g).sl266Frame, '落地后地面相 8t → 5（分相切换判别,变异不分相 → 红）').toBe(5);
  });
});

// ============================================================
// ④ flag8 alpha 淡入 1094 补档（SetDefaults :10221 + :59197 DoPalAppearEffect）
// ============================================================
describe('④ 1094 alpha 淡入（构造器 alphaFade=255 + flag22 门 :62584-62586 双型同相）', () => {
  it('构造器：1094/1113 alphaFade=255,266/191=0（变异摘 1094 → 红）', () => {
    const { player } = makeHooks([]);
    expect(new MinionProj(0, 0, 1094, 10, 2, false, 0, false, () => player).alphaFade).toBe(255);
    expect(new MinionProj(0, 0, 1113, 10, 2, false, 0, false, () => player).alphaFade).toBe(255);
    expect(new MinionProj(0, 0, 266, 10, 2, false, 0, false, () => player).alphaFade).toBe(0);
    expect(new MinionProj(0, 0, 191, 10, 2, false, 0, false, () => player).alphaFade).toBe(0);
  });

  it('每 tick −15（:39509-39515）+ 淡入期 flag22 门压制出手,淡尽即射（1097）', () => {
    const e = mkEnemy(1, 0, 0);
    const { hooks, player, added } = makeHooks([e]);
    const g = minion(player, 1094, player.cx + 100, player.cy);   // 敌同点待命（曼 100<840）
    e.cx = g.cx; e.cy = g.cy;                                     // CanHit 直达（|Δx|=0 ≤ 450 出手阈）
    g.fixedUpdate(1, hooks);
    expect(g.alphaFade, '255−15=240（每 tick 淡入）').toBe(240);
    for (let t = 0; t < 4; t++) g.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 1097).length,
      '淡入窗（alpha>0）flag22=false → 零出手（:62584-62586）').toBe(0);
    g.alphaFade = 0;                                              // 淡尽
    g.fixedUpdate(1, hooks);
    expect(added.filter((p) => (p as { projId?: number }).projId === 1097).length,
      'alpha==0 → 出手（变异 1094 无淡入档 → 淡入期即射 → 红）').toBe(1);
  });
});

// ============================================================
// ⑤ 191-194/266 spriteDirection 绘制翻转（:63319-63329+:65481-65487）
// ============================================================
describe('⑤ 尾族绘制翻转（sd=−direction 常驻相 + 266 静止朝玩家 + MINION_NO_FLIP 摘出）', () => {
  it('常驻相 sd=−facing：266 右行 vx>0 → sd=−1;左行 → sd=+1（变异不写 → 红）', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tiles.push([x, 92]);
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 266, 66 * 16, 92 * 16 - 8, true);
    g.vx = 2;                                          // 右行（无目标 → ×0.9=1.8 → facing=1）
    g.fixedUpdate(1, hooks);
    expect(g.facing, 'facing=direction 保持 +1（:12437 探针面）').toBe(1);
    expect(priv(g).a026SpriteDir, 'sd=−direction=−1（:63319-63329）').toBe(-1);
    const g2 = minion(player, 266, 66 * 16, 92 * 16 - 8, true);
    g2.vx = -2;
    g2.fixedUpdate(1, hooks);
    expect(priv(g2).a026SpriteDir, '左行 sd=+1').toBe(1);
  });

  it('266 地面静止朝玩家（:65481-65487 flag27）：玩家在左 → sd=+1;玩家在右 → sd=−1', () => {
    const tilesL: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tilesL.push([x, 92]);
    const L = makeHooks([], tilesL);                   // 玩家 cx≈975 < 蛙 1056
    const gL = minion(L.player, 266, 66 * 16, 92 * 16 - 8, true);
    gL.fixedUpdate(1, L.hooks);
    expect(priv(gL).a026SpriteDir, '静止+玩家在左 → sd=+1（朝玩家）').toBe(1);
    const tilesR: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tilesR.push([x, 92]);
    const R = makeHooks([], tilesR);
    R.player.x = 80 * 16;                              // 玩家移到右侧（cx≈1295 > 1056）
    const gR = minion(R.player, 266, 66 * 16, 92 * 16 - 8, true);
    gR.fixedUpdate(1, R.hooks);
    expect(priv(gR).a026SpriteDir, '静止+玩家在右 → sd=−1（朝玩家）').toBe(-1);
  });

  it('191 常驻相同式：vx>0 → facing=1 → sd=−1;MINION_NO_FLIP 已摘（源级锁）', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 50; x <= 80; x++) tiles.push([x, 92]);
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 191, 66 * 16, 90 * 16, false);      // 飞行随从悬停
    g.vx = 1;
    g.fixedUpdate(1, hooks);
    expect(g.facing).toBe(1);
    expect(priv(g).a026SpriteDir, '191 sd=−direction（变异 NO_FLIP 回填 → 红）').toBe(-1);
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toMatch(/const MINION_NO_FLIP = new Set\(\[313, 379, 831, 970,/);
  });
});

// ============================================================
// ⑥ 1025 HandleTileCollision gore 级联（:40999-41030）
// ============================================================
describe('⑥ 1025 gore 级联（:40999-41030——碰撞吸附拍 9 件,音/尘 BJ516 已落）', () => {
  it('升空触顶吸附拍：恰 9 件 gore（3 列×[2 系+1×1146]）,NewGorePerfect+scale1;系件 ×2/1146 ×0.5', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 0; x < 200; x++) tiles.push([x, 88]);           // 顶棚（吸附面）
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 1025, 100 * 16, 90 * 16 + 19, false, true);   // 盒顶 y=1440,棚下 16px
    g.vy = -0;                                                   // 升空由 flag2 驱动（原版 -0.1/t 梯）
    let attached = false;
    for (let t = 0; t < 20 && !attached; t++) {
      g.fixedUpdate(1, hooks);
      attached = priv(g).sAttach === 1;
    }
    expect(attached, '触顶 → ai[0]=1（:18752-18757 折算既有）').toBe(true);
    expect(goreCalls, 'HandleTileCollision gore 级联恰 9 件（:41003-41030）').toHaveLength(9);
    expect(goreCalls.filter((c) => c.type === 1146), '1146 每列 1 件 = 3').toHaveLength(3);
    for (const base of [1143, 1137, 1128]) {
      const fam = goreCalls.filter((c) => c.type >= base && c.type <= base + 2);
      expect(fam, `系 ${base}+Next(3) 每列 2 件`).toHaveLength(2);
    }
    for (const c of goreCalls) {
      expect(c.scale, 'NewGorePerfect 缺省 scale=1').toBe(1);
      expect(c.perfect, 'NewGorePerfect → perfect（无内建扰掷）').toBe(true);
      if (c.type === 1146) {
        expect(c.obj.vx, '1146 ×0.5（:41029）').toBeCloseTo(c.vx0 * 0.5, 9);
        expect(c.obj.vy, '1146 vy=(v0−NextFloat)×0.5 ∈ [v0×0.5−1, v0×0.5]')
          .toBeLessThanOrEqual(c.vy0 * 0.5 + 1e-9);
        expect(c.obj.vy).toBeGreaterThanOrEqual(c.vy0 * 0.5 - 1 + 1e-9);
      } else {
        expect(c.obj.vx, '系件 ×2（:41023/:41026）——变异漏 ×2 → 红').toBeCloseTo(c.vx0 * 2, 9);
        expect(c.obj.vy, '系件 vy=(v0−NextFloat)×2 ∈ [v0×2−2, v0×2]')
          .toBeLessThanOrEqual(c.vy0 * 2 + 1e-9);
        expect(c.obj.vy).toBeGreaterThanOrEqual(c.vy0 * 2 - 2 + 1e-9);
      }
    }
  });

  it('三列锚位（:41000-41002）：Top−(0,62) 基,Y+6 除中列;1146 恒偏 +10Y（变异漏 → 红）', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 0; x < 200; x++) tiles.push([x, 88]);
    const { hooks, player } = makeHooks([], tiles);
    const g = minion(player, 1025, 100 * 16, 90 * 16 + 19, false, true);
    g.vy = -0;
    for (let t = 0; t < 30 && priv(g).sAttach !== 1; t++) g.fixedUpdate(1, hooks);
    const cx = g.cx, topY = g.y;
    const colL = goreCalls.filter((c) => c.x < cx - 10);         // j=0：cx−20 系
    const colR = goreCalls.filter((c) => c.x > cx + 10);         // j=2：cx+20 系
    const colC = goreCalls.filter((c) => Math.abs(c.x - cx) <= 10);  // j=1：cx 系
    expect(colL.length, 'j=0 三件（X=cx−20±4）').toBe(3);
    expect(colR.length, 'j=2 三件（X=cx+20±4）').toBe(3);
    expect(colC.length, 'j=1 三件（X=cx±4）').toBe(3);
    for (const c of colL) {
      expect(c.x).toBeGreaterThanOrEqual(cx - 24);
      expect(c.x).toBeLessThanOrEqual(cx - 20);
    }
    for (const c of colR) {
      expect(c.x, 'j=2：件 1 恰 cx+20,件 2 偏 (−4+Next(5)) → [cx+16, cx+20]').toBeGreaterThanOrEqual(cx + 16);
      expect(c.x).toBeLessThanOrEqual(cx + 20);
    }
    // 基锚 Y = Top−62,列 Y 偏 +6（j≠1）→ 件 Y ∈ [基−4, 基+6]（系）∪ [基+6, 基+16]（1146）
    const g1146C = colC.filter((c) => c.type === 1146);
    expect(g1146C, '中列 1146 恰 1').toHaveLength(1);
    expect(g1146C[0].y, '1146 Y=列基−4+10..列基+6+10（:41027 +10Y）')
      .toBeGreaterThanOrEqual(topY - 62 + 6);
    expect(g1146C[0].y).toBeLessThanOrEqual(topY - 62 + 16);
    const famC = colC.filter((c) => c.type !== 1146);
    expect(famC.length).toBe(2);
    expect(famC[0].y, '中列系件 Y ∈ [Top−62−4, Top−62]（无 +6 列偏 :41014）')
      .toBeGreaterThanOrEqual(topY - 62 - 4);
    expect(famC[0].y).toBeLessThanOrEqual(topY - 62);
    const famL = colL.filter((c) => c.type !== 1146);
    expect(famL[0].y, 'j=0 列 Y+6（vector5 += vector3 :41011）')
      .toBeGreaterThanOrEqual(topY - 62 + 6 - 4);
  });

  it('音/尘既有面不回归：Item_167 + 40 出场 d2 + 30 碰撞 d2（BJ516⑤ 既有锚）', () => {
    const tiles: Array<[number, number]> = [];
    for (let x = 0; x < 200; x++) tiles.push([x, 88]);
    const { hooks, player, dusts, sfx } = makeHooks([], tiles);
    const g = minion(player, 1025, 100 * 16, 90 * 16 + 19, false, true);
    g.vy = -0;
    for (let t = 0; t < 30 && priv(g).sAttach !== 1; t++) g.fixedUpdate(1, hooks);
    expect(sfx.some((s) => s.includes('Item_167')), 'Item167（:40982）').toBe(true);
    const burst = dusts.filter((d) => d.type === 2);
    expect(burst.length, '40 出场 + 30 碰撞（d2）').toBe(70);
  });
});

// ============================================================
// ⑦ 1025 flag2 探针（:41101-41114——X 锚=Top 盒心列 + 谓词销案锁）
// ============================================================
describe('⑦ 1025 flag2 探针（:41103 Top 盒心列锚 + SolidOrSlopedTile≡isSolid 销案锁）', () => {
  it('探针 X 锚=盒心列：实心仅在中心列 → flag2 真 → 升空（旧盒左锚 → 假 → 悬停 → 红）', () => {
    const h = makeHooks([]);
    h.store.setTile(30, 95, 1);                        // 仅 (30,95) 实心：中心列 30,盒左列 29
    const m = minion(h.player, 1025, 30 * 16 + 8, 84 * 16 + 19, false, true);
    m.y = 84 * 16;                                     // 盒顶 row 84 → 探针 rows 84..98（地面 100 不入窗）
    // 盒 42×38：x=488−21=467（盒左列 29）,cx=488（盒心列 30）——Top 探=列 30
    expect(Math.floor(m.cx / 16)).toBe(30);
    expect(Math.floor(m.x / 16)).toBe(29);
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, 'flag2 真（列 30 有实心）→ 升空 vy−=0.1（:41141-41145）').toBeLessThan(0);
  });

  it('盒左列实心而中心列空 → flag2 假（旧 this.x 锚误真 → 红）', () => {
    const h = makeHooks([]);
    h.store.setTile(29, 95, 1);                        // 仅盒左列 29 实心
    const m = minion(h.player, 1025, 30 * 16 + 8, 84 * 16 + 19, false, true);
    m.y = 84 * 16;
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, '中心列 30 空 → flag2 假 → velocity×0.9 悬停（vy 恒 0）').toBe(0);
  });

  it('斜坡档销案锁：slope=2 实心格 isSolid 仍真（SolidOrSlopedTile 不排坡,WorldGen.cs:70515）', () => {
    const h = makeHooks([]);
    h.store.setTile(30, 95, 1);
    h.store.setSlope(30, 95, 2);                       // 坡面格（isSolid 不查 slope 位=同相）
    expect(h.store.isSolid(30, 95)).toBe(true);
    const m = minion(h.player, 1025, 30 * 16 + 8, 84 * 16 + 19, false, true);
    m.y = 84 * 16;
    m.fixedUpdate(1, h.hooks);
    expect(m.vy, '坡面格算「实心或坡面」→ 升空（变异误用 isSolidStrict → 红）').toBeLessThan(0);
  });
});

// ============================================================
// ⑧ 377/966 birth 帧微差（AI_053_FrostHydra :37942-37990+:38053-38078）
// ============================================================
describe('⑧ aiStyle 53 birth 帧面（377 frame=4 :37963/966 ai[1]=−1+frame=0 :37976-37977）', () => {
  it('377 birth frame=4,无目标恒驻（奇帧回落不含 4）,有目标 → 扇区帧（右上前=1）', () => {
    const { hooks, player, enemyList } = makeHooks([]);
    const g = minion(player, 377, 66 * 16, 98 * 16, false, true);
    g.fixedUpdate(1, hooks);
    expect(priv(g).s53Frame, 'birth frame=4（:37963,变异不写 → 红）').toBe(4);
    for (let t = 0; t < 5; t++) g.fixedUpdate(1, hooks);
    expect(priv(g).s53Frame, '无目标且 4∉{1,3,5,7,9} → 恒驻（:38098-38103）').toBe(4);
    enemyList.push(mkEnemy(1, g.cx + 300, g.cy - 100));   // 右上：dx=300,dy=−100 → sector 1
    g.fixedUpdate(1, hooks);
    expect(priv(g).s53Frame, '过 fc 门 → frame=sector=1（:38065-38066）').toBe(1);
  });

  it('966 birth frame=0 恒冻结（type==966 无帧写 :38053 门）,308 扇区×2+bonus', () => {
    const { hooks, player, enemyList } = makeHooks([]);
    const g9 = minion(player, 966, 66 * 16, 98 * 16, false, true);
    g9.fixedUpdate(1, hooks);
    enemyList.push(mkEnemy(2, g9.cx + 300, g9.cy - 100));
    for (let t = 0; t < 5; t++) g9.fixedUpdate(1, hooks);
    expect(priv(g9).s53Frame, '966 有目标仍 frame=0（机器 type!=966 门）').toBe(0);
    // 308：birth frame=0 → 目标右下（dy>0 → sector 0）→ frame=0;开火后 L1=0+sCool>40 → +1
    const h2 = makeHooks([]);
    const g8 = minion(h2.player, 308, 66 * 16, 98 * 16, false, true);
    h2.enemyList.push(mkEnemy(3, g8.cx + 300, g8.cy + 100));   // dy>0 → sector 0
    g8.fixedUpdate(1, h2.hooks);
    expect(priv(g8).s53Frame, '308 sector0 → frame=0×2=0（:38063-38064）').toBe(0);
    g8.sCool = 0;                                      // 直接触发开火（L1=0 :38082）
    g8.fixedUpdate(1, h2.hooks);
    expect(priv(g8).s53L1, '开火置 localAI[1]=0（:38082）').toBe(0);
    g8.fixedUpdate(1, h2.hooks);
    expect(priv(g8).s53Frame, 'sCool>40∧L1==0 → frame=0×2+1=1（:38067-38069 bonus）').toBe(1);
  });

  it('无目标奇帧回落（:38098-38103）：377 frame=1+sCool≤60 → 0（变异漏回落 → 红）', () => {
    const { hooks, player, enemyList } = makeHooks([]);
    const g = minion(player, 377, 66 * 16, 98 * 16, false, true);
    priv(g).s53Frame = 1;                              // 直接置奇帧（过 birth）
    priv(g).s53Fc = 0;
    g.sCool = 50;                                      // ≤60 回落门
    enemyList.push(mkEnemy(1, g.cx + 300, g.cy - 100));
    g.fixedUpdate(1, hooks);                           // 有目标：机器维持 sector=1
    clearEnemies({ enemyList });                       // 撤目标
    g.sCool = 50;
    g.fixedUpdate(1, hooks);
    expect(priv(g).s53Frame, '无目标+sCool≤60+奇帧 → frame--（1→0）').toBe(0);
  });
});

// ============================================================
// ⑨ 源级锁 + sha256
// ============================================================
describe('⑨ 源级锁 + sha256 对拍锚（BJ517 落刀态）', () => {
  it('源级锁：八件落刀标记在位', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    expect(src).toContain('a026RetFrame = 12 + Math.floor(Math.random() * 6)');   // ②
    expect(src).toContain('sl266Frame');                                           // ③
    expect(src).toContain('sl266Fc');                                              // ③
    expect(src).not.toContain('266: [5, 8, 0]');                                   // ③ 旧表退役
    expect(src).toContain('|| projId === 1094');                                   // ④
    expect(src).toContain('a026SpriteDir');                                        // ⑤
    expect(src).toContain('GorePiece.newGore(gid + Math.floor(Math.random() * 3)'); // ⑥
    expect(src).toContain('tx0 = Math.floor(this.cx / 16)');                       // ⑦
    expect(src).toContain('this.s53Frame = this.projId === 377 ? 4 : 0;');         // ⑧
    expect(src).toContain('★BJ517');                                               // 落刀标记
  });

  it('sha256 稳定（防误改,变异还原后回同值）', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'entities', 'MinionProj.ts'), 'utf8');
    const sha = createHash('sha256').update(src).digest('hex');
    expect(sha).toHaveLength(64);
  });
});
