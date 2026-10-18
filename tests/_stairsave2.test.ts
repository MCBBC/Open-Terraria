// ★一次性诊断 v9：真实存档 vs 合成平台坡 差异定位
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readLocalFixtureText, localFixtureMissing } from './fixturePath';
import { loadSave } from '../src/save/SaveFile';
import { moveAndCollide } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';
import { World } from '../src/world/World';
import { ENEMY_GRAVITY, MAX_FALL_SPEED, TILE } from '../src/core/constants';

const SAVE = 'starter-sbw-20260831.json';   // ★C档收编:原 ~/Downloads/Starter_World-20260831-2315.sbw.json
const W = 60, H = 40, BASE = 22;
type BodyT = Parameters<typeof moveAndCollide>[0];

function walkReal(): void {
  const { world } = loadSave(readLocalFixtureText(SAVE));
  const b = {
    x: 3196 * TILE, y: 389 * TILE - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
    liqFactor: 1,
  } as unknown as BodyT;
  let air = 0; const marks: string[] = [];
  for (let t = 0; t < 80; t++) {
    b.vx = 1;
    b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, world, b.vx, b.vy);
    if (!b.onGround) { air++; marks.push(`t${t}x${(b.x / TILE).toFixed(2)}f${(b.y + b.h).toFixed(0)}`); }
  }
  console.log(`[真实档] 空帧 ${air}/80 空@${marks.join(' ')}`);
}

function walkSynth(pillarEveryCol: boolean): void {
  const PT = TILE_BY_KEY['platform'] as number;
  const STONE = TILE_BY_KEY['stone'] as number;
  const w = new World(W, H, 7, `synth${pillarEveryCol ? 'p' : ''}`);
  const st = w.store;
  for (let x = 0; x < 10; x++) st.setTile(x, BASE - 2, STONE);   // 起步平台(满格)
  for (let c = 0; c < 14; c++) {
    const x = 10 + c, ty = BASE - 1 + c;
    st.setTile(x, ty, PT);                    // 平台锤坡 ╲
    st.slope[st.idx(x, ty)] = 1;
    if (pillarEveryCol) st.setTile(x, ty + 1, STONE);
    else if (c % 3 === 2) st.setTile(x, ty + 1, STONE);
  }
  const b = {
    x: 9.4 * TILE, y: (BASE - 2) * TILE - 42,
    w: 20, h: 42,
    vx: 0, vy: 0, onGround: true, hitWall: false, hitHead: false,
    collideY: false, stepUp: true, stepUpHolds: true, stepUpNpc: true,
    liqFactor: 1,
  } as unknown as BodyT;
  let air = 0; const marks: string[] = [];
  for (let t = 0; t < 90; t++) {
    b.vx = 1;
    b.vy = Math.min(b.vy + ENEMY_GRAVITY, MAX_FALL_SPEED);
    moveAndCollide(b, w, b.vx, b.vy);
    if (!b.onGround) { air++; marks.push(`t${t}x${(b.x / TILE).toFixed(2)}f${(b.y + b.h).toFixed(0)}`); }
  }
  console.log(`[合成${pillarEveryCol ? '每列柱' : '稀柱'}] 空帧 ${air}/90 终x=${(b.x / TILE).toFixed(2)} 空@${marks.slice(0, 8).join(' ')}`);
}

describe.skipIf(localFixtureMissing(SAVE))('v9 隔离', () => {
  it('三路对照', () => {
    walkReal();
    walkSynth(false);
    walkSynth(true);
  });
});
