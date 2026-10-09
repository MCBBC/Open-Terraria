// ★BJ589（2026-10-09）FindFrame 组内帧档（蜂 3t/Harpy 5t）+ 组内尘（60/634）收编
// + npc-damage-gate 夹具预存红修复——BJ588 收刀登记三债清偿判别。
//
// 定谳（Terarria1457 亲读，唯一标杆）：
//  · 帧档（case 48..664 组 :75620-75681）：推进阈值 num296=6（:75663）、49|51|60|634
//    num297-- 末帧掐掉（:75665-75667）、Harpy 48 → num296=5（:75670-75672，快 1.2×）、
//    蜂 210/211 frameCounter 双加（蜂支内 :75658 + 组尾 :75661）=每 tick +2 → 3t/帧
//    （6t 档 2 倍速）。蜂 aiStyle=5（SetDefaults :11724-11744）不入 aiStyle14 档——
//    帧引擎专属 id 支；组外 aiStyle14 十型（62/66/121/150-152/156/158/226/660）各有
//    专属 case 与组缺省 6t 同形，拆 48 不及。
//  · 组内尘（原版 FindFrame 内发尘=每 tick 一拍，:91626 FindFrame 在 Update AI/碰撞后
//    UpdateTrails 前跑——本仓对映位=findFrameRotation 同拍）：60 地狱蝠尘 6 每 tick
//    （:75636-75640 speed=v×0.2/α100/scale2/noGravity）；634 孢子蝠尘 165 1/10 掷
//    （:75641-75646 speed=v 生成、随后 ×0.1、α50/缺省 scale/noGravity）。
//  · 件2（纯测试域）：npc-damage-gate 巫毒两用例失败链 Game.newText→this.cb.onChat
//    （Game.ts:51550）——explodeAt→TownNPC.hurt→broadcastDeathMessage（BJ562 死亡
//    公告单源）→chatBroadcast，测试壳 Object.create(Game.prototype) 缺 cb 桩=预存红。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { Enemy, FF_VXSDIR_GROUP } from '../src/entities/Enemy';
import { vanillaFrameIdx, bestiaryDummyFrameIdx, Renderer } from '../src/render/Renderer';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import type { World as WorldT } from '../src/world/World';

const ROOT = join(__dirname, '..');
const npc1457 = readFileSync(join(ROOT, '../Terarria1457/Terraria/NPC.cs'), 'utf8');
const mainSrc = readFileSync(join(ROOT, '../Terarria1457/Terraria/Main.cs'), 'utf8');
const gameSrc = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
const enemySrc = readFileSync(join(ROOT, 'src/entities/Enemy.ts'), 'utf8');
const gateSrc = readFileSync(join(ROOT, 'tests/npc-damage-gate.test.ts'), 'utf8');

const GROUP = [48, 49, 51, 60, 82, 93, 137, 182, 210, 211, 253, 316, 634, 662, 664];
const BEES = [210, 211];
const SKIP_LAST = [49, 51, 60, 634];
const HARPY = 48;

// ---------------------------------------------------------------------------
// 原版活体锚（1457 源码直读——三债的原文面，漂移即爆红）
// ---------------------------------------------------------------------------
/** FindFrame case 组 body（BJ588 同款提取器） */
function vanillaGroupBody(src: string): string {
  const head = GROUP.slice(0, 5).map((n) => `case ${n}:`).join('\n\t\t');
  const start = src.indexOf(`\t\t${head}`);
  if (start < 0) return '';
  const end = src.indexOf('\t\tcase 330:', start);
  return src.slice(start, end < 0 ? start + 4000 : end);
}
const gBody = vanillaGroupBody(npc1457);

describe('BJ589 原版锚：蜂 3t / Harpy 5t / 组内尘参数', () => {
  it('蜂 210/211 frameCounter 双加（:75657-75661）——支内 ++ + 组尾 ++，阈值 6 ⇒ 3t/帧', () => {
    expect(gBody).toMatch(
      /if \(type == 210 \|\| type == 211\)\s*\{\s*frameCounter\+\+;\s*rotation = velocity\.X \* 0\.2f;\s*\}\s*frameCounter\+\+;/,
    );
    expect(gBody).toMatch(/int num296 = 6;/);
  });

  it('Harpy 48 专档 num296=5（:75670-75672）；49|51|60|634 末帧掐掉（:75665-75667）', () => {
    expect(gBody).toMatch(/if \(type == 48\)\s*\{\s*num296 = 5;\s*\}/);
    expect(gBody).toMatch(/if \(type == 49 \|\| type == 51 \|\| type == 60 \|\| type == 634\)\s*\{\s*num297--;\s*\}/);
    // 蜂不在掐末帧名单（num297 对 210/211 不减——全帧循环）
    expect(SKIP_LAST).not.toContain(210);
    expect(SKIP_LAST).not.toContain(211);
  });

  it('60 地狱蝠尘 6：每 tick、speed=v×0.2、α100、scale2、noGravity（:75636-75640）', () => {
    expect(gBody).toMatch(
      /if \(type == 60\)\s*\{\s*int num\d+ = Dust\.NewDust\(new Vector2\(position\.X, position\.Y\), width, height, 6, velocity\.X \* 0\.2f, velocity\.Y \* 0\.2f, 100, default\(Color\), 2f\);\s*Main\.dust\[num\d+\]\.noGravity = true;\s*\}/,
    );
  });

  it('634 孢子蝠尘 165：1/10 掷、speed=v 生成后 ×0.1、α50、noGravity（:75641-75646）', () => {
    expect(gBody).toMatch(
      /if \(type == 634 && Main\.rand\.Next\(10\) == 0\)\s*\{\s*int num\d+ = Dust\.NewDust\(position, width, height, 165, velocity\.X, velocity\.Y, 50\);\s*Dust dust = Main\.dust\[num\d+\];\s*dust\.velocity \*= 0\.1f;\s*Main\.dust\[num\d+\]\.noGravity = true;\s*\}/,
    );
  });
});

// ---------------------------------------------------------------------------
// 帧数跨域对拍：Main.npcFrameCount（vanilla）↔ 本仓 vanillaNpcs 数据
// ---------------------------------------------------------------------------
function vanillaFrameCounts(src: string): number[] {
  const i = src.indexOf('npcFrameCount = new int[697]');
  expect(i, 'Main.npcFrameCount 定位').toBeGreaterThan(0);
  const open = src.indexOf('{', i);
  const seg = src.slice(open + 1, src.indexOf('}', open));
  return [...seg.matchAll(/-?\d+/g)].map((m) => Number(m[0]));
}

describe('BJ589 全组逐型对拍表（vanilla npcFrameCount ↔ 本仓数据 ↔ 帧引擎行为）', () => {
  /** vanilla 源推导的期望档：thr（48→5/蜂双加→3/余 6）× cap（skip-last→frames-1） */
  const thrOf = (id: number) => (id === HARPY ? 5 : BEES.includes(id) ? 3 : 6);
  const capOf = (id: number, frames: number) => (SKIP_LAST.includes(id) ? frames - 1 : frames);

  const counts = vanillaFrameCounts(mainSrc);

  for (const id of GROUP) {
    it(`type ${id}：帧数对拍 + 帧引擎推进周期/访问帧行 = vanilla 档`, () => {
      const frames = vanillaNpc(id)?.frames ?? -1;
      // ① 跨域帧数：Main.npcFrameCount ↔ 本仓 vanillaNpcs.frames
      expect(counts[id], `type ${id} vanilla npcFrameCount`).toBeGreaterThan(0);
      expect(frames, `type ${id} 本仓 frames`).toBe(counts[id]);

      // ② 帧引擎行为（vanillaFrameIdx 全帧采样——固定窗 [0, thr*cap]：
      //    首推进=thr、窗内步进数=cap、访问帧行=vanilla 档、窗尾回卷同帧）
      const e = Enemy.fromVanilla(id, 40 * TILE, 57 * TILE);
      if (!e) throw new Error(`fromVanilla(${id}) 失败`);
      const thr = thrOf(id);
      const cap = capOf(id, frames);
      const idx = (t: number) => { e.animT = t; return vanillaFrameIdx(e, frames); };
      const i0 = idx(0);
      const T = thr * cap;
      let first = -1;
      for (let t = 1; t <= 240; t++) { if (idx(t) !== i0) { first = t; break; } }
      expect(first, `type ${id} 首帧推进 tick`).toBe(thr);
      let steps = 0;
      for (let t = 1; t <= T; t++) { if (idx(t) !== idx(t - 1)) steps++; }
      expect(steps, `type ${id} 每 ${T}t 步进数`).toBe(cap);
      expect(idx(T), `type ${id} 窗尾回卷`).toBe(i0);
      const seen = new Set<number>();
      for (let t = 0; t < T; t++) seen.add(idx(t));
      const expectVisited = Array.from({ length: cap }, (_, k) => Math.min(frames - 1, k));
      expect([...seen].sort((a, b) => a - b), `type ${id} 访问帧行`).toEqual(expectVisited);
    });
  }

  it('skip-last/蜂专档/harpy 专档对拍表钉值（速查面）', () => {
    const rows = GROUP.map((id) => {
      const f = vanillaNpc(id)?.frames ?? 0;
      return `${id}:thr=${thrOf(id)},cap=${capOf(id, f)}/${f}`;
    });
    expect(rows).toEqual([
      '48:thr=5,cap=6/6',    // Harpy 5t 全帧
      '49:thr=6,cap=4/5',    // 洞穴蝠 6t 掐末
      '51:thr=6,cap=4/5',    // 丛林蝠
      '60:thr=6,cap=4/5',    // 地狱蝠
      '82:thr=6,cap=4/4',    // 怨灵（ai22→通用 6t 全帧）
      '93:thr=6,cap=4/4',    // 巨型蝠
      '137:thr=6,cap=4/4',   // 幻光蝠
      '182:thr=6,cap=5/5',   // 漂浮怪（ai22）
      '210:thr=3,cap=4/4',   // 蜂 3t 全帧
      '211:thr=3,cap=4/4',   // 大蜂
      '253:thr=6,cap=3/3',   // 死神（ai22）
      '316:thr=6,cap=4/4',   // 幽灵（ai22）
      '634:thr=6,cap=4/5',   // 孢子蝠
      '662:thr=6,cap=4/4',   // 海盗幽灵（ai122→通用）
      '664:thr=6,cap=6/6',   // 火把神（ai0→通用）
    ]);
  });
});

// ---------------------------------------------------------------------------
// 本仓落刀锚（线位/单源）
// ---------------------------------------------------------------------------
describe('BJ589 本仓锚', () => {
  it('findFrameRotation 传 game（fixedUpdate 线位）+ 组内尘在同拍层', () => {
    expect(enemySrc).toMatch(/this\.findFrameRotation\(game\);/);
    expect(enemySrc).toMatch(/if \(vid === 60\) \{/);
    expect(enemySrc).toMatch(/vid === 634 && Math\.floor\(Math\.random\(\) \* 10\) === 0/);
  });

  it('件2 夹具锚：newText→cb.onChat 链面 + npc-damage-gate 壳 cb 桩在位', () => {
    expect(gameSrc).toMatch(
      /newText\(text: string, r = 255, g = 255, b = 255, width = -1\): void \{\s*this\.recLog\('chat'[\s\S]*?this\.cb\.onChat\?\.\(text, r, g, b, width\);/,
    );
    expect(gateSrc).toContain('g.cb = { onChat: () => {} };');
  });
});

// ---------------------------------------------------------------------------
// 组内尘行为级（判别面）
// ---------------------------------------------------------------------------
const W = 200, FLOOR = 60;

/** spawnDust 记录桩（可变尘对象——634 ×0.1 后观测面） */
function dustGame(): { game: GameHooks; spawns: Array<Record<string, number | boolean>> } {
  const spawns: Array<Record<string, number | boolean>> = [];
  const game = {
    world: new World(W, 80, 23, 'bj589-dust'),
    spawnDust: (x: number, y: number, w: number, h: number, type: number,
      sx: number, sy: number, alpha: number, color: unknown, scale: number) => {
      const d: Record<string, number | boolean> = {
        bx: x, by: y, bw: w, bh: h, type, sx, sy, alpha, scale,
        vx: sx, vy: sy, noGravity: false,
      };
      spawns.push(d);
      return d;
    },
  } as unknown as GameHooks;
  return { game, spawns };
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (...a: unknown[]) => void>)[fn];

describe('BJ589 行为级：60 地狱蝠组内尘（每 tick 一拍）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('连 5 拍 5 粒：尘 6/盒=(x,y,w,h)/speed=v×0.2/α100/scale2/noGravity', () => {
    const { game, spawns } = dustGame();
    const e = Enemy.fromVanilla(60, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(60) 失败');
    e.vx = 0.6; e.vy = -0.4;

    for (let i = 0; i < 5; i++) drive(e, 'findFrameRotation').call(e, game);
    expect(spawns.length, '每 tick 一粒（无掷门）').toBe(5);
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

  it('无 game（BJ588 直驱桩域）零尘零异常', () => {
    const { spawns } = dustGame();
    const e = Enemy.fromVanilla(60, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(60) 失败');
    expect(() => drive(e, 'findFrameRotation').call(e)).not.toThrow();
    expect(spawns.length).toBe(0);
  });
});

describe('BJ589 行为级：634 孢子蝠组内尘（1/10 掷门 + ×0.1）', () => {
  afterEach(() => vi.restoreAllMocks());

  it('掷中（random<0.1）：尘 165/α50/scale1/speed=v 生成后 ×0.1/noGravity', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.099);
    const { game, spawns } = dustGame();
    const e = Enemy.fromVanilla(634, 40 * TILE, (FLOOR - 3) * TILE);
    if (!e) throw new Error('fromVanilla(634) 失败');
    e.vx = 0.7; e.vy = -0.3;
    drive(e, 'findFrameRotation').call(e, game);
    expect(spy).toHaveBeenCalled();
    expect(spawns.length).toBe(1);
    const d = spawns[0];
    expect(d.type).toBe(165);
    expect(d.bx).toBe(e.x); expect(d.by).toBe(e.y);
    expect(d.bw).toBe(e.w); expect(d.bh).toBe(e.h);
    expect(d.sx).toBeCloseTo(0.7, 5);    // 生成 speed=v（原文）
    expect(d.sy).toBeCloseTo(-0.3, 5);
    expect(d.alpha).toBe(50);
    expect(d.scale).toBe(1);             // 缺省 scale（NewDust 缺省参）
    expect(d.vx).toBeCloseTo(0.07, 5);   // 尘体 velocity ×0.1（:75645）
    expect(d.vy).toBeCloseTo(-0.03, 5);
    expect(d.noGravity).toBe(true);
  });

  it('掷不中（random≥0.1 边界 0.1/0.5）：零尘——门=Next(10)==0 精确 1/10', () => {
    for (const rv of [0.1, 0.5, 0.999]) {
      vi.spyOn(Math, 'random').mockReturnValue(rv);
      const { game, spawns } = dustGame();
      const e = Enemy.fromVanilla(634, 40 * TILE, (FLOOR - 3) * TILE);
      if (!e) throw new Error('fromVanilla(634) 失败');
      drive(e, 'findFrameRotation').call(e, game);
      expect(spawns.length, `random=${rv} 不掷中`).toBe(0);
      vi.restoreAllMocks();
    }
  });
});

// ---------------------------------------------------------------------------
// 图鉴 dummy 折叠镜像（bestiaryDummyFrameIdx——dummy 同跑真 FindFrame,
// UnlockableNPCEntryIcon :99-109；折叠与 vanillaFrameIdx 同刀拆档）
// ---------------------------------------------------------------------------
describe('BJ589 图鉴 dummy 折叠镜像：蜂 3t / Harpy 5t', () => {
  const advanceOf = (fn: (t: number) => number): number => {
    const i0 = fn(0);
    for (let t = 1; t <= 240; t++) if (fn(t) !== i0) return t;
    return -1;
  };

  it('蜂 210/211：3t 推进（dummy 与活体同速）', () => {
    for (const id of BEES) {
      expect(advanceOf((t) => bestiaryDummyFrameIdx(id, 5, t, 1, 4, false)), `bee ${id}`).toBe(3);
    }
  });

  it('Harpy 48：5t 推进；49 抽样 6t（组缺省不动）', () => {
    expect(advanceOf((t) => bestiaryDummyFrameIdx(48, 14, t, 1, 6, false))).toBe(5);
    expect(advanceOf((t) => bestiaryDummyFrameIdx(49, 14, t, 1, 5, false))).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// 渲染域回归哨（FF 组单源表/从不镜像族不被本刀扰动——BJ588 锚的镜像哨）
// ---------------------------------------------------------------------------
describe('BJ589 渲染域哨', () => {
  it('FF_VXSDIR_GROUP 单源不动（Renderer 消费零漂移）', () => {
    // ★BJ590 族表扩容 +7（121/150/151/152/158/226/660 同死区档形态并入）——
    //   BJ589 的 15 型本体仍须全数在位
    expect([...FF_VXSDIR_GROUP].sort((a, b) => a - b))
      .toEqual([...GROUP, 121, 150, 151, 152, 158, 226, 660].sort((a, b) => a - b));
    for (const id of [...GROUP, 121, 150, 151, 152, 158, 226, 660]) {
      expect(Renderer.SLIME_NO_MIRROR.has(id), `${id} 不入从不镜像表`).toBe(false);
    }
  });
});
