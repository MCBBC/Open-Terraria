// ★SW-BJ19 2026-09-07 守卫:上坡坡缝速度残量(vanilla 1:1)+BJ9 门零外溢结构锁
// 根因档案:用户实报"上坡走 2 格斜坡格子高概率突然减速"(Starter World 标注
// (3207,362)/(3208,361) s2 坡,行为日志 vx 3→0.12-0.96 驻留 30-60 拍)。
// 机制 = 坡缝处身体右缘跨入邻列整砖列时 X 拦截支把速度【硬清零】,跑链以
// +0.08/t 重建(30+ 拍)=爬行。vanilla TileCollision X 拦截支为截断式:
// result.X = tile左缘-(移前右缘)(Collision.cs:2437/:2446),调用方
// velocity = result(Player.cs:23730-23747/:23766)——残量保留为速度。
// 本守卫用合成夹具(标注坡同构)锁死「拦截后速度=残量>0」语义。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TileStore } from '../src/world/TileStore';
import type { World } from '../src/world/World';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';

const TILE = 16;
const DIRT = TILE_BY_KEY['dirt']!;

function makeWorld(w: number, h: number): World {
  return { store: new TileStore(w, h), w, h } as unknown as World;
}

/** 标注坡同构夹具(Starter World 3207-3212/361-364 局部):
 *  sx 列 s2 实心坡 → sx+1 列 s2 实心坡(下有整砖填充) → 平顶。
 *  玩家从坡脚对角线全速(3px/t)东行。 */
function makeSlopeWorld(): { W: World; sx: number; G: number } {
  const W = makeWorld(80, 80);
  const st = W.store;
  const sx = 40, G = 30;
  st.setTile(sx, G, DIRT); st.setSlope(sx, G, 2);            // 标注坡①(3207,362)
  st.setTile(sx + 1, G - 1, DIRT); st.setSlope(sx + 1, G - 1, 2); // 标注坡②(3208,361)
  st.setTile(sx + 1, G, DIRT);                               // 坡②下填充(3208,362)
  st.setTile(sx, G + 1, DIRT);                               // 坡①下填充(3207,363)
  for (let x = sx - 8; x < sx; x++) st.setTile(x, G + 1, DIRT); // 坡西行走进场平地
  for (let x = sx + 2; x <= sx + 9; x++) {                   // 坡顶平台(3209..,361)
    st.setTile(x, G - 1, DIRT);
    st.setTile(x, G, DIRT);
  }
  return { W, sx, G };
}

interface TestBody { x: number; y: number; w: number; h: number; vx: number; vy: number; onGround: boolean; hitWall: boolean; hitHead: boolean }

/** 全速东行跑过标注坡;返回逐拍 (x, vx, hitWall) */
function runUphill(W: World, x0: number, frames: number): Array<[number, number, boolean]> {
  const p: TestBody = { x: x0, y: 0, w: 20, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false };
  const sxTiles = makeSlopeWorldGeometry(W);
  p.y = 31 * TILE - 42;                     // 坡①对角线左端足高 (G+1)*16
  void sxTiles;
  const trail: Array<[number, number, boolean]> = [];
  for (let f = 0; f < frames; f++) {
    if (p.vx < 3) { if (p.vx < -0.2) p.vx += 0.2; p.vx += 0.08; } else p.vx -= 0.2;
    p.vy = Math.min(8, p.vy + 0.4);
    moveAndCollide(p as never, W, p.vx, p.vy);
    trail.push([p.x, p.vx, p.hitWall]);
  }
  return trail;
}

function makeSlopeWorldGeometry(_W: World): null { return null; }

describe('SW-BJ19 坡缝速度残量守卫(vanilla 1:1)', () => {
  it('拦截后速度=残量>0,不硬清零;爬缝后正常登顶', () => {
    const { W, sx, G } = makeSlopeWorld();
    const trail = runUphill(W, sx * TILE - 20, 70);
    const slopeX0 = sx * TILE - 20, slopeX1 = (sx + 2) * TILE;
    let seamBlocks = 0;
    for (const [x, vx, hw] of trail) {
      const inSlope = x >= slopeX0 && x < slopeX1;
      if (hw && inSlope) seamBlocks++;
      // ★核心断言:坡区内持键行走速度永不归零(硬清零签名)。修复前坡缝拦截
      //  b.vx=0 ⇒ 此断言爆红;残量语义下拦截后 vx=本拍实际前进量>0。
      if (inSlope) expect(vx, `坡区内速度硬清零(x=${x.toFixed(1)})`).toBeGreaterThan(0);
    }
    expect(seamBlocks, '夹具必须真实触发坡缝拦截(防真空转绿)').toBeGreaterThan(0);
    // 登顶:站上坡顶平台且足高=平台面
    const last = trail[trail.length - 1];
    expect(last[0]).toBeGreaterThanOrEqual((sx + 3) * TILE);
    void G;
  });

  it('多相位扫描:任意入缝相位均无速度归零驻留(★SW-RB6c 收紧:16 相位×1px+逐相位拦截判别力门)', () => {
    for (let phi = 0; phi < 16; phi++) {
      const { W, sx } = makeSlopeWorld();
      const trail = runUphill(W, sx * TILE - 20 - phi, 80);
      let hadSpeed = false;   // 排除起步加速段(合法的 0→3 爬升)
      let seamBlocks = 0;     // 逐相位判别力:每相位都必须真实触发坡缝拦截(防空转绿)
      for (const [x, vx, hw] of trail) {
        if (vx >= 1) hadSpeed = true;
        if (hw && x >= sx * TILE - 20 && x < (sx + 2) * TILE) seamBlocks++;
        if (hadSpeed && x >= sx * TILE - 20 && x < (sx + 2) * TILE) {
          expect(vx, `φ=${phi} 坡区速度归零(x=${x.toFixed(1)})`).toBeGreaterThan(0);
        }
      }
      expect(seamBlocks, `φ=${phi} 夹具未触发坡缝拦截(判别力真空)`).toBeGreaterThan(0);
    }
  });

  it('结构锁:残量语义源文本锚 + BJ9 unwedgeDrift 门零玩家外溢', () => {
    const tc = readFileSync(join(import.meta.dirname, '../src/physics/TileCollision.ts'), 'utf8');
    expect(tc).toContain('★SW-BJ19 2026-09-07：钳位后速度=实际位移残量');
    expect(tc).toContain('const landed = dir > 0 ? b.x - oldX : oldX - b.x;');
    // Player.ts 不得出现 unwedgeDrift(BJ9 门=AI_001 专用;写点只在 Enemy.ts)
    const player = readFileSync(join(import.meta.dirname, '../src/entities/Player.ts'), 'utf8');
    expect(player).not.toContain('unwedgeDrift');
    const enemy = readFileSync(join(import.meta.dirname, '../src/entities/Enemy.ts'), 'utf8');
    expect(enemy).toContain('unwedgeDrift = true');
  });
});
