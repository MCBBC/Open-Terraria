// BJ377:704 风暴碎块(gore 1007/1008)三修判别面——切帧/初速覆写/相位落叶物理
// 根因(用户实报"原版是切好的小图,我们是一整条"定谳):Gore_1007.png=14×144、
//   Gore_1008.png=10×112 竖排 8 帧图集,FRAME_ROWS 漏配 1007/1008 → 每片碎块整张
//   竖条画出+普通重力翻滚(原版=SpecialAI==3:SpriteFrame(1,8) 随机行切帧+相位落叶)。
// 原版锚:GoreID.cs:9(1007→3/1008→3)/Gore.cs:1416-1424(初速覆写+Frame(1,8)+随机行)
//   /Gore.cs:687-697(帧组循环)/Gore.cs:1104-1230(Gore_UpdateLeaf 相位物理)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { World } from '../src/world/World';
import { GorePiece } from '../src/entities/GorePiece';

const GAME_ROOT = join(__dirname, '..');

function emptyWorld(): World {
  return new World(160, 200, 30, 'open');
}
function makeGame(w: World, dusts: Array<Record<string, unknown>> = [] as Array<Record<string, unknown>>) {
  return {
    world: w, player: null as unknown,
    spawnDust: (_x: number, _y: number, _w2: number, _h: number, type: number,
      sx = 0, sy = 0, alpha = 0) => {
      dusts.push({ type, sx, sy, alpha });
      return { fadeIn: 0, noGravity: false, vx: sx, vy: sy };
    },
  } as unknown as Parameters<GorePiece['fixedUpdate']>[1];
}

describe('BJ377-① 帧表:1007/1008=8 行切帧(旧漏配=整张竖条)', () => {
  it('frameRows:1007→8(14×144→每帧14×18)、1008→8(10×112→10×14);对照 1009→1', () => {
    const g7 = new GorePiece(1007, 0, 0, 1);
    const g8 = new GorePiece(1008, 0, 0, 1);
    const g9 = new GorePiece(1009, 0, 0, 1);
    expect(g7.frameRows).toBe(8);
    expect(g8.frameRows).toBe(8);
    expect(g9.frameRows).toBe(1);
    expect(g7.texW).toBe(14);
    expect(g7.texH).toBe(144);
    expect(g8.texW).toBe(10);
    expect(g8.texH).toBe(112);
  });
  it('源码锚:FRAME_ROWS 含 1007/1008=8', () => {
    const s = readFileSync(join(GAME_ROOT, 'src/entities/GorePiece.ts'), 'utf8');
    expect(s).toMatch(/FRAME_ROWS: Record<number, number> = \{ 1201: 4, 1208: 4, 1217: 3, 1218: 3, 1225: 3, 1007: 8, 1008: 8 \}/);
  });
});

describe('BJ377-② 出生覆写(Gore.cs:1416-1424):AI 传入初速被弃,相位/行/帧计数随机', () => {
  it('newGore(1007,…) 传入 (999,−5) → vx∈(−0.5,0.5)、vy∈(0,2π)、row∈0-7、frameCounter∈0-7', () => {
    for (let i = 0; i < 40; i++) {
      const g = GorePiece.newGore(1007, 800, 400, 999, -5);
      expect(g).not.toBeNull();
      expect(g!.vx).toBeGreaterThan(-0.5);
      expect(g!.vx).toBeLessThan(0.5);
      expect(g!.vy).toBeGreaterThan(0);
      expect(g!.vy).toBeLessThan(Math.PI * 2);
      expect(g!.row).toBeGreaterThanOrEqual(0);
      expect(g!.row).toBeLessThanOrEqual(7);
      expect((g as unknown as { frameCounter: number }).frameCounter).toBeLessThanOrEqual(7);
    }
  });
});

describe('BJ377-③ 相位落叶物理(Gore_UpdateLeaf):非重力翻滚', () => {
  it('下落支:vy(相位)以 π/180/t 递增——60t 后 ≈0.5+1.05,远小于旧普通重力 0.2/t(→12.5)', () => {
    const w = emptyWorld();
    const g = GorePiece.newGore(1007, 800, 400, 0, 0)!;
    g.vy = 0.5;                                           // 钉相位(出生覆写为随机,逐测钉定)
    (g as unknown as { frameCounter: number }).frameCounter = 0;
    const game = makeGame(w);
    for (let i = 0; i < 60; i++) g.fixedUpdate(1 / 60, game);
    expect(g.vy).toBeGreaterThan(1.4);
    expect(g.vy).toBeLessThan(1.7);                       // 旧重力支=12.5 必爆
    // 无横飞:碎块不再以 AI 初速 27px/t 火箭横移（旧实现 60t≈1600px）
    expect(Math.abs(g.x - 800)).toBeLessThan(200);
  });
  it('帧行在 4 帧组内循环:row=2 起在任何 tick 数后恒 ∈{0..3}', () => {
    const w = emptyWorld();
    const g = GorePiece.newGore(1007, 800, 400, 0, 0)!;
    g.row = 2;
    (g as unknown as { frameCounter: number }).frameCounter = 0;
    const game = makeGame(w);
    for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60, game);
    expect(g.row).toBeLessThanOrEqual(3);
  });
  it('滑移支(vy<0):无重力积累,1007 timeLeft 按 DisappearSpeed=3 递减', () => {
    const w = emptyWorld();
    for (let x = 0; x < 30; x++) w.store.setTileSilent(x, 30, 1, 0, 0);    // 地面(片心 tile 8 下方)
    const g = GorePiece.newGore(1007, 8 * 16, 29 * 16, 0, 0)!;
    g.vy = -1;                                            // 置滑移支
    g.timeLeft = 60;
    const game = makeGame(w);
    const t0 = g.timeLeft;
    for (let i = 0; i < 10; i++) g.fixedUpdate(1 / 60, game);
    expect(g.dead).toBe(false);
    expect(g.vy).toBe(-1);                                // 无重力积累(旧支=−1+0.2×10=1)
    expect(t0 - g.timeLeft).toBe(30);                     // 3/t × 10t
  });
  it('滑移支干地止滑(Gore.cs:1146-1148 !flag 臂):vx 一拍归零(旧单臂=0.94ⁿ 长滑移)', () => {
    const w = emptyWorld();
    for (let x = 0; x < 30; x++) w.store.setTileSilent(x, 30, 1, 0, 0);
    const g = GorePiece.newGore(1007, 8 * 16, 29 * 16, 0, 0)!;
    g.vy = -1;
    g.vx = 2;                                             // 钉落地横速(干地)
    const game = makeGame(w);
    g.fixedUpdate(1 / 60, game);
    expect(g.vx).toBe(0);                                 // 原版 !flag 恒归零;旧码=1.88 必爆
  });
});
