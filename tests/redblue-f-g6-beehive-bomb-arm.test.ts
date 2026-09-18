// 红蓝-F④ g6：Game.breakBeeHive（655 蜂巢弹亡奏等效臂）两处 1:1 残留落刀回归
// （2026-09-18）。定谳锚（1457 Projectile.cs:76611-76660 弹亡奏 type==655 干巢支）：
//   - Main.netMode != 1 门（:76637）——本仓等价门 beeSpawnAuthority 尚未挂本臂
//     （红蓝-C ②幻影家族债维持登记,tests/redblue-c-hive-bee-netmode-gate.test.ts）；
//   - num653 = 2 + Next(3)==0 ×3 → GetAvailableAmountOfNPCsToSpawnUpToSlot（:76645-76649）；
//   - type = Next(210,212)（:76647）；
//   - NewNPC(弹心.X, 弹心.Y) → Bottom=(X,Y)（NPC.cs:81594,盒底=py）；
//   - 初速 vx=vy = Next(-200,201)×0.002（:76650-76651,离散 401 档 ±0.4——与 tile 臂
//     WorldGen.cs:66004-66005 同式）。
// 落刀：连续式 (r−0.5)×0.8 → anchorBeeBottom（离散 401 档+Bottom 合流,弹心=巢心
//   等效——655 弹实体未建,初速 0 落巢心,Game.ts breakBeeHive 头注 g6 段）。
// 判别力（同 breakHive 判例 bj113）：Math.random 常量 spy 桌面值 −0.302（连续式给
//   −0.30123…≠）×Bottom 断言（中心锚给盒底 cy+h/2≠cy）×401 档离散统计（连续式
//   vx×500 为整数的概率≈0）×结构锁（anchorBeeBottom 在位+连续式摘除+债态登记）。
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { World } from '../src/world/World';
import { Game } from '../src/core/Game';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';

const HERE = dirname(fileURLToPath(import.meta.url));
const HIVE = TILE_BY_KEY['v_444_bee_hive']!;

interface BeeRec { x: number; y: number; w: number; h: number; vx: number; vy: number; vid: number }

/** breakBeeHive 可驱动面最小桩（shell 形制同 tests/bj113-breakhive-tileface.test.ts） */
function mkShell(): { g: Game & Record<string, unknown>; w: World; rec: { bees: BeeRec[] } } {
  const w = new World(40, 40, 1, 'g6beehive');
  const rec: { bees: BeeRec[] } = { bees: [] };
  const g = Object.create(Game.prototype) as unknown as Game & Record<string, unknown>;
  g.world = w;
  g.chunks = { markDirtyArea: () => {} } as never;
  g.sfx = { play: () => {} } as never;
  g.entities = {
    nextId: 1,
    critters: [], enemies: [], npcs: [],
    add: (e: { vanillaId?: number; x: number; y: number; w: number; h: number; vx: number; vy: number }) => {
      if (e.vanillaId === 210 || e.vanillaId === 211) {
        rec.bees.push({ x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy, vid: e.vanillaId! });
      }
    },
  } as never;
  g.spawnParticles = () => {};
  return { g, w, rec };
}

/** 逐次重置 2×2 蜂巢并锚格帧归零（ax=ay=20 确定性;干巢=无液体） */
function seedHive(w: World): void {
  const st = w.store;
  for (let dx = 0; dx < 2; dx++) {
    for (let dy = 0; dy < 2; dy++) {
      st.setTile(20 + dx, 20 + dy, HIVE);
      const i = st.idx(20 + dx, 20 + dy);
      st.liquid[i] = 0;
      st.liquidType[i] = 0;
    }
  }
  const i0 = st.idx(20, 20);
  st.frameX[i0] = 0;
  st.frameY[i0] = 0;
}

const callBreakBeeHive = (g: Game & Record<string, unknown>) =>
  (g as unknown as { breakBeeHive(x: number, y: number): void }).breakBeeHive(20, 20);

describe('红蓝-F④ g6：breakBeeHive 弹亡奏等效臂（655 → 2-5 蜂 @巢心 Bottom）', () => {
  // 桌面值判别（同 bj113 anchorBeeBottom 单元判例）：常量 spy r=0.123456789 →
  // 离散式 vx=(floor(49.506)−200)×0.002=−0.302;连续式给 (0.123456789−0.5)×0.8=
  // −0.30123…≠−0.302（摘刀回退=红）。bees=2+3×(r<1/3)=5;type=r<0.5=210。
  it('常量 spy 桌面值：Bottom=巢心 336 + 离散初速 −0.302×双轴（连续式/中心锚均≠=变异判别）', () => {
    const { g, w, rec } = mkShell();
    seedHive(w);
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
    try {
      callBreakBeeHive(g);
      expect(rec.bees.length).toBe(5);                        // 2 + 3×(0.1234<1/3) 满增
      const cy = 20 * TILE + TILE;                            // 巢心 y（=弹心等效）
      const cx = 20 * TILE + TILE;
      for (const b of rec.bees) {
        expect(b.vid).toBe(210);                              // r<0.5 → Next(210,212)=210
        expect(b.y + b.h).toBe(cy);                           // Bottom=(弹心.Y)（中心锚给 cy+h/2≠=红）
        expect(b.x + b.w / 2).toBe(cx);                       // 盒心 x=弹心.X（fromVanilla 中心锚恰同值）
        expect(b.vx).toBe(-151 * 0.002);                      // 离散 401 档桌面值
        expect(b.vx).toBe(-0.302);
        expect(b.vy).toBe(-0.302);                            // 双轴独立掷同常量
      }
      // 2×2 整件清（CheckSuper wipe 面不受本刀影响——回归哨兵）
      const st = w.store;
      for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
          expect(st.type[st.idx(20 + dx, 20 + dy)]).toBe(0);
        }
      }
    } finally {
      spy.mockRestore();
    }
  });

  it('统计面：真实 Math.random 下初速恒落 401 离散档（vx×500=整数∈[−200,200]）+Bottom 恒巢心', () => {
    const { g, w, rec } = mkShell();
    let seen = 0;
    for (let k = 0; k < 40; k++) {
      seedHive(w);
      rec.bees.length = 0;
      callBreakBeeHive(g);
      expect(rec.bees.length).toBeGreaterThanOrEqual(2);      // num653=2+Next(3)³ 增量
      expect(rec.bees.length).toBeLessThanOrEqual(5);
      for (const b of rec.bees) {
        seen++;
        expect(b.y + b.h).toBe(20 * TILE + TILE);             // Bottom=巢心（恒,与掷值无关）
        expect([210, 211]).toContain(b.vid);
        for (const v of [b.vx, b.vy]) {
          const step = v * 500;                               // 0.002×500=1/档
          expect(Math.abs(step - Math.round(step))).toBeLessThan(1e-9);  // 离散档=整数
          expect(Math.round(step)).toBeGreaterThanOrEqual(-200);
          expect(Math.round(step)).toBeLessThanOrEqual(200);  // ±0.4 值域
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    // 连续式 (r−0.5)×0.8 的 vx×500=(r−0.5)×400 为整数的概率≈0——上断言在连续式下必红
  });

  // 结构锁（红蓝-C gate 测试习语）：anchorBeeBottom 在位+连续式摘除+幻影家族债态
  // 显式登记（★若未来落 beeSpawnAuthority 门,此「无门」断言必红=提示同步更新
  // 本文件+redblue-c-hive-bee-netmode-gate.test.ts 家族债条目=债清位哨兵）。
  it('结构锁：anchorBeeBottom 合流在位+连续式摘除+债态登记（无门=登记态哨兵）', () => {
    const src = readFileSync(join(HERE, '../src/core/Game.ts'), 'utf8');
    const start = src.indexOf('/** 蜂巢结构破坏');
    const end = src.indexOf('private availableNPCSpawnsUpToSlot(', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const region = src.slice(start, end);
    expect(region).toContain('anchorBeeBottom(bee, cy');       // Bottom+离散 401 档合流
    expect(region).not.toContain('(Math.random() - 0.5) * 0.8');   // 连续式摘除（旧病灶）
    expect(region).toContain('g6 红蓝-F④');                     // 落刀登记锚
    expect(region).toContain('幻影家族债维持登记');               // 债态登记锚
    // 门未落=登记态（锁【调用形态】——头注提及门名不违例,落门时同步更新本锁）
    expect(region).not.toContain('if (!beeSpawnAuthority(');
  });
});
