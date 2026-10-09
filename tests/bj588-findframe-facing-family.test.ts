// ★BJ588（2026-10-09）FindFrame 死区档 spriteDirection 写点族收编——BJ581 销案连带
// 新债（蜜蜂 210/211 真缺面）+ BJ584 债扩面（地狱蝠案组→15 型大案组）落刀。
//
// 定谳（Terarria1457 亲读，唯一标杆；Terarria1456 交叉=零漂移）：
//  · FindFrame case 组 48/49/51/60/82/93/137/182/210/211/253/316/634/662/664 连排
//    （NPC.cs:75620-75681）：spriteDirection = sign(vx)【死区档】（:75648-75655 if/if
//    ——vx==0 不写=保前值，字段缺省 -1 ≙ Entity 缺省 :6522）+ rotation = vx×0.1
//    （:75656）；蜂 210/211 覆写 rotation = vx×0.2 + frameCounter 双加（:75657-75660，
//    帧 2 倍速）;帧推进 num296=6（:75663）/Harpy 48=5（:75671）/49|51|60|634 循环
//    掐掉末帧（:75665-75667）。
//  · AI 侧全零写点（逐型亲读）：batAI（AI_014 :22938-23462）/ghostAI（AI_022
//    :24729-25054）/AI_122（:45329-45611，仅写 direction :45585-45592 if/if 死区档，
//    与 spriteDirection 两字段）——显示面唯一来源=本 FindFrame 组。
//    ⇒ facing（=原版 direction，batAI 撞墙反弹/失靶滑行、ghostAI 探针列消费）
//    不可代位显示面 → 独立字段 Enemy.ffSdir（缺省 -1）+ drawEnemy ffSdirMirror 门
//    （==1 镜像 ≙ Main.cs:23357-23361）。
//  · 债形态（收编前）：蜂 210/211 全仓零 sdir 写点 + 渲染走通用 facing 门（缺省 1）
//    = 恒镜像面（BJ581 案组登记）；蝙蝠 7 型/幽灵 4 型/662 rotation=vx×0.1 零消费门
//    = 零倾斜；664 走通用 facing 门 = vx==0 拍误翻（rotation-ledger 旧断言钉的近似）。
//  · 662 销案：AI_122 direction 写（facing=vx 符号死区档）本仓已同构；渲染镜像改由
//    ffSdir 承载（同值同拍）。
//  · 帧引擎既有档（BAT_SKIP_LAST/6t 推进）已同构——Harpy 5t 档/蜂 2 倍速帧登记
//    同域新债（见报告），不在本刀强扩。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Enemy, FF_VXSDIR_GROUP } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';

const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const npc1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8');
const npc1456 = readFileSync(join(ROOT, '../Terarria1456/Terraria/NPC.cs'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');

const GROUP = [48, 49, 51, 60, 82, 93, 137, 182, 210, 211, 253, 316, 634, 662, 664];
const BEES = [210, 211];

// ---------------------------------------------------------------------------
// 原版活体锚（Terarria1457 源码直读，原版语义漂移即爆红）
// ---------------------------------------------------------------------------
/** FindFrame case 组连排提取（组内 case 行间仅允许空白，BJ581 同款提取器） */
function vanillaGroup(src: string): { labels: string[]; body: string } {
  const head = GROUP.slice(0, 5).map((n) => `case ${n}:`).join('\n\t\t');
  const start = src.indexOf(`\t\t${head}`);
  if (start < 0) return { labels: [], body: '' };
  const headSeg = src.slice(start, start + 500);
  const labels: string[] = [];
  let last = 0;
  for (const m of headSeg.matchAll(/case (\d+):/g)) {
    const gap = headSeg.slice(last, m.index ?? 0);
    if (labels.length > 0 && !/^\s*$/.test(gap)) break;
    labels.push(m[1]);
    last = (m.index ?? 0) + m[0].length;
  }
  const end = src.indexOf('\t\tcase 330:', start);
  return { labels, body: src.slice(start, end < 0 ? start + 4000 : end) };
}

describe('BJ588 原版 FindFrame 死区档大案组活体锚（1457）', () => {
  const g1457 = vanillaGroup(npc1457);

  it('15 型连排 case 组钉值（48/49/51/60/82/93/137/182/210/211/253/316/634/662/664）', () => {
    expect(g1457.labels).toEqual(GROUP.map(String));
  });

  it('死区档形貌：if/if 双态（vx==0 不写=保前值）+ rotation=vx×0.1 全组', () => {
    expect(g1457.body).toMatch(
      /if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.1f;/,
    );
  });

  it('蜂 210/211 覆写：frameCounter 双加 + rotation=vx×0.2（其余 13 型 0.1）', () => {
    expect(g1457.body).toMatch(
      /if \(type == 210 \|\| type == 211\)\s*\{\s*frameCounter\+\+;\s*rotation = velocity\.X \* 0\.2f;\s*\}\s*frameCounter\+\+;/,
    );
    expect(g1457.body.match(/rotation = velocity\.X \* 0\.2f;/g)?.length).toBe(1);
  });

  it('帧推进档：num296=6 / 49|51|60|634 末帧掐掉 / Harpy 48 阈 5', () => {
    expect(g1457.body).toMatch(/int num296 = 6;\s*int num297 = Main\.npcFrameCount\[type\];/);
    expect(g1457.body).toMatch(/if \(type == 49 \|\| type == 51 \|\| type == 60 \|\| type == 634\)\s*\{\s*num297--;\s*\}/);
    expect(g1457.body).toMatch(/if \(type == 48\)\s*\{\s*num296 = 5;\s*\}/);
  });

  it('60 地狱蝠尘（dust 6 无重力）/634 孢子蝠尘（dust 165）同组内', () => {
    expect(g1457.body).toMatch(/if \(type == 60\)\s*\{\s*int num\d+ = Dust\.NewDust/);
    expect(g1457.body).toMatch(/if \(type == 634 && Main\.rand\.Next\(10\) == 0\)/);
  });
});

describe('BJ588 1456↔1457 交叉：死区档零漂移', () => {
  it('1456 同组 15 型连排 + if/if 死区档 + 0.1/0.2 全同（BJ581 AI_005 三元判例不适用于本组）', () => {
    const g1456 = vanillaGroup(npc1456);
    expect(g1456.labels).toEqual(GROUP.map(String));
    expect(g1456.body).toMatch(
      /if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.1f;/,
    );
    expect(g1456.body).toMatch(/if \(type == 210 \|\| type == 211\)\s*\{\s*frameCounter \+= 1\.0;\s*rotation = velocity\.X \* 0\.2f;/);
  });
});

describe('BJ588 原版 AI 侧零写点锚（显示面唯一来源=FindFrame 组）', () => {
  /** SetDefaults `else if (type == N)` 块内 aiStyle 提取（块界=下一个 else if） */
  function vanillaAiStyle(src: string, id: number): number | null {
    const marker = src.indexOf(`else if (type == ${id})\n\t\t{`);
    if (marker < 0) return null;
    const next = src.indexOf('\n\t\telse if (type ==', marker + 1);
    const body = src.slice(marker, next < 0 ? marker + 800 : next);
    const m = body.match(/aiStyle = (\d+);/);
    return m ? Number(m[1]) : null;
  }

  it('15 型 aiStyle 钉值（14 蝙蝠×7 / 22 幽灵×4 / 5 蜂×2 / 122 海盗幽灵 / 0 火把神）', () => {
    const expectAi: Record<number, number | null> = {
      48: 14, 49: 14, 51: 14, 60: 14, 93: 14, 137: 14, 634: 14,
      82: 22, 182: 22, 253: 22, 316: 22,
      210: 5, 211: 5, 662: 122, 664: null,   // 664 块仅 lifeMax/boss——aiStyle 缺省 0
    };
    for (const [id, ai] of Object.entries(expectAi)) {
      expect(vanillaAiStyle(npc1457, Number(id)), `type ${id} aiStyle`).toBe(ai);
    }
  });

  it('AI_122（662 海盗幽灵）方法体（:45329-45456）零 spriteDirection/rotation/direction 写点', () => {
    const start = npc1457.indexOf('\tpublic void AI_122_PirateGhost()');
    expect(start, 'AI_122 定位').toBeGreaterThan(0);
    const end = npc1457.indexOf('\tpublic ', start + 10);
    const body = npc1457.slice(start, end);
    expect(body).toContain('vector.Length() < 50f');   // 662 逐斥段（本仓 pirateGhostAI 同构段）
    expect(body.match(/spriteDirection/g) ?? []).toEqual([]);
    expect(body.match(/\.rotation/g) ?? []).toEqual([]);
    expect(body.match(/\bdirection\b/g) ?? []).toEqual([]);
  });

  it('DrawNPC 翻面门：spriteDirection == 1 → FlipHorizontally（本仓 ffSdir 门的原文锚）', () => {
    expect(mainSrc).toContain('if (rCurrentNPC.spriteDirection == 1)');
  });
});

// ---------------------------------------------------------------------------
// 本仓落刀锚（任何一侧漂移即爆红）
// ---------------------------------------------------------------------------
describe('BJ588 本仓 Enemy 落刀锚', () => {
  it('FF_VXSDIR_GROUP 单源表 = 15 型钉值（导出，Renderer 同源消费）', () => {
    // ★BJ590 族表扩容 +7（121/150/151/152/158/226/660 同 sign(vx) 死区档形态并入,
    //   NPC.cs:75582-75619+74826-74834 亲读）——BJ588 15 型本体不动,扩容见
    //   tests/bj590-findframe-tail-dust-frames.test.ts
    expect([...FF_VXSDIR_GROUP].sort((a, b) => a - b))
      .toEqual([...GROUP, 121, 150, 151, 152, 158, 226, 660].sort((a, b) => a - b));
  });

  it('ffSdir 字段缺省 -1（≙ 原版 Entity.spriteDirection 缺省 :6522）', () => {
    expect(enemySrc).toMatch(/ffSdir = -1;/);
    const e = Enemy.fromVanilla(49, 40 * TILE, 57 * TILE);
    expect(e!.ffSdir).toBe(-1);
  });

  it('findFrameRotation 族支：FF_VXSDIR_GROUP 门 + if/if 死区档 + 0.1/蜂 0.2', () => {
    expect(enemySrc).toMatch(/\} else if \(FF_VXSDIR_GROUP\.has\(vid\)\) \{/);
    expect(enemySrc).toMatch(
      /if \(this\.vx > 0\) this\.ffSdir = 1;\s*else if \(this\.vx < 0\) this\.ffSdir = -1;\s*this\.visAngle = this\.vx \* 0\.1;\s*if \(vid === 210 \|\| vid === 211\) this\.visAngle = this\.vx \* 0\.2;/,
    );
  });

  it('batAI/ghostAI 的 facing=direction 语义原样（双责字段不被显示面污染）', () => {
    expect(enemySrc).toMatch(/this\.facing = dirX;/);                       // batAI TargetClosest
    expect(enemySrc).toMatch(/this\.facing = this\.seekDirX\(player\);\s*this\.dirY = player\.cy > this\.cy \? 1 : -1;/);  // ghostAI 锚点支
  });

  it('662 销案锚：pirateGhostAI direction 写（≙ AI_122 :45585-45592 if/if 死区档）原样', () => {
    expect(enemySrc).toMatch(/if \(this\.vx !== 0\) this\.facing = this\.vx > 0 \? 1 : -1;/);
  });
});

describe('BJ588 本仓 Renderer 落刀锚', () => {
  it('FF_VXSDIR_GROUP 单源导入 + ffSdirMirror 门 + ==1 翻转行（≙ Main.cs:23357-23361）', () => {
    expect(rendererSrc).toMatch(/import \{ FF_VXSDIR_GROUP \} from '\.\.\/entities\/Enemy';/);
    expect(rendererSrc).toMatch(/const ffSdirMirror = FF_VXSDIR_GROUP\.has\(idR\);/);
    expect(rendererSrc).toMatch(
      /if \(!rotationDriven && !slimeNoMirror && !ffSdirMirror && !owlMirror && !sdirNeg && !ravenMirror && !wormMirror && !snailMirror && !fairyMirror && !revFlipMirror && !eyeMirrorByVx && e\.facing > 0\) ctx\.scale\(-1, 1\);/,
    );
    expect(rendererSrc).toMatch(/if \(ffSdirMirror && e\.ffSdir === 1\) ctx\.scale\(-1, 1\);/);
  });

  it('旋转消费门：aiStyle14 族支 + aiStyle122 支 + 664 id 支（均 rotate(e.visAngle)）', () => {
    expect(rendererSrc).toMatch(/else if \(stR === 14 && FF_VXSDIR_GROUP\.has\(idR\)\) ctx\.rotate\(e\.visAngle\);/);
    expect(rendererSrc).toMatch(/else if \(stR === 122\) ctx\.rotate\(e\.visAngle\);/);
    expect(rendererSrc).toMatch(/else if \(idR === 664\) ctx\.rotate\(e\.visAngle\);/);
  });

  it('aiStyle22 既有支覆盖 82/182/253/316（rotate(e.visAngle)，零改动消费）', () => {
    expect(rendererSrc).toMatch(/else if \(stR === 22\) ctx\.rotate\(e\.visAngle\);/);
  });

  it('蜂 210/211 rotation 销案锚：aiStyle5 支 rotate(e.vx*0.2) 原样（BJ581 批既有消费）', () => {
    expect(rendererSrc).toMatch(/else if \(id5 === 210 \|\| id5 === 211\) ctx\.rotate\(e\.vx \* 0\.2\);/);
  });

  it('FF 组与 SLIME_NO_MIRROR（BJ584 从不镜像族）零交集——本族=随 vx 有态镜像族', () => {
    for (const id of GROUP) {
      expect(Renderer.SLIME_NO_MIRROR.has(id), `${id} 不入从不镜像表`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 行为级逐拍采样（活体判别面）
//  · 蜂 210/211（全链 swarmerAI→findFrameRotation）：死区档 + ×0.2 + 「AI 不写
//    facing、显示面随 ffSdir 翻转」= 恒镜像面翻正核心钉。
//  · 地狱蝠 60（全链 batAI→findFrameRotation）：玩家在右/AI direction=1 与
//    vx<0 并存拍——facing=1（AI 向）与 ffSdir=-1（显示面朝左）并存 = 原版两字段像。
//  · 其余 13 型：findFrameRotation 直驱（层为纯 vx 函数）+ drawEnemy 假体断
//    rotate/flip 消费门。
// ---------------------------------------------------------------------------
const W = 200, H = 80, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 23, 'bj588-ffsdir');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  w.groundLevel = FLOOR - 2;
  w.rockLevel = FLOOR + 8;
  return w;
}

function makeGame(w: WorldT): GameHooks {
  return {
    world: w, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (...a: unknown[]) => void>)[fn];

/** 玩家桩（swarmerAI 8px 量化同格 → dist≈0 → 期望速度=当前速度；batAI/ghostAI 读 cx/cy/dead） */
function playerStub(cx: number, cy: number): Record<string, unknown> {
  return { cx, cy, dead: false, stealth: 0, itemAnimTicks: 0, useTime: 0 };
}

/** drawEnemy 记录型假体（rotation-ledger 同款） */
function drawWithFake(e: Enemy, w: WorldT, rect = { sw: 8, sh: 8 }): Array<{ m: string; a: unknown[] }> {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'canvas' ? undefined : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
  });
  const rectStub = { img: { width: rect.sw, height: rect.sh }, sx: 0, sy: 0, sw: rect.sw, sh: rect.sh };
  const fake = {
    ctx,
    assets: { enemySprites: new Map() },
    atlas: { vnpc: () => rectStub, ensureVImage: () => null, vmisc: () => null },
    drawNpcGlow: () => {},
    npcWhiteLiftQueue: [] as unknown[],
  };
  (Renderer.prototype as unknown as { drawEnemy: (this: unknown, e: Enemy, w: WorldT) => void })
    .drawEnemy.call(fake, e, w);
  return calls;
}
const rotOf = (calls: Array<{ m: string; a: unknown[] }>) => calls.find((c) => c.m === 'rotate');
const flips = (calls: Array<{ m: string; a: unknown[] }>) =>
  calls.filter((c) => c.m === 'scale' && (c.a as number[])[0] === -1 && (c.a as number[])[1] === 1);

describe('BJ588 行为级：蜂 210/211 恒镜像面翻正（全链逐拍）', () => {
  for (const vid of BEES) {
    it(`vid ${vid}：死区档 + 显示面随 ffSdir（AI 不写 facing）+ rotation=vx×0.2`, () => {
      const w = makeWorld();
      const game = makeGame(w);
      const e = Enemy.fromVanilla(vid, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error(`fromVanilla(${vid}) 失败`);
      const p = playerStub(e.cx, e.cy);   // 同格：期望速度=当前速度（滑行不转向）

      // 出生态：ffSdir=-1（≙ 原版字段缺省）；facing 缺省 1（收编前唯一镜像输入=恒翻=债本体）
      expect(e.ffSdir).toBe(-1);
      expect(e.facing).toBe(1);

      // 拍1：vx=+0.5 全链 → 右飞
      e.vx = 0.5;
      drive(e, 'swarmerAI').call(e, game, p);
      expect(e.vx, '同格滑行保号').toBeGreaterThan(0);
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(1);
      expect(e.visAngle).toBeCloseTo(e.vx * 0.2, 5);

      // 拍2：AI 后速度归零（撞墙清速形态）→ 死区档保前值 1（M1 判别：三元写会落 -1）
      e.vx = 0;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir, 'vx==0 死区档保前值').toBe(1);
      expect(e.visAngle).toBe(0);

      // 拍3：vx=-0.5 全链 → 左飞翻面（复报判别：镜像变号）
      e.vx = -0.5;
      drive(e, 'swarmerAI').call(e, game, p);
      expect(e.vx).toBeLessThan(0);
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);
      expect(e.visAngle).toBeCloseTo(e.vx * 0.2, 5);

      // 拍4：死区档再保前值 -1
      e.vx = 0;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);

      // 全链 AI 从不写 facing（债形态钉：facing 恒缺省 1，若镜像仍走 facing 门=恒翻）
      expect(e.facing).toBe(1);

      // 渲染消费：ffSdir=1 → 翻；ffSdir=-1 → 不翻（旋 visAngle 已在拍1/3 断）
      e.ffSdir = 1; e.visAngle = 0.1;
      expect(flips(drawWithFake(e, w)).length, 'ffSdir==1 → 翻').toBe(1);
      e.ffSdir = -1;
      expect(flips(drawWithFake(e, w)).length, 'ffSdir==-1 → 原生').toBe(0);
    });
  }
});

describe('BJ588 行为级：地狱蝠 60 两字段分离（全链逐拍）', () => {
  it('玩家在右（AI direction=1）× vx<0 拍：facing=1 不动、ffSdir=-1 朝左 + rotate(vx×0.1)', () => {
    const w = makeWorld();
    const game = makeGame(w);
    const e = Enemy.fromVanilla(60, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(60) 失败');
    const p = playerStub(e.cx + 300, e.cy);   // 玩家在右 → dirX=1

    e.vx = -0.5;   // 击退/漂移向左
    drive(e, 'batAI').call(e, game, p);
    expect(e.facing, 'AI direction 随目标（原版 direction 语义,FindFrame 不触）').toBe(1);
    expect(e.vx, '单拍步进 0.1/0.1 不足翻号').toBeLessThan(0);
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir, '显示面=sign(vx) 死区档（:75648-75655）').toBe(-1);
    expect(e.visAngle).toBeCloseTo(e.vx * 0.1, 5);
    // 渲染：不翻（原生朝左）+ 倾斜——收编前此形态走通用 facing 门=翻（背朝行进向）
    const calls = drawWithFake(e, w);
    expect(flips(calls).length, 'vx<0 拍原生朝向').toBe(0);
    expect((rotOf(calls)!.a as number[])[0]).toBeCloseTo(e.visAngle, 5);

    // 变号拍：vx>0 → ffSdir=1 → 翻（facing 仍 1——两字段脱钩）
    e.vx = 0.5;
    drive(e, 'batAI').call(e, game, p);
    drive(e, 'findFrameRotation').call(e);
    expect(e.facing).toBe(1);
    expect(e.ffSdir).toBe(1);
    expect(flips(drawWithFake(e, w)).length, 'vx>0 拍翻面').toBe(1);
  });
});

describe('BJ588 行为级：13 非蜂型 rotation=vx×0.1 族锁 + 死区档（findFrameRotation 直驱）', () => {
  const nonBee = GROUP.filter((id) => !BEES.includes(id));
  for (const vid of nonBee) {
    it(`vid ${vid}：vx=±0.25 → visAngle=±0.025 / ffSdir=±1；vx=0 → 死区保前值`, () => {
      const e = Enemy.fromVanilla(vid, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error(`fromVanilla(${vid}) 失败`);
      e.vx = 0.25;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(1);
      expect(e.visAngle).toBeCloseTo(0.025, 5);
      e.vx = -0.25;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);
      expect(e.visAngle).toBeCloseTo(-0.025, 5);
      e.vx = 0;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir, '死区档保前值').toBe(-1);
      expect(e.visAngle).toBe(0);
    });
  }
});

describe('BJ588 行为级：幽灵 82（aiStyle22）渲染消费门', () => {
  it('rotate(e.visAngle) + ffSdir 镜像（stR===22 既有支零改动收编）', () => {
    const w = makeWorld();
    const e = Enemy.fromVanilla(82, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(82) 失败');
    e.vx = 0.4;
    drive(e, 'findFrameRotation').call(e);
    const calls = drawWithFake(e, w);
    expect((rotOf(calls)!.a as number[])[0], 'stR22 支 rotate(visAngle)').toBeCloseTo(0.04, 5);
    expect(flips(calls).length, 'ffSdir==1 → 翻').toBe(1);
    e.vx = -0.4;
    drive(e, 'findFrameRotation').call(e);
    expect(flips(drawWithFake(e, w)).length, 'ffSdir==-1 → 原生').toBe(0);
  });
});
