// 一次性诊断 v3：点脸射击出生盒重叠门柱 → 穿门复现
import { describe, it, expect } from 'vitest';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { World } from '../src/world/World';
import { T } from '../src/data/tiles';

function mkBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false };
}

/** 场景：玩家盒贴门站立(右缘=960=门左缘),玩家中心 pcx=950。
 *  荆棘旋刃 38×38 盒心落玩家中心 → x=931..969,右缘越门缘 9px(出生重叠);
 *  火箭 14×14 → x=943..957 不重叠。 */
function mkWorld(): World {
  const w = new World(120, 80, 42, 'doomboom');
  const st = w.store;
  for (let dy = 0; dy < 3; dy++) st.setTileSilent(60, 49 + dy, T.DOOR_CLOSED);
  for (let x = 54; x <= 66; x++) st.setTileSilent(x, 52, 1); // 地板
  return w;
}

describe('door point-blank spawn overlap', () => {
  it('boomerang 38x38 spawn-overlap -> expect blocked', () => {
    const w = mkWorld();
    const pcx = 950, pcy = 51 * 16 - 19;
    const b = mkBody(pcx - 19, pcy - 19, 38, 38);
    console.log('spawn right edge', b.x + b.w, 'doorLeft', 60 * 16, 'overlap', b.x + b.w - 60 * 16);
    let passed = false;
    for (let t = 0; t < 30 && !passed; t++) {
      b.vx = 10.4; // 荆棘旋刃 throwSpd 量级
      moveAndCollide(b, w, b.vx, 0);
      console.log(`t${t} x=${b.x.toFixed(1)} hw=${b.hitWall}`);
      if (b.x > 61 * 16) passed = true; // 完全穿过门柱
    }
    console.log('boom PASSED-THROUGH =', passed, ' final x=', b.x.toFixed(1));
    expect(passed).toBe(false);
  });

  it('rocket 14x14 spawn no-overlap -> blocked', () => {
    const w = mkWorld();
    const b = mkBody(950 - 7, 51 * 16 - 14 - 10, 14, 14);
    let passed = false;
    for (let t = 0; t < 40 && !passed; t++) {
      b.vx = Math.min((b.vx || 10.5) * 1.1, 15);
      moveAndCollide(b, w, b.vx, 0);
      if (b.x > 61 * 16) passed = true;
    }
    console.log('rocket PASSED-THROUGH =', passed);
    expect(passed).toBe(false);
  });

  /** 远距斜下掷旋刃:横穿发生在竖向尚未到门带 → 入柱后才下行压入 */
  it('diagonal descent into door -> expect blocked', () => {
    const w = mkWorld();
    const b = mkBody(58 * 16, 48 * 16 - 30, 38, 38); // 高于门顶,斜向右下
    let passed = false;
    for (let t = 0; t < 60 && !passed; t++) {
      moveAndCollide(b, w, 10.4, 2.5);
      if (b.x > 61 * 16) passed = true;
    }
    console.log('diag PASSED-THROUGH =', passed, 'final', b.x.toFixed(1), b.y.toFixed(1));
    expect(passed).toBe(false);
  });
});
