// ★BJ590（2026-10-09）FindFrame 帧档/尘族收尾——BJ589 收刀登记两债清偿 + FindFrame
// 域收官刀（NPC.cs FindFrame aiStyle14 域全域扫完，无剩余债）。
//
// 定谳（Terarria1457 亲读，唯一标杆）：
//  · 件1（BJ589 登记①：case 150/151/152/158/226 组组内尘）——组 :75582-75619
//    五型中仅两型带尘：151 熔岩蝠尘 6 每 tick（:75587-75591 speed=v×0.2/α100/
//    scale2/noGravity）、150 冰蝠尘 67 1/10 掷（:75592-75599 speed=v×0.5 生成、
//    随后 ×0.2、α90/scale1.5/noGravity+noLight——本组独有 noLight 参）；152 巨狐蝠/
//    158 吸血蝠/226 飞蛇纯帧档零尘面。五型 sdir 写点=sign(vx) if/if 死区档
//    （:75600-75605）+rotation=vx×0.1（:75606）——与 FF_VXSDIR_GROUP 族同形，
//    BJ590 并入族表（15→22）。
//  · 件2（BJ589 登记②：组外 aiStyle14 专属 case 阈值差定谳）——
//    62 恶魔/66 巫毒恶魔（case 62/66 :74683-74698）：num6=num7=5、counter 循环
//    25t、帧号=counter/5 → 5t/帧×5 帧;sdir=direction（非死区档）+rotation=vx×0.1。
//    156 红恶魔（case 156 :74699-74711）：counter ≥20 清零、帧号=counter/4 →
//    4t/帧×5 帧（20t 循环）;sdir=direction+rotation=vx×0.1。
//    121 Slimer/660 史紫仆从（case 2/23/121/…/660 组 :74790-74856）：num143=8f/
//    660 覆写 6f（:74841-74844）;首拍 localAI[0]==0 门（:74810）frame.Y=num*2 →
//    起始帧 2;sdir=sign(vx) 死区档（else if 支 :74826-74834）+rotation=vx×0.1 →
//    并入 FF_VXSDIR_GROUP。
//    ★谁写：AI_014（:22930-23520）零 frame 写面（亲读）——FindFrame 为十型唯一
//    帧写点，本仓 Renderer FF_AI14_CASE_SPEC 表驱动全量承接。
//  · 死面销案（IDG 纪律：禁死表条目）：158 吸血蝠原版无生成路径（日食块
//    :3552-3614 直出 159 吸血鬼 :3581,无 158;158 仅掉落注册）+ 本仓 VanillaSpawner
//    零 D(158)（:3074 IIIII228 修复注）——158 无活面,其 case 归 150..226 组 6t
//    全帧档与缺省同形,零条目即零差异,不造表条目。
//  · 活/死分档（本仓生成路径在轨性,亲读 VanillaSpawner/bossAI）：
//    活=62/66（地狱池 :3653-3661 段）、121（腐化困难 :3231）、150（冰穴 :3797/
//    :3801）、151（地狱困机械 :3661）、152（困难丛林草地表夜 :3051）、156（地狱
//    困难机械 4/5 :3655）、226（神庙 :3070）、660（史莱姆皇后仆从 bossAI_lategame
//    :2082）;死=158。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Enemy, FF_VXSDIR_GROUP } from '../src/entities/Enemy';
import { vanillaFrameIdx, bestiaryDummyFrameIdx } from '../src/render/Renderer';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { ECLIPSE_SPAWN_TABLE } from '../src/world/Eclipse';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
// ★C档可移植:仓库外依赖(game/ 兄弟目录,clone 侧缺=正常形态)——缺则本文件 skip,本机在=真跑零语义变化
const EXT_MISSING = !['Terarria1457'].every((d) => existsSync(new URL(`../../${d}`, import.meta.url)));


const ROOT = join(__dirname, '..');
const npc1457 = existsSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs')) ? readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8') : '';   // ★C档可移植:缺档降级(EXT_MISSING skip 兜底)
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const rendererSrc = readFileSync(join(ROOT, 'src/render/Renderer.ts'), 'utf8');
const spawnerSrc = readFileSync(join(ROOT, 'src/world/spawn/VanillaSpawner.ts'), 'utf8');

const FIVE = [150, 151, 152, 158, 226];          // case 150..226 组
const SPEC = [62, 66, 121, 156, 660];            // 件2 专属 case 活面
const FIVE_GROUP_NEW = [121, 150, 151, 152, 158, 226, 660]; // BJ590 族表扩容

// ---------------------------------------------------------------------------
// 原版活体锚（1457 源码直读——漂移即爆红）
// ---------------------------------------------------------------------------
/** case 150/151/152/158/226 组 body（case 150 起、case 48 组头止） */
function fiveBody(src: string): string {
  const head = '\t\tcase 150:\n\t\tcase 151:\n\t\tcase 152:\n\t\tcase 158:\n\t\tcase 226:';
  const start = src.indexOf(head);
  if (start < 0) return '';
  const end = src.indexOf('\t\tcase 48:', start);
  return src.slice(start, end < 0 ? start + 3000 : end);
}
const fBody = fiveBody(npc1457);

/** case 62/66 与 case 156 body */
function caseBody(src: string, head: string, stop: string): string {
  const start = src.indexOf(head);
  if (start < 0) return '';
  const end = src.indexOf(stop, start);
  return src.slice(start, end < 0 ? start + 1500 : end);
}
const body6266 = caseBody(npc1457, '\t\tcase 62:\n\t\tcase 66:', '\t\tcase 156:');
const body156 = caseBody(npc1457, '\t\tcase 156:', '\t\tcase 63:');

describe.skipIf(EXT_MISSING)('BJ590 原版锚：件1 五型尘面（case 150..226 组 :75582-75619）', () => {
  it('151 熔岩蝠尘 6：每 tick、speed=v×0.2、α100、scale2、noGravity（:75587-75591）', () => {
    expect(fBody).toMatch(
      /if \(type == 151\)\s*\{\s*int num\d+ = Dust\.NewDust\(new Vector2\(position\.X, position\.Y\), width, height, 6, velocity\.X \* 0\.2f, velocity\.Y \* 0\.2f, 100, default\(Color\), 2f\);\s*Main\.dust\[num\d+\]\.noGravity = true;\s*\}/,
    );
  });

  it('150 冰蝠尘 67：1/10 掷、speed=v×0.5 生成后 ×0.2、α90、scale1.5、noGravity+noLight（:75592-75599）', () => {
    expect(fBody).toMatch(
      /if \(type == 150 && Main\.rand\.Next\(10\) == 0\)\s*\{\s*int num\d+ = Dust\.NewDust\(new Vector2\(position\.X, position\.Y\), width, height, 67, velocity\.X \* 0\.5f, velocity\.Y \* 0\.5f, 90, default\(Color\), 1\.5f\);\s*Main\.dust\[num\d+\]\.noGravity = true;\s*Dust dust = Main\.dust\[num\d+\];\s*dust\.velocity \*= 0\.2f;\s*Main\.dust\[num\d+\]\.noLight = true;\s*\}/,
    );
  });

  it('152/158/226 纯帧档零尘面：组体恰 2 处 NewDust（151/150 专属）且无三型条件支', () => {
    expect(fBody.length).toBeGreaterThan(0);
    expect([...fBody.matchAll(/Dust\.NewDust/g)].length, '组体 NewDust 计数').toBe(2);
    expect(fBody).not.toMatch(/type == 152/);
    expect(fBody).not.toMatch(/type == 158/);
    expect(fBody).not.toMatch(/type == 226/);
  });

  it('五型 sdir=sign(vx) if/if 死区档 + rotation=vx×0.1（:75600-75606）——与 FF_VXSDIR_GROUP 同形', () => {
    expect(fBody).toMatch(
      /if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.1f;/,
    );
    // 帧节拍 6t、回卷硬编码 num*4（五型 npcFrameCount 均 4=全帧同形）
    expect(fBody).toMatch(/frameCounter >= 6\.0/);
    expect(fBody).toMatch(/frame\.Y >= num \* 4\s*\)\s*\{\s*frame\.Y = 0;/);
  });
});

describe.skipIf(EXT_MISSING)('BJ590 原版锚：件2 专属 case 阈值（62/66/156/121/660）', () => {
  it('62/66：sdir=direction（非死区档）+ num6=num7=5 循环 25t ÷5 → 5t/帧×5 帧（:74683-74698）', () => {
    expect(body6266).toMatch(/spriteDirection = direction;/);
    expect(body6266).toMatch(/int num6 = 5;\s*int num7 = 5;/);
    expect(body6266).toMatch(/if \(frameCounter >= \(double\)\(num6 \* num7\)\)\s*\{\s*frameCounter = 0\.0;\s*\}/);
    expect(body6266).toMatch(/int num8 = \(int\)\(frameCounter \/ \(double\)num6\);\s*frame\.Y = num8 \* num;/);
  });

  it('156 红恶魔：sdir=direction + counter ≥20 清零 ÷4 → 4t/帧×5 帧（:74699-74711）', () => {
    expect(body156).toMatch(/spriteDirection = direction;/);
    expect(body156).toMatch(/if \(frameCounter >= 20\.0\)\s*\{\s*frameCounter = 0\.0;\s*\}/);
    expect(body156).toMatch(/int num292 = \(int\)frameCounter \/ 4;\s*frame\.Y = num292 \* num;/);
  });

  it('121/660：num143=8f、660 覆写 6f、首拍 localAI[0] 门 frame.Y=num*2、sdir=sign(vx) 死区档（:74790-74856）', () => {
    expect(npc1457).toMatch(/float num143 = 8f;\s*if \(type == 660\)\s*\{\s*num143 = 6f;\s*\}/);
    expect(npc1457).toMatch(/if \(\(type == 121 \|\| type == 660\) && localAI\[0\] == 0f\)\s*\{\s*localAI\[0\] = 1f;\s*frame\.Y = num \* 2;\s*\}/);
    // sdir 形态=死区档（else if 支——2 被恶魔眼 Atan2 支短路,实效 121/660）
    expect(npc1457).toMatch(
      /else if \(type == 2 \|\| type == 121 \|\| type == 660\)\s*\{\s*if \(velocity\.X > 0f\)\s*\{\s*spriteDirection = 1;\s*\}\s*if \(velocity\.X < 0f\)\s*\{\s*spriteDirection = -1;\s*\}\s*rotation = velocity\.X \* 0\.1f;\s*\}/,
    );
  });

  it('谁写：AI_014（aiStyle==14 块 :22954-23604）零 frame 写面——FindFrame 为十型唯一帧写点', () => {
    const seg = npc1457.slice(npc1457.indexOf('\t\tif (aiStyle == 14)'), npc1457.indexOf('\t\tif (aiStyle == 15)'));
    expect(seg.length, 'AI_014 块定位').toBeGreaterThan(300);
    expect(seg).not.toMatch(/frame\.Y =/);
    expect(seg).not.toMatch(/frameCounter\+\+/);
  });
});

// ---------------------------------------------------------------------------
// 本仓落刀锚（线位/单源/死面销案）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('BJ590 本仓锚', () => {
  it('FF_VXSDIR_GROUP 扩容 15→22（+7 同形死区档型）——本体 15 型全数在位', () => {
    const base = [48, 49, 51, 60, 82, 93, 137, 182, 210, 211, 253, 316, 634, 662, 664];
    expect(FF_VXSDIR_GROUP.size).toBe(22);
    for (const id of base) expect(FF_VXSDIR_GROUP.has(id), `${id} 本体在位`).toBe(true);
    for (const id of FIVE_GROUP_NEW) expect(FF_VXSDIR_GROUP.has(id), `${id} 扩容在位`).toBe(true);
    // 家族边界：62/66/156 sdir=direction 不入族表
    for (const id of [62, 66, 156]) expect(FF_VXSDIR_GROUP.has(id), `${id} 不入`).toBe(false);
  });

  it('findFrameRotation：151/150 尘支 + 156/62/66 rotation 支（sdir=direction 族不入尘外写点）', () => {
    expect(enemySrc).toMatch(/} else if \(vid === 151\) \{/);
    expect(enemySrc).toMatch(/vid === 150 && Math\.floor\(Math\.random\(\) \* 10\) === 0/);
    expect(enemySrc).toMatch(/d150\.noLight = true/);
    expect(enemySrc).toMatch(/vid === 156 \|\| vid === 62 \|\| vid === 66/);
    // 226 已迁族支（旧 156||226 支不再含 226）
    expect(enemySrc).not.toMatch(/vid === 156 \|\| vid === 226/);
  });

  it('Renderer：FF_AI14_CASE_SPEC 五条目（62/66/156/121/660）+ 旋转消费门 156/62/66', () => {
    expect(rendererSrc).toMatch(
      /const FF_AI14_CASE_SPEC: Record<number, \{ thr: number; off\?: number \}> = \{\s*62: \{ thr: 5 \}, 66: \{ thr: 5 \}, 156: \{ thr: 4 \}, 121: \{ thr: 8, off: 2 \}, 660: \{ thr: 6, off: 2 \},\s*\};/,
    );
    expect(rendererSrc).toMatch(/stR === 14 && \(idR === 156 \|\| idR === 62 \|\| idR === 66\)/);
    // 双档同步（vanillaFrameIdx + bestiaryDummyFrameIdx 均接 spec 表）
    expect([...rendererSrc.matchAll(/FF_AI14_CASE_SPEC\[id\]\?\.thr/g)].length).toBe(2);
  });

  it('158 吸血蝠死面销案锚：无生成路径（原版日食直出 159/本仓零 D(158)）+ 零表条目', () => {
    // 原版日食块（:3552-3614）:159 吸血鬼在位、无 158 出怪
    const eclipseGate = '\t\t\t\telse if (((double)spawnTileY <= Main.worldSurface || (Main.remixWorld && (double)spawnTileY > Main.rockLayer)) && Main.dayTime && Main.eclipse)';
    const gi = npc1457.indexOf(eclipseGate);
    expect(gi, '原版日食块定位').toBeGreaterThan(0);
    const seg = npc1457.slice(gi, gi + 3600);
    expect(seg).toContain('SpawnNPC(spawnTileX * 16 + 8, spawnTileY * 16, 159);');
    expect(seg).not.toMatch(/SpawnNPC\(spawnTileX \* 16 \+ 8, spawnTileY \* 16, 158\)/);
    // 本仓活面：VanillaSpawner 零 D(158) + IIIII228 修复注在档
    expect(spawnerSrc).not.toMatch(/D\(158\)/);
    expect(spawnerSrc).toContain('旧实现误在肉前出 158');
    // 本仓日食 oracle 表无 158
    expect(ECLIPSE_SPAWN_TABLE.some((s) => s.id === 158)).toBe(false);
    expect(ECLIPSE_SPAWN_TABLE.some((s) => s.id === 159)).toBe(true);
    // FF_AI14_CASE_SPEC 零 158 条目（158 帧=6t 缺省档,行为锁见帧引擎段）
    expect(rendererSrc).not.toMatch(/158: \{ thr/);
  });
});

// ---------------------------------------------------------------------------
// 组内尘行为级（判别面）
// ---------------------------------------------------------------------------
const W = 200, FLOOR = 60;

/** spawnDust 记录桩（可变尘对象——150 ×0.2/noLight 后观测面） */
function dustGame(): { game: GameHooks; spawns: Array<Record<string, unknown>> } {
  const spawns: Array<Record<string, unknown>> = [];
  const game = {
    world: new World(W, 80, 23, 'bj590-dust'),
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      sx: number, sy: number, alpha: number, color: unknown, scale: number) => {
      const d: Record<string, unknown> = {
        bx: x, by: y, bw: w, bh: h, type, sx, sy, alpha, scale,
        vx: sx, vy: sy, noGravity: false, noLight: false,
      };
      spawns.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { game, spawns };
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (...a: unknown[]) => void>)[fn];

describe.skipIf(EXT_MISSING)('BJ590 行为级：151 熔岩蝠组内尘（每 tick 一拍,无掷门）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('连 3 拍 3 粒：尘 6/盒=(x,y,w,h)/speed=v×0.2/α100/scale2/noGravity', () => {
    const { game, spawns } = dustGame();
    const e = Enemy.fromVanilla(151, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(151) 失败');
    e.vx = 0.6; e.vy = -0.4;

    for (let i = 0; i < 3; i++) drive(e, 'findFrameRotation').call(e, game);
    expect(spawns.length, '每 tick 一粒（无掷门）').toBe(3);
    for (const d of spawns) {
      expect(d.type).toBe(6);
      expect(d.bx).toBe(e.x); expect(d.by).toBe(e.y);
      expect(d.bw).toBe(e.w); expect(d.bh).toBe(e.h);
      expect(d.sx).toBeCloseTo(0.12, 5);   // vx×0.2
      expect(d.sy).toBeCloseTo(-0.08, 5);  // vy×0.2
      expect(d.alpha).toBe(100);
      expect(d.scale).toBe(2);
      expect(d.noGravity).toBe(true);
    }
  });

  it('151 入族表：sdir 死区档（vx>0→1/vx<0→−1/vx==0 保前值）+ rotation=vx×0.1', () => {
    const { game } = dustGame();
    const e = Enemy.fromVanilla(151, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(151) 失败');
    e.vx = 0.5; drive(e, 'findFrameRotation').call(e, game);
    expect(e.ffSdir, 'vx>0').toBe(1);
    expect(e.visAngle).toBeCloseTo(0.05, 6);
    e.vx = -0.5; drive(e, 'findFrameRotation').call(e, game);
    expect(e.ffSdir, 'vx<0').toBe(-1);
    e.vx = 0; drive(e, 'findFrameRotation').call(e, game);
    expect(e.ffSdir, 'vx==0 死区保前值').toBe(-1);
  });
});

describe.skipIf(EXT_MISSING)('BJ590 行为级：150 冰蝠组内尘（1/10 掷门 + ×0.2 + noLight）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('掷中（random<0.1）：尘 67/α90/scale1.5/speed=v×0.5 生成后 ×0.2/noGravity+noLight', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.05);
    const { game, spawns } = dustGame();
    const e = Enemy.fromVanilla(150, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(150) 失败');
    e.vx = 0.8; e.vy = -0.6;
    drive(e, 'findFrameRotation').call(e, game);
    expect(spy).toHaveBeenCalled();
    expect(spawns.length).toBe(1);
    const d = spawns[0];
    expect(d.type).toBe(67);
    expect(d.bx).toBe(e.x); expect(d.by).toBe(e.y);
    expect(d.bw).toBe(e.w); expect(d.bh).toBe(e.h);
    expect(d.sx).toBeCloseTo(0.4, 5);    // 生成 speed=v×0.5（原文）
    expect(d.sy).toBeCloseTo(-0.3, 5);
    expect(d.alpha).toBe(90);
    expect(d.scale).toBe(1.5);
    expect(d.vx).toBeCloseTo(0.08, 5);   // 尘体 velocity ×0.2（:75598）
    expect(d.vy).toBeCloseTo(-0.06, 5);
    expect(d.noGravity).toBe(true);
    expect(d.noLight, 'noLight=本组独有参').toBe(true);
  });

  it('掷不中（random≥0.1 边界 0.1/0.5）：零尘——门=Next(10)==0 精确 1/10', () => {
    for (const rv of [0.1, 0.5, 0.999]) {
      vi.spyOn(Math, 'random').mockReturnValue(rv);
      const { game, spawns } = dustGame();
      const e = Enemy.fromVanilla(150, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error('fromVanilla(150) 失败');
      drive(e, 'findFrameRotation').call(e, game);
      expect(spawns.length, `random=${rv} 不掷中`).toBe(0);
      vi.restoreAllMocks();
    }
  });
});

describe.skipIf(EXT_MISSING)('BJ590 行为级：零尘型/家族边界/无 game 契约', () => {
  afterEach(() => vi.restoreAllMocks());

  it('152/158/226 纯帧档零尘面（连拍零尘,活面 152/226 与死面 158 同锁）', () => {
    const { game, spawns } = dustGame();
    for (const id of [152, 158, 226]) {
      const e = Enemy.fromVanilla(id, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error(`fromVanilla(${id}) 失败`);
      e.vx = 0.6; e.vy = -0.4;
      for (let i = 0; i < 3; i++) drive(e, 'findFrameRotation').call(e, game);
      expect(spawns.length, `type ${id} 零尘`).toBe(0);
    }
  });

  it('226 迁族支：ffSdir 死区档新写点 + rotation 值不变（vx×0.1）', () => {
    const { game } = dustGame();
    const e = Enemy.fromVanilla(226, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(226) 失败');
    e.vx = -1;
    drive(e, 'findFrameRotation').call(e, game);
    expect(e.ffSdir, 'vx<0').toBe(-1);
    expect(e.visAngle).toBeCloseTo(-0.1, 6);
  });

  it('62/66/156 家族边界：rotation=vx×0.1 写点在位、ffSdir 不写（sdir=direction 走通用 facing 门）', () => {
    const { game } = dustGame();
    for (const id of [62, 66, 156]) {
      const e = Enemy.fromVanilla(id, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error(`fromVanilla(${id}) 失败`);
      e.vx = 0.5;
      drive(e, 'findFrameRotation').call(e, game);
      expect(e.visAngle, `type ${id} rotation`).toBeCloseTo(0.05, 6);
      expect(e.ffSdir, `type ${id} 不入族表`).toBe(-1);
    }
  });

  it('无 game（直驱桩域）零尘零异常（151/150 同契）', () => {
    const { spawns } = dustGame();
    for (const id of [151, 150]) {
      const e = Enemy.fromVanilla(id, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error(`fromVanilla(${id}) 失败`);
      expect(() => drive(e, 'findFrameRotation').call(e)).not.toThrow();
    }
    expect(spawns.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 件2 帧引擎行为级（FF_AI14_CASE_SPEC 表驱动——活面按原版落,死面零条目）
// ---------------------------------------------------------------------------
describe.skipIf(EXT_MISSING)('BJ590 帧引擎：件2 活面阈值锁（vanillaFrameIdx）', () => {
  const mk = (id: number) => {
    const e = Enemy.fromVanilla(id, 40 * TILE, 57 * TILE);
    if (!e) throw new Error(`fromVanilla(${id}) 失败`);
    const frames = vanillaNpc(id)?.frames ?? -1;
    expect(frames, `type ${id} frames`).toBeGreaterThan(0);
    const idx = (t: number) => { e.animT = t; return vanillaFrameIdx(e, frames); };
    return { idx, frames };
  };

  it('62/66：5t/帧×5 帧（counter 25t 循环 ÷5）——idx(4)=0/idx(5)=1/idx(24)=4/idx(25)=0', () => {
    for (const id of [62, 66]) {
      const { idx } = mk(id);
      expect(idx(0)).toBe(0);
      expect(idx(4)).toBe(0);
      expect(idx(5), `${id} 首推进 t=5`).toBe(1);
      expect(idx(24)).toBe(4);
      expect(idx(25), `${id} 25t 回卷`).toBe(0);
    }
  });

  it('156：4t/帧×5 帧（20t 循环 ÷4）——idx(3)=0/idx(4)=1/idx(19)=4/idx(20)=0', () => {
    const { idx } = mk(156);
    expect(idx(0)).toBe(0);
    expect(idx(3)).toBe(0);
    expect(idx(4), '首推进 t=4').toBe(1);
    expect(idx(19)).toBe(4);
    expect(idx(20), '20t 回卷').toBe(0);
  });

  it('121：8t/帧+首拍帧 2（localAI 门）——序 2→3→0→1', () => {
    const { idx } = mk(121);
    expect(idx(0), '首拍偏移 2').toBe(2);
    expect(idx(7)).toBe(2);
    expect(idx(8), '首推进 t=8').toBe(3);
    expect(idx(15)).toBe(3);
    expect(idx(16), '回卷至 0').toBe(0);
    expect(idx(24)).toBe(1);
  });

  it('660：6t/帧+首拍帧 2——序 2→3→0→1', () => {
    const { idx } = mk(660);
    expect(idx(0), '首拍偏移 2').toBe(2);
    expect(idx(5)).toBe(2);
    expect(idx(6), '首推进 t=6').toBe(3);
    expect(idx(11)).toBe(3);
    expect(idx(12), '回卷至 0').toBe(0);
    expect(idx(18)).toBe(1);
  });

  it('150..226 组五型（含死面 158）：6t 全帧档不变（与组缺省同形=零条目即零差异）', () => {
    for (const id of FIVE) {
      const { idx } = mk(id);
      expect(idx(0), `${id} 帧0`).toBe(0);
      expect(idx(5), `${id} t=5 未推进`).toBe(0);
      expect(idx(6), `${id} 6t 首推进`).toBe(1);
      expect(idx(23)).toBe(3);
      expect(idx(24), `${id} 24t 回卷`).toBe(0);
    }
  });

  it('图鉴 dummy 折叠镜像：62/156/121/660 同表同速（dummy 同跑真 FindFrame）', () => {
    expect(bestiaryDummyFrameIdx(62, 14, 4, 1, 5, false)).toBe(0);
    expect(bestiaryDummyFrameIdx(62, 14, 5, 1, 5, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(156, 14, 4, 1, 5, false)).toBe(1);
    expect(bestiaryDummyFrameIdx(121, 14, 0, 0, 4, false)).toBe(2);
    expect(bestiaryDummyFrameIdx(121, 14, 8, 0, 4, false)).toBe(3);
    expect(bestiaryDummyFrameIdx(660, 14, 6, 0, 4, false)).toBe(3);
    expect(bestiaryDummyFrameIdx(150, 14, 6, 1, 4, false), '150 缺省 6t 档').toBe(1);
  });
});
