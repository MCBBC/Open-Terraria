// ★C12（2026-10-11）NPC/演出域清偿——红蓝 R11 findings F1-F5 落刀判别锁。
//
// 定谳（Terarria1457 亲读,唯一标杆）：
//  · F1 558-560 埃特尼亚飞龙：FindFrame case 558-560（NPC.cs:68609-68645）sdir=sign(vx)
//    if/if 死区档（:68613-68618）+ rotation 双档（:68619-68626:ai[0]==2 → 速度角折叠
//    ToRotation,vx<0 再 +π;余 → vx×0.1）。AI_108 层 :66279 sdir=−sign(vx)/:66120
//    rotation=ToRotation 每拍被 FindFrame 覆写（FindFrame 在 AI 后 :91626）——本仓只搬
//    AI 层（facing=−sign(vx)）→ 显示面 flip⟺vx<0 = 反极性（原版 flip⟺sdir==1⟺vx>0）。
//    修=findFrameRotation 增专属支（ffSdir 死区档+rotation 双档）+渲染 ffSdirMirror 门
//    （含残影 gMirror）——AI 层原样（撞墙反弹逻辑域,BJ588 两字段判例）。
//  · F2 574/575 小妖魔滑翔怪：case 574/575（:68661-68668）sdir=sign(vx) 死区档并入
//    ffSdir 单源;口部尘锚 vector4（:68687,消费 :68663-68668 刚写的 sdir）随单源对齐。
//  · F3 死区档同形漏网四面：330 骚灵（:75685-75691,sdir 缺/rotation=vx×0.15 已接）、
//    224+587 飞鱼（:75559-75568,sdir 缺/rotation=±vy×0.2 已接）、612+613 水黾
//    （:70578-70580,vx≠0 门 Math.Sign(vx)）、423 进化兽（:71342-71344,【反极性形】
//    Math.Sign(−vx)）——R11 U2（419/423/425-429 邻域配对器疑误配）亲读复核后销案：
//    case 423 块 71320-71355 反极性形确认。
//  · F4 墓碑碑文日期 locale：Player.cs:39455-39461——英文文化 ToString("MMMM d, yyy")
//    特例/余文化 ToString("D")（.NET LongDatePattern,带星期与否逐文化）;修前硬编码
//    zh-CN=活动语言无关。
//  · F5 城镇墓碑掷序三方矛盾：原版序=抛币→游走→款式（NPC.cs:79086-79092）;
//    代码结构序=游走→抛币→款式（共享 num 前置计算所钉）;bj587 测试注钉成「BJ562 钉序」
//    同误——双正（结构+注;Math.random 域行为不可观）。玩家面原版序=游走在先
//    （Player.cs:39415）保持。
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Enemy, FF_VXSDIR_EX } from '../src/entities/Enemy';
import { Tombstone, longDate } from '../src/entities/Tombstone';
import { Renderer } from '../src/render/Renderer';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(__dirname, '..');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const tombSrc = readFileSync(join(ROOT, 'src/entities/Tombstone.ts'), 'utf8');
const npc1457 = existsSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const player1457 = existsSync(join(ROOT, '../Terarria1457/Terraria/Player.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/Player.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const mainSrc = existsSync(join(ROOT, '../Terarria1457/Terraria/Main.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)

const EX_IDS = [224, 330, 423, 558, 559, 560, 574, 575, 587, 612, 613];

// ---------------------------------------------------------------------------
// 原版活体锚（1457 FindFrame 方法体逐 case 直读——方法体界定,邻域同名 case 不串）
// ---------------------------------------------------------------------------
const ffStart = npc1457.indexOf('\tpublic void FindFrame()');
const ffEnd = npc1457.indexOf('\n\tpublic ', ffStart + 10);
const ffBody = npc1457.slice(ffStart, ffEnd);

function caseBlock(labels: number[]): string {
  const head = labels.map((n) => `\t\tcase ${n}:`).join('\n');
  const start = ffBody.indexOf(head);
  expect(start, `FindFrame case ${labels.join('/')} 定位`).toBeGreaterThan(0);
  const end = ffBody.indexOf('\n\t\tcase ', start + head.length);
  return ffBody.slice(start, end < 0 ? start + 2000 : end);
}

describe.skipIf(EXT_MISSING)('C12 原版锚：FindFrame 六案组（1457 亲读）', () => {
  it('F1 case 558-560：sdir if/if 死区档 + rotation 双档（ai[0]==2 折叠 ToRotation/余 vx×0.1）', () => {
    const b = caseBlock([558, 559, 560]);
    expect(b).toMatch(
      /if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*float num\d+ = velocity\.ToRotation\(\);/,
    );
    expect(b).toMatch(/if \(velocity\.X < 0f\)\s*\{\s*num\d+ \+= MathF\.PI;\s*\}\s*if \(ai\[0\] != 2f\)\s*\{\s*num\d+ = velocity\.X \* 0\.1f;\s*\}\s*rotation = num\d+;/);
    expect(b).toMatch(/if \(ai\[0\] == 2f\)\s*\{\s*frame\.Y = num \* 4;/);
  });

  it('F2 case 574/575：sdir if/if 死区档（rotation=AngleTowards 速度角,BJ591 已在轨）', () => {
    const b = caseBlock([574, 575]);
    expect(b).toMatch(
      /if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}/,
    );
    expect(b).toMatch(/rotation = rotation\.AngleTowards\(num\d+, 0\.02f\);/);
    expect(b).toMatch(/new Vector2\(56 \* spriteDirection, -30f\)\.RotatedBy\(rotation\)/);   // 口部尘锚消费 sdir
  });

  it('F3 case 330/224·587/612·613/423：sdir 死区档四面（423 反极性形）', () => {
    const b330 = caseBlock([330]);
    expect(b330).toMatch(/spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.15f;/);
    const b224 = caseBlock([224, 587]);
    expect(b224).toMatch(/spriteDirection = 1;\s*rotation = velocity\.Y \* 0\.2f;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*rotation = \(0f - velocity\.Y\) \* 0\.2f;/);
    const b612 = caseBlock([612, 613]);
    expect(b612).toMatch(/if \(velocity\.X != 0f\)\s*\{\s*spriteDirection = Math\.Sign\(velocity\.X\);\s*\}/);
    const b423 = caseBlock([423]);
    expect(b423).toMatch(/if \(velocity\.X != 0f\)\s*\{\s*spriteDirection = Math\.Sign\(0f - velocity\.X\);\s*\}/);   // 反极性（R11 U2 亲读复核）
  });

  it('AI_108 层 sdir=−sign(vx)（:66278-66280）在 AI 方法体内——FindFrame 在 AI 后覆写=债根', () => {
    const aiStart = npc1457.indexOf('\tprivate void AI_108_DivingFlyer()');
    const aiEnd = npc1457.indexOf('\n\tprivate ', aiStart + 10);
    expect(npc1457.slice(aiStart, aiEnd)).toContain('spriteDirection = -Math.Sign(velocity.X);');
    expect(aiStart, 'AI_108 在 FindFrame 前（FindFrame 每拍覆写 AI sdir 写）').toBeLessThan(ffStart);
  });

  it('DrawNPC 翻面门 sdir==1 翻（ffSdir 门原文锚,与 BJ588 同源）', () => {
    expect(mainSrc).toContain('if (rCurrentNPC.spriteDirection == 1)');
  });
});

describe.skipIf(EXT_MISSING)('C12 原版锚：F4/F5 墓碑双面', () => {
  it('F4 Player.DropTombstone：英文特例 "MMMM d, yyy"/余 ToString("D")（:39455-39461）', () => {
    const start = player1457.indexOf('\tpublic void DropTombstone(long coinsOwned');
    const end = player1457.indexOf('\n\tpublic ', start + 10);
    const b = player1457.slice(start, end);
    expect(b).toContain('string text = now.ToString("D");');
    expect(b).toMatch(/GameCulture\.FromCultureName\(GameCulture\.CultureName\.English\)\.IsActive/);
    expect(b).toContain('text = now.ToString("MMMM d, yyy");');
  });

  it('F5 DropTombstoneTownNPC 掷序：抛币 Next(2) → 游走 Next(-35,36) → 款式 Next(6)', () => {
    const start = npc1457.indexOf('\tpublic void DropTombstoneTownNPC(');
    const end = npc1457.indexOf('\n\tpublic ', start + 10);
    const b = npc1457.slice(start, end);
    const iCoin = b.indexOf('Main.rand.Next(2)');
    const iWander = b.indexOf('Main.rand.Next(-35, 36)');
    const iStyle = b.indexOf('Main.rand.Next(6)');
    expect(iCoin, '抛币先').toBeGreaterThan(0);
    expect(iWander, '游走后于抛币').toBeGreaterThan(iCoin);
    expect(iStyle, '款式后于游走').toBeGreaterThan(iWander);
  });
});

// ---------------------------------------------------------------------------
// 本仓落刀锚（任何一侧漂移即爆红）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('C12 本仓锚：Enemy 单源扩面', () => {
  it('FF_VXSDIR_EX 单源表 = 11 型钉值（六案组,与 FF_VXSDIR_GROUP 零交集）', () => {
    expect([...FF_VXSDIR_EX].sort((a, b) => a - b)).toEqual(EX_IDS);
  });

  it('558-560 专属支：ffSdir 死区档 + rotation 双档（ai0==2 折叠/余 vx×0.1）', () => {
    expect(enemySrc).toMatch(
      /} else if \(vid === 558 \|\| vid === 559 \|\| vid === 560\) \{[\s\S]*?if \(this\.vx > 0\) this\.ffSdir = 1;\s*else if \(this\.vx < 0\) this\.ffSdir = -1;\s*if \(this\.ai0 === 2\) this\.visAngle = Math\.atan2\(this\.vy, this\.vx\) \+ \(this\.vx < 0 \? Math\.PI : 0\);\s*else this\.visAngle = this\.vx \* 0\.1;/,
    );
  });

  it('574/575 支：ffSdir 写先于 koboldFlyerFindFrame（≙ 原版 sdir 写先于口部锚消费）', () => {
    expect(enemySrc).toMatch(
      /} else if \(vid === 574 \|\| vid === 575\) \{[\s\S]*?if \(this\.vx > 0\) this\.ffSdir = 1;\s*else if \(this\.vx < 0\) this\.ffSdir = -1;\s*this\.koboldFlyerFindFrame\(game\);/,
    );
  });

  it('330/224·587 既有支补 sdir；612·613/423 专属支（423 反极性档）', () => {
    expect(enemySrc).toMatch(/else if \(vid === 330\) \{[\s\S]*?if \(this\.vx > 0\) this\.ffSdir = 1;[\s\S]*?this\.visAngle = this\.vx \* 0\.15;/);
    expect(enemySrc).toMatch(/if \(this\.vx > 0\) \{ this\.ffSdir = 1; this\.visAngle = this\.vy \* 0\.2; \}\s*else if \(this\.vx < 0\) \{ this\.ffSdir = -1; this\.visAngle = -this\.vy \* 0\.2; \}/);
    expect(enemySrc).toMatch(/else if \(vid === 612 \|\| vid === 613\) \{[\s\S]*?if \(this\.vx !== 0\) this\.ffSdir = this\.vx > 0 \? 1 : -1;/);
    expect(enemySrc).toMatch(/else if \(vid === 423\) \{[\s\S]*?if \(this\.vx !== 0\) this\.ffSdir = this\.vx > 0 \? -1 : 1;/);
  });

  it('口部尘锚单源：koboldFlyerFindFrame 读 ffSdir（旧式 −facing 两面脱钩退役）', () => {
    expect(enemySrc).toMatch(/const sdir = this\.ffSdir;/);
    expect(enemySrc).not.toMatch(/const sdir = -this\.facing;/);
  });

  it('AI 层 facing=−sign(vx) 原样保留（撞墙反弹逻辑域,显示面不随动）', () => {
    const dd2Src = readFileSync(join(ROOT, 'src/entities/bossAI_dd2.ts'), 'utf8');
    expect(dd2Src).toMatch(/if \(sign\(e\.vx\) !== 0\) e\.facing = -sign\(e\.vx\);/);
  });
});

describe.skipIf(EXT_MISSING)('C12 本仓锚：Renderer 镜像门链收编', () => {
  it('ffSdirMirror 门 = GROUP ∪ EX（==1 翻行不变,≙ Main.cs:23357-23361）', () => {
    expect(rendererSrc).toMatch(/import \{ FF_VXSDIR_GROUP, FF_VXSDIR_EX \} from '\.\.\/entities\/Enemy';/);
    expect(rendererSrc).toMatch(/const ffSdirMirror = FF_VXSDIR_GROUP\.has\(idR\) \|\| FF_VXSDIR_EX\.has\(idR\);/);
    expect(rendererSrc).toMatch(/if \(ffSdirMirror && e\.ffSdir === 1\) ctx\.scale\(-1, 1\);/);
  });

  it('残影 gMirror 同源收编（ffSdir 族,修前残影走 facing=与本体脱钩）', () => {
    expect(rendererSrc).toMatch(
      /else if \(FF_VXSDIR_GROUP\.has\(gid\) \|\| FF_VXSDIR_EX\.has\(gid\)\) gMirror = e\.ffSdir === 1;/,
    );
  });

  it('旋转消费门在守：stR108/110 与 stR44 支 rotate(e.visAngle)', () => {
    expect(rendererSrc).toMatch(/else if \(stR === 108 \|\| stR === 110\) ctx\.rotate\(e\.visAngle\);/);
    expect(rendererSrc).toMatch(/else if \(stR === 44\) ctx\.rotate\(e\.visAngle\);/);
  });
});

// ---------------------------------------------------------------------------
// 行为级（活体判别面）
// ---------------------------------------------------------------------------
const W = 200, H = 80, FLOOR = 60;

function makeWorld(): World {
  const w = new World(W, H, 23, 'c12-r11');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  w.groundLevel = FLOOR - 2;
  w.rockLevel = FLOOR + 8;
  return w;
}

function makeGame(w: WorldT, dustLog?: Array<unknown[]>): GameHooks {
  return {
    world: w, player: null, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, spawnParticles: () => {}, playSfxFiles: () => {},
    onEnemyKilled: () => {},
    spawnDust: (...a: unknown[]) => { dustLog?.push(a); return null; },
  } as unknown as GameHooks;
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (...a: unknown[]) => void>)[fn];

/** drawEnemy 记录型假体（BJ588 同款） */
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

function mk(id: number): Enemy {
  const e = Enemy.fromVanilla(id, 40 * TILE, (FLOOR - 3) * TILE);
  if (!e) throw new Error(`fromVanilla(${id}) 失败`);
  return e;
}

describe.skipIf(EXT_MISSING)('C12 行为级 F1：558-560 埃特尼亚飞龙（极性双档,M2 场景转正=DD2 极性有锁）', () => {
  it('ffSdir 死区档 + 常态俯仰 vx×0.1（ai0≠2）', () => {
    const e = mk(558);
    e.ai0 = 0;
    e.vx = 0.5; e.vy = -2;                          // vy 任意——常态不看 vy
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir).toBe(1);
    expect(e.visAngle).toBeCloseTo(0.05, 5);        // vx×0.1（AI 速度角被 FindFrame 覆写）
    e.vx = -0.5;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir).toBe(-1);
    expect(e.visAngle).toBeCloseTo(-0.05, 5);       // 无折叠（原版常态不加 π）
    e.vx = 0;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir, 'vx==0 死区档保前值').toBe(-1);
    expect(e.visAngle).toBe(0);                     // vx×0.1 恒写（零俯仰）
  });

  it('俯冲态（ai0==2）速度角折叠：vx<0 再 +π; vx>0 原角', () => {
    const e = mk(559);
    e.ai0 = 2;
    e.vx = 1; e.vy = 1;
    drive(e, 'findFrameRotation').call(e);
    expect(e.visAngle).toBeCloseTo(Math.atan2(1, 1), 5);                       // π/4 无折叠
    expect(e.ffSdir).toBe(1);
    e.vx = -1; e.vy = -1;
    drive(e, 'findFrameRotation').call(e);
    expect(e.visAngle).toBeCloseTo(Math.atan2(-1, -1) + Math.PI, 5);           // −3π/4+π 折叠
    expect(e.ffSdir).toBe(-1);
  });

  it('显示极性翻正锁（M2）：AI 写 facing=−1 × vx>0 拍 → ffSdir=1 → 渲染翻面', () => {
    const w = makeWorld();
    const e = mk(560);
    e.ai0 = 0;
    e.facing = -1;                                   // AI 层写点形态（=−sign(vx),撞墙反弹域）
    e.vx = 0.5;
    drive(e, 'findFrameRotation').call(e);
    expect(e.facing, 'AI 字段不被显示面污染').toBe(-1);
    expect(e.ffSdir).toBe(1);
    // 修前：通用 facing 门（facing>0 才翻）→ 0 翻 = 反极性（原版 vx>0 必翻）
    expect(flips(drawWithFake(e, w)).length, 'vx>0 拍翻面（原版 sdir==1 翻）').toBe(1);
    e.vx = -0.5;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir).toBe(-1);
    expect(flips(drawWithFake(e, w)).length, 'vx<0 拍原生').toBe(0);
  });

  it('旋转消费：stR108 支 rotate(visAngle) 双档直读', () => {
    const w = makeWorld();
    const e = mk(558);
    e.ai0 = 0; e.vx = 0.5; e.vy = 0;
    drive(e, 'findFrameRotation').call(e);
    expect((rotOf(drawWithFake(e, w))!.a as number[])[0]).toBeCloseTo(0.05, 5);
  });
});

describe.skipIf(EXT_MISSING)('C12 行为级 F2：574/575 滑翔怪（ffSdir 单源 + 口部尘锚）', () => {
  for (const vid of [574, 575]) {
    it(`vid ${vid}：ffSdir 死区档 + 口部锚读 ffSdir（陈旧 facing 不脱钩）`, () => {
      const w = makeWorld();
      const dust: Array<unknown[]> = [];
      const game = makeGame(w, dust);
      const e = mk(vid);
      e.ai0 = 1;
      e.facing = 1;                                   // 击退变向瞬态（direction 与 vx 异号——原版
      e.vx = 0.5; e.vy = 0;                           //  FindFrame sdir 随速度不随 direction）
      for (let i = 0; i < 60; i++) drive(e, 'findFrameRotation').call(e, game);
      expect(e.ffSdir).toBe(1);
      // 8× 火舌爆（alpha=100 组）锚 = Center+(56·sdir,−30).RotatedBy(rotation)
      const burst = dust.filter((a) => a[7] === 100);
      expect(burst.length, '落帧 9 一轮恰一拍 8 粒').toBe(8);
      const [bx, by] = burst[0] as [number, number];
      expect(bx, '口部锚读 ffSdir=+1 → cx+56（旧式 −facing=−1 → cx−56 偏=红）').toBeCloseTo(e.cx + 56, 5);
      expect(by).toBeCloseTo(e.cy - 30, 5);
    });
  }
});

describe.skipIf(EXT_MISSING)('C12 行为级 F3：死区档漏网四面', () => {
  it('330 骚灵：sdir 死区档 + rotation=vx×0.15 原样', () => {
    const e = mk(330);
    e.vx = 0.4;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir).toBe(1);
    expect(e.visAngle).toBeCloseTo(0.06, 5);
    e.vx = 0;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir, '死区保前值').toBe(1);
    expect(e.visAngle).toBe(0);
  });

  for (const vid of [224, 587]) {
    it(`vid ${vid} 飞鱼：sdir 死区档 + ±vy×0.2 同支（vx==0 两面保前值）`, () => {
      const e = mk(vid);
      e.vx = 0.5; e.vy = -2;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(1);
      expect(e.visAngle).toBeCloseTo(-0.4, 5);
      e.vx = -0.5;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);
      expect(e.visAngle).toBeCloseTo(0.4, 5);
      e.vx = 0;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);
      expect(e.visAngle, 'rotation 同支同门——vx==0 不写保前值').toBeCloseTo(0.4, 5);
    });
  }

  for (const vid of [612, 613]) {
    it(`vid ${vid} 水黾：vx≠0 门 Math.Sign(vx) 死区档;零 rotation`, () => {
      const e = mk(vid);
      e.vx = 3;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(1);
      expect(e.visAngle).toBe(0);
      e.vx = -0.1;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir).toBe(-1);
      e.vx = 0;
      drive(e, 'findFrameRotation').call(e);
      expect(e.ffSdir, 'vx==0 门不写=保前值').toBe(-1);
    });
  }

  it('423 进化兽：反极性档（vx>0→−1/vx<0→+1）+ 渲染 ==1 翻 ⟺ vx<0', () => {
    const w = makeWorld();
    const e = mk(423);
    e.vx = 0.5;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir, 'Math.Sign(−vx) 反极性').toBe(-1);
    e.vx = -0.5;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir).toBe(1);
    expect(flips(drawWithFake(e, w)).length, 'ffSdir==1（vx<0 拍）翻面').toBe(1);
    e.vx = 0;
    drive(e, 'findFrameRotation').call(e);
    expect(e.ffSdir, 'vx==0 门不写=保前值').toBe(1);
    expect(e.visAngle).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F4：墓碑碑文日期 locale（活动语言选择）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('C12 F4：longDate 按活动语言选 locale（Player.cs:39455-39461）', () => {
  it('en-US 特例式 "MMMM d, yyy"（无星期,数字年）', () => {
    expect(longDate('en-US')).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });

  it('中文系（zh-Hans/zh-Hant/ja-JP）ToString("D") 无星期形', () => {
    for (const c of ['zh-Hans', 'zh-Hant', 'ja-JP']) {
      expect(longDate(c), c).toMatch(/^\d{4}年\d{1,2}月\d{1,2}日$/);
      expect(longDate(c), `${c} 无星期`).not.toMatch(/星期|曜日/);
    }
  });

  it('带星期文化（de/fr/es/it/pt-BR/ko）与无星期文化（ru/pl）逐文化对齐', () => {
    expect(longDate('de-DE')).toMatch(/^\S+, \d{1,2}\. \S+ \d{4}$/);            // "Mittwoch, 23. September 2026"
    expect(longDate('ru-RU')).toMatch(/\d{1,2} \S+ \d{4} г\.$/);                // 无星期,尾 "г."
    expect(longDate('pl-PL')).toMatch(/^\d{1,2} \S+ \d{4}$/);                   // 无星期
    expect(longDate('ko-KR')).toMatch(/요일$/);                                  // 带星期
    expect(longDate('fr-FR')).toMatch(/^\S+ \d{1,2} \S+ \d{4}$/);               // "mercredi 23 septembre 2026"
    expect(longDate('pt-BR')).toMatch(/^\S+, \d{1,2} de \S+ de \d{4}$/);        // "quarta-feira, 23 de setembro de 2026"
  });

  it('缺省入参=活动语言（i18n 未就绪落 en-US ≙ 原版默认文化态）', () => {
    expect(longDate()).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
  });
});

// ---------------------------------------------------------------------------
// F5：城镇墓碑掷序（抛币→游走→款式）——行为定序 + 结构序双锁
// ---------------------------------------------------------------------------
function withRng(seeds: number[], fn: () => void): void {
  const orig = Math.random;
  let i = 0;
  Math.random = () => seeds[Math.min(i++, seeds.length - 1)];
  try { fn(); } finally { Math.random = orig; }
}

describe.skipIf(EXT_MISSING)('C12 F5：城镇墓碑掷序对齐原版（NPC.cs:79086-79092）', () => {
  it('定序行为锁：seeds=[抛币,游走init,游走步,款式,vx,vy] → roll5/−0.1/+2.0 复合', () => {
    let t!: Tombstone;
    // 抛币 0 → −0.1;游走 [0.5,0.82] → init=0/步+2.0 出环;款式 0.99999 → roll5 → 205;
    // vx 0.99999 → 29;vy 0.99999 → −21
    withRng([0, 0.5, 0.82, 0.99999, 0.99999, 0.99999], () => {
      t = new Tombstone(0, 0, 0, 'x', 0, false, 22);
    });
    expect(t.style).toBe(5);                          // 旧序（游走先）会吃 0 → init −3.5 → 款式漂 4=红
    expect(t.vx).toBeCloseTo(29 * -0.1 + 2.0, 10);    // 抛币 −0.1 × 29 + 游走 +2.0
    expect(t.vy).toBeCloseTo(-2.1, 10);
  });

  it('玩家面掷序保持（游走在先 Player.cs:39415）：seeds=[游走init,游走步,款式,vx,vy]', () => {
    let t!: Tombstone;
    withRng([0.5, 0.82, 0, 0.99999, 0.99999], () => {
      t = new Tombstone(100, 100, 0, 'x', 1, false);
    });
    expect(t.style).toBe(0);                          // roll0 → 43（游走先于款式）
    expect(t.vx).toBeCloseTo(29 * 0.1 + 2.0, 10);     // hitDirection=+1
  });

  it('结构序锁：城镇支 flip 先于 tombstoneWander() 调用;玩家支游走先于 pickStyle', () => {
    const townHead = tombSrc.indexOf('if (townNpcType > 0) {');
    const playerMark = tombSrc.indexOf('// 玩家面（Player.cs:39415-39462）');
    expect(townHead).toBeGreaterThan(0);
    expect(playerMark).toBeGreaterThan(townHead);
    const townBody = tombSrc.slice(townHead, playerMark);
    expect(townBody.indexOf('flip = Math.floor(Math.random() * 2)'), '抛币先')
      .toBeLessThan(townBody.indexOf('tombstoneWander()'));
    const playerBody = tombSrc.slice(playerMark);
    expect(playerBody.indexOf('tombstoneWander()'), '玩家支游走先')
      .toBeLessThan(playerBody.indexOf('pickStyle(coinsOwned)'));
  });
});
