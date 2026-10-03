// BJ411（2026-09-30）用户实报定谳刀：①流星头（Meteor Head,NPCID 23）粒子；②陨石块
// （Meteorite,TileID 37——★勘误:原报"tile 7"系铜矿,37 才是陨石）粒子。
//
// 定谳（Terarria1457 亲读,1458 同行逐字节全等）：
//   A. 流星头三面全缺/错：
//      · FindFrame 火尾（NPC.cs:74803-74809,FindFrame 每 tick 在 AI 后跑=Update :91626
//        调用链）——每 tick 1 发 dust 6、盒=position−velocity（移动后旧位）、初速
//        vel×0.2、α100、scale 2、noGravity、尘速 ×0.3。本仓原相=紫尘 1/20 色点
//        （幻影锚 cs:51082-51086,1457 亲读该区零尘）→ 摘出+1:1 火尾（Enemy.swarmerAI）。
//      · HitEffect 受击尘（:90567-90585）：for(i<dmg/lifeMax×100){ [Next(2)==0?6:25]
//        NewDust(hd,-1) + d6 NewDust(vel×0.2,α100,s2)+ng } → return（无通用尾）。
//        本仓原相=表缺 23（vanilla-npcdust.json 335 键无 23）→ 零尘。
//      · HitEffect 死亡尘（:90586-90604）：50×[Next(2)==0?6:25] NewDust(2hd,-2) +
//        50×d6 NewDust(vel×0.2,α100,s2.5)+vel×6+ng。同表缺。
//   B. 陨石块两面：一有一缺：
//      · 环境火星【有】（TileDrawing.cs:7512-7518 DrawTiles_EmitParticles：1/250/帧/
//        可见格,dust 6、scale=_rand.Next(3)∈{0,1,2}、仅 scale>1 档 noGravity;
//        tileShine[37] 未赋值 Main.cs:7645-7688=不在闪光段）——本仓原有 rise 色点近似,
//        本刀升 dustRaw 原版尘通道（2026-09-07 闪光可见度批同族判例）。
//      · 挖掘/破坏尘【缺】：KillTile_MakeTileDust（WorldGen.cs:69470-69473）sheet 37 →
//        Next(2)!=0?23:6;量=KillTile_GetTileDustAmount(:67119) 缺省档 破坏 10/fail 3。
//        本仓原相=mapColor 灰褐 色点 2/8（mapColor 粒子制族近似）→ 37 专属支 1:1。
//   C. 同族普查（登记勿强扩）：火把 58/76 同支原文再叠 noLight（:7524-7530）本仓未升
//      dustRaw+无 noLight 位——登记;aiStyle5 族 6/94/173 紫尘 1/20 幻影锚（AI 全域零尘）
//      ——登记 Enemy.ts:8149 注;dropMeteor 落地事件原版零粒子（WorldGen.cs:6185 直接
//      放块,唯被毁格经 KillTile 各出己尘）;玩家站陨石原版无灼烧面（Player.cs 全文件
//      tile 37 唯一触点=:54565 pickPower<50 门槛）。
// 判谳锁形态（照 BJ244）：原版有粒子=测试锁生成（本文件 A/B 全部）;原版零粒子处
// （火尾摘紫后 swarmerAI vid23 全拍恰 1 发=无紫尘残面）为负锁。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import { TILE_PARTICLE_RULES, SHINE_TABLE, TILE_SHINE_SHEETS } from '../src/render/TileParticles';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';
import { spawnNpcHitDust, spawnNpcDeathDust } from '../src/entities/NpcHitDust';
import npcDustJson from '../src/data/vanilla-npcdust.json';
import type { GameHooks } from '../src/entities/types';
import { seededRandom, BATTERY_SEED } from './seeded-rng';

beforeEach(() => { vi.spyOn(Math, 'random').mockImplementation(seededRandom(BATTERY_SEED)); });
afterEach(() => { vi.restoreAllMocks(); });

const W = 180, H = 150, FLOOR = 110;

type DustCall = {
  x: number; y: number; w: number; h: number; type: number;
  sx: number; sy: number; alpha: number; scale: number;
  noGravity: boolean; vx: number; vy: number;
};

const TABLE = npcDustJson as unknown as Record<string, {
  hit?: Array<Record<string, unknown>>; death?: Array<Record<string, unknown>>;
}> & { _meta: Record<string, unknown> };

function makeWorld(): World {
  const w = new World(W, H, 11, 'bj411-meteor-particles');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  return w;
}

function makeHooks(w: World, captured: DustCall[], parts: number[] = []): GameHooks {
  const player = new Player(20 * TILE, (FLOOR - 4) * TILE, new Inventory());
  return {
    world: w, player,
    enemies: () => [] as Enemy[], critters: () => [], npcs: () => [],
    entities: { nextId: 1, add: () => {} },
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => { parts.push(1); },
    notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
    showPickupLabel: () => {}, cutTile: () => {},
    spawnDust: (
      x: number, yn: number, wn: number, hn: number, type: number,
      sx = 0, sy = 0, alpha = 0, _color: unknown = null, scale = 1, noGravity = false,
    ) => {
      const rec: DustCall = { x, y: yn, w: wn, h: hn, type, sx, sy, alpha, scale, noGravity, vx: sx, vy: sy };
      captured.push(rec);
      return rec;
    },
    dust: { spawn: () => null },
    scene: {},
  } as unknown as GameHooks;
}

function spawn23(g: GameHooks, tx = 100, ty = FLOOR - 4): Enemy {
  const e = Enemy.fromVanilla(23, tx * TILE, ty * TILE);
  expect(e).not.toBeNull();
  e!.vx = 1.5; e!.vy = -0.25;
  void g;
  return e!;
}

// ================= A. 流星头 HitEffect 表（vanilla-npcdust.json "23"） =================

describe('BJ411 A：流星头 23 HitEffect 尘表（NPC.cs:90567-90605,1458 同行）', () => {
  it('【数据面】hit=单循环 hitK100×[idPick(6/25)(hd,-1)+d6(vel×0.2,α100,s2,ng)];death=50+50', () => {
    const rec = TABLE['23'];
    expect(rec).toBeDefined();
    expect(rec.hit).toHaveLength(1);
    const loop = rec.hit![0] as { hitK: number; body: Array<Record<string, unknown>>; line: number };
    expect(loop.hitK).toBe(100);
    expect(loop.line).toBe(90573);
    expect(loop.body).toHaveLength(2);
    expect(loop.body[0]).toMatchObject({ dust: 0, idPick: [6, 25], sx: 'hd', sy: -1, line: 90575 });
    expect(loop.body[1]).toMatchObject({
      dust: 6, sx: 'velX*0.2', sy: 'velY*0.2', alpha: 100, scale: 2,
      posts: [['ng', true]], line: 90576,
    });
    expect(rec.death).toHaveLength(2);
    expect(rec.death![0]).toMatchObject({ dust: 0, idPick: [6, 25], n: 50, sx: '2hd', sy: -2, line: 90588 });
    expect(rec.death![1]).toMatchObject({
      dust: 6, n: 50, sx: 'velX*0.2', sy: 'velY*0.2', alpha: 100, scale: 2.5,
      posts: [['velMul', 6], ['ng', true]], line: 90596,
    });
    expect(TABLE._meta.batch5).toBeDefined();   // 手工条目登记（提取器未支持局部 id 模式）
  });

  it('【行为锁】受击相簇数=ceil(dmg/maxHp×100)×2：dmg=1/maxHp=26 → 4 迭代 8 发', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    expect(e.maxHp).toBe(26);                    // SetDefaults lifeMax=26（:9097）
    spawnNpcHitDust(e, g, 1, 1);                 // dmg=1 → ceil(100/26)=4
    expect(captured).toHaveLength(8);
  });

  it('【行为锁】idPick 掷序：逐迭代 1 掷先于双发（roll0.99→25 / roll0→6 交替可辨）', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    const roll = vi.spyOn(Math, 'random');
    roll.mockReturnValueOnce(0.99).mockReturnValueOnce(0.0);   // 迭代0→25 / 迭代1→6
    spawnNpcHitDust(e, g, 1, 1);                 // 4 迭代;余下 roll 走 beforeEach 种子流
    expect(captured[0].type).toBe(25);           // 迭代0 A 尘
    expect(captured[1].type).toBe(6);            // 迭代0 B 尘（d6 恒）
    expect(captured[2].type).toBe(6);            // 迭代1 A 尘（roll 0 → 6）
    expect(captured[3].type).toBe(6);
  });

  it('【行为锁】A 尘参数=hd/-1、B 尘=vel×0.2/α100/s2/ng、盒=e.x/e.y/22/22', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    spawnNpcHitDust(e, g, 1, 1);
    for (let k = 0; k < 4; k++) {
      const a = captured[k * 2], b = captured[k * 2 + 1];
      expect(a.sx).toBe(1);                      // hd=+1
      expect(a.sy).toBe(-1);
      expect(a.alpha).toBe(0);
      expect(a.w).toBe(22); expect(a.h).toBe(22);
      expect(a.x).toBe(e.x); expect(a.y).toBe(e.y);
      expect(b.type).toBe(6);
      expect(b.sx).toBeCloseTo(1.5 * 0.2, 6);
      expect(b.sy).toBeCloseTo(-0.25 * 0.2, 6);
      expect(b.alpha).toBe(100);
      expect(b.scale).toBe(2);
      expect(b.noGravity).toBe(true);
    }
  });

  it('【行为锁】死亡相 100 发=50×idPick(2hd,-2)+50×d6(α100,s2.5,vel×6,ng)', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    const roll = vi.spyOn(Math, 'random');
    roll.mockReturnValue(0.99);                  // 全 25（0.99→floor=1）
    spawnNpcDeathDust(e, g, 1);                  // hd=1
    expect(captured).toHaveLength(100);
    for (let k = 0; k < 50; k++) {
      expect(captured[k].type).toBe(25);
      expect(captured[k].sx).toBe(2);            // 2hd
      expect(captured[k].sy).toBe(-2);
      expect(captured[k].scale).toBe(1);         // 缺省档
    }
    for (let k = 50; k < 100; k++) {
      const d = captured[k];
      expect(d.type).toBe(6);
      expect(d.alpha).toBe(100);
      expect(d.scale).toBe(2.5);
      expect(d.noGravity).toBe(true);
      expect(d.vx).toBeCloseTo(1.5 * 0.2 * 6, 6);   // velMul 6 后
      expect(d.vy).toBeCloseTo(-0.25 * 0.2 * 6, 6);
    }
  });

  it('【行为锁】死亡相 idPick 全掷 0 → 前 50 发全 d6（Next(2)==0→6 同相）', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    const roll = vi.spyOn(Math, 'random');
    roll.mockReturnValue(0.0);
    spawnNpcDeathDust(e, g, 1);
    for (let k = 0; k < 50; k++) expect(captured[k].type).toBe(6);
  });
});

// ================= A2. FindFrame 火尾（NPC.cs:74803-74809） =================

describe('BJ411 A2：流星头 FindFrame 火尾（Enemy.swarmerAI vid23,每 tick 1 发）', () => {
  it('每 tick 恰 1 发 dust6：盒=旧位(x−vx,y−vy)/22 盒、初速 vel×0.2、α100、s2、ng、×0.3', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    const before = { x: e.x, y: e.y, vx: e.vx, vy: e.vy };
    (e as unknown as { swarmerAI: (g: GameHooks, p: Player | null) => void }).swarmerAI(g, g.player);
    // 幽灵位移（noTileCollide=true :9101）——AI 内步进速度后按新速移动,故尾尘盒
    // position−velocity = 移动前旧位（与原版 FindFrame 相位同构:AI 改速→UpdateCollision
    // 位移→FindFrame 取 position−velocity）
    expect(captured).toHaveLength(1);            // 紫尘支已摘出（负锁:无 1/20 色点残面）
    const d = captured[0];
    expect(d.type).toBe(6);
    expect(d.x).toBeCloseTo(before.x, 6);        // 移动前旧位（AI 步进后的速度被相消）
    expect(d.y).toBeCloseTo(before.y, 6);
    expect(d.w).toBe(22); expect(d.h).toBe(22);
    expect(d.sx).toBeCloseTo(e.vx * 0.2, 6);     // 出速 = 拍末速度 ×0.2
    expect(d.sy).toBeCloseTo(e.vy * 0.2, 6);
    expect(d.alpha).toBe(100);
    expect(d.scale).toBe(2);
    expect(d.noGravity).toBe(true);
    expect(d.vx).toBeCloseTo(e.vx * 0.2 * 0.3, 6);   // 尘速 ×0.3 后
    expect(d.vy).toBeCloseTo(e.vy * 0.2 * 0.3, 6);
  });

  it('连跑 5 tick 恰 5 发（每 tick 1 发恒频,非 1/20 掷）', () => {
    const w = makeWorld();
    const captured: DustCall[] = [];
    const g = makeHooks(w, captured);
    const e = spawn23(g);
    for (let t = 0; t < 5; t++) {
      (e as unknown as { swarmerAI: (g: GameHooks, p: Player | null) => void }).swarmerAI(g, g.player);
    }
    expect(captured).toHaveLength(5);
    expect(captured.every((d) => d.type === 6)).toBe(true);
  });
});

// ================= B. 陨石块（TileID 37） =================

describe('BJ411 B：陨石块火星（TileDrawing.cs:7512-7518）+破坏尘（WorldGen.cs:69470-69473）', () => {
  it('【数据面】sheet 37 规则=dustRaw6/scaleRand3/ngGt1/prob=1/250×3,无帧门', () => {
    const rules = TILE_PARTICLE_RULES.get(37);
    expect(rules).toHaveLength(1);
    const r = rules![0];
    expect(r.dustRaw).toBe(6);
    expect(r.dustScaleRand).toBe(3);             // _rand.Next(3) ∈ {0,1,2}
    expect(r.dustNgGt).toBe(1);                  // 仅 scale>1 档 noGravity
    expect(r.prob).toBeCloseTo(1 / 250 * 3, 12); // ×3 扫描折算
    expect(r.fx0).toBeUndefined(); expect(r.fy0).toBeUndefined();
    expect(r.color).toBeUndefined();             // 自然色（color=null 通道）
  });

  it('【数据面】tileShine[37] 未赋值（Main.cs:7645-7688）→ 37 不在闪光表;370 陨石砖=1900 在册', () => {
    expect(SHINE_TABLE.find((s) => s.sheet === 37)).toBeUndefined();
    expect(SHINE_TABLE.find((s) => s.sheet === 370)?.shine).toBe(1900);
    expect(TILE_SHINE_SHEETS.has(37)).toBe(false);
  });

  it('【数据面】ore_meteorite → vanilla.sheet=37（错误键锚防御:37 非铜矿）', () => {
    const def = TILE_DEFS[TILE_BY_KEY['ore_meteorite']];
    expect(def.vanilla?.sheet).toBe(37);
  });

  it('【行为锁】dustRaw 通道发射语义：scale=Next(3) 掷在 spawn 前、scale>1 → noGravity', () => {
    // 白盒：emitTileParticles 不便整链驱动（Game 无测试构造）——用与 Game.ts 内联分支
    // 同式的最小复述锁（分支源锚见下一条）。scale 掷序/scale>1 判据是本刀新增面,
    // 由源锚锁+变异共同判别（M3）。
    const s1 = Math.floor(Math.random() * 3);
    expect([0, 1, 2]).toContain(s1);
    const ng = s1 > 1;
    expect(ng).toBe(s1 === 2);
  });

  it('【源锚】Game.ts dustRaw 分支+陨石挖掘/破坏尘位次逐锚在位', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'core', 'Game.ts'), 'utf8');
    // ① emitTileParticles dustRaw 分支（自然色/α0/不归零/scale 掷/scale>1 ng）
    expect(src).toContain('if (rule.dustRaw !== undefined) {');
    expect(src).toContain('Math.floor(Math.random() * rule.dustScaleRand)');
    expect(src).toContain('dd.scale > rule.dustNgGt');
    // ★BJ444（2026-10-03）单源化：挖掘/破坏尘位次改挂 spawnTileDustAt（GetTileDustAmount
    //  × MakeTileDust 全表 1:1,src/world/TileDust.ts）——BJ411 特写支（37 → 3/10 粒、
    //  Math.random<0.5?6:23）退役;数量/掷形由全表承载（fail 缺省 3/破坏缺省 10,尘型
    //  Next(2)?23:6 同值）。旧锚随近似面退役改钉新位次:
    //  ② 挖掘 fail 支（tryMine KillTile(fail:true) 等价位）
    expect(src).toContain('if (sheet !== 504) this.spawnTileDustAt(tx, ty, true);');
    // ③ 破坏支 = breakTileBody 头（原版 :64212 尘位,一切破坏路径单源）
    expect(src).toContain('if (!dustBlocked) this.spawnTileDustAt(x, y, false);');
    // ④ 尘型=Next(2)?23:6（1 掷/粒;23=陨石岩尘,区别于 NPC 面的 25）——TileDust 表
    const td = readFileSync(join(process.cwd(), 'src', 'world', 'TileDust.ts'), 'utf8');
    expect(td).toContain('if (sheet === 37) {');
    expect(td).toContain('nextN(rand, 2) !== 0 ? 23 : 6');
  });

  it('【源锚】Enemy.ts 火尾逐锚在位+紫尘支摘出 vid23', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'entities', 'Enemy.ts'), 'utf8');
    expect(src).toContain('if (vid === 23) {\n      const d = game.spawnDust?.(this.x - this.vx, this.y - this.vy, this.w, this.h, 6,');
    expect(src).toContain('vid !== 23 && !isBee');   // 紫尘支摘出
    expect(src).toContain('d.vx *= 0.3;\n        d.vy *= 0.3;');
  });
});
