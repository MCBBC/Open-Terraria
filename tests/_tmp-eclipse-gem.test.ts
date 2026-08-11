import { describe, it, expect } from 'vitest';
// 日食段 + 宝石松鼠/兔段验证（经 tools/run-diag.mjs 运行）
// 1) eclipse=true + 白天 + 地表玩家 → 500 次采样应只出日食池
// 2) 深层洞穴白天采样 → 应出现 639-652 宝石小动物
// 3) getSpawnRate 日食倍率 ×0.2/×1.9
import { generateWorld } from '../src/world/gen/WorldGen';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

async function main(){
const world = await generateWorld({ width: 4200, height: 1200, seedText: 'eclipse-gem-probe' });
world.clock.timeOfDay = 0.5;   // 正午
world.clock.eclipse = true;
world.flags.hardMode = true;
// 世花 + 三机械全杀 → 全表（477/466/463/467/253/468/460 解锁）
world.flags['downed_262'] = true;
world.flags['downed_134'] = true; world.flags['downed_126'] = true; world.flags['downed_127'] = true;

// ---- 1) 日食池（地表玩家）----
{
  const sp = new VanillaSpawner(world);
  sp.setPlayerFlags(false, true);
  const pool = new Map<number, number>();
  const px = (world.spawnX + 0.5) * 16, py = (world.spawnY - 6) * 16;
  for (let k = 0; k < 500; k++) {
    const e = sp.spawn(px, py, new RNG(k * 7919 + 13), 30, 18);
    if (e) pool.set(e.vanillaId ?? -1, (pool.get(e.vanillaId ?? -1) ?? 0) + 1);
  }
  const expect = new Set([477, 251, 466, 463, 467, 159, 253, 469, 468, 460, 162, 461, 462, 166]);
  console.log('日食池:', [...pool.entries()].sort((a, b) => b[1] - a[1]));
  const bad = [...pool.keys()].filter((id) => !expect.has(id));
  console.log('日食池非日食怪:', bad, '合计', [...pool.values()].reduce((a, b) => a + b, 0));
}

// ---- 2) 宝石小动物（洞穴层白天，非日食）----
world.clock.eclipse = false;
{
  const st = world.store;
  // 找一个岩石层以下的非丛林/雪/沙落脚点（玩家悬在洞穴上方）
  let spot: { x: number; y: number } | null = null;
  const JG = (await import('../src/data/tiles')).TILE_BY_KEY['v_60_jungle_grass_block'];
  outer:
  for (let y = Math.floor(world.rockLevel) + 60; y < st.h - 300; y += 7) {
    for (let x = 600; x < st.w - 600; x += 11) {
      if (!st.isSolid(x, y)) continue;
      if (st.isSolid(x, y - 1) || st.isSolid(x, y - 2) || st.isSolid(x, y - 3)) continue;
      const t = st.type[st.idx(x, y)];
      if (t === JG) continue;
      spot = { x, y }; break outer;
    }
  }
  console.log('洞穴采样点:', spot, 'rockLevel=', Math.floor(world.rockLevel));
  if (spot) {
    const sp = new VanillaSpawner(world);
    sp.setPlayerFlags(false, true);
    const pool = new Map<number, number>();
    const px = (spot.x + 0.5) * 16, py = (spot.y - 3) * 16;
    for (let k = 0; k < 5000; k++) {
      const e = sp.spawn(px, py, new RNG(k * 104729 + 7), 30, 18);
      if (e) pool.set(e.vanillaId ?? -1, (pool.get(e.vanillaId ?? -1) ?? 0) + 1);
    }
    const gem = [...pool.entries()].filter(([id]) => id >= 639 && id <= 652);
    console.log('宝石小动物:', gem);
    console.log('全池 top:', [...pool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10));
  }
}

// ---- 3) 日食 spawnRate 倍率 ----
{
  const sp = new VanillaSpawner(world);
  sp.setPlayerFlags(false, false);
  const base = sp.getSpawnRate(100 * 16, 0, false, 800);
  world.clock.eclipse = true;
  const ec = sp.getSpawnRate(100 * 16, 0, false, 800);
  console.log('spawnRate', base, '→', ec, '(期望 ×0.2 / ×1.9):',
    ec.spawnRate, Math.floor(base.spawnRate * 0.2), ec.maxSpawns, Math.floor(base.maxSpawns * 1.9));
}

// ---- 4) 音乐选曲：日食白天地表 → 27 ----
{
  const { pickMusic } = await import('../src/data/Music');
  const m = pickMusic({
    scene: { townNPCCount: 0 } as never, isDay: true, bossMusic: 0, invasionMusic: 0,
    worldSurface: world.groundLevel, rockLevel: world.rockLevel, lavaLine: world.lavaLine,
    maxTilesX: world.store.w, centerX: world.spawnX * 16, centerY: world.spawnY * 16,
    state: { ugMusic: 0, dayMusic: 0 }, eclipse: true,
  });
  console.log('日食 BGM:', m, '(期望 27)');
}

return 0;
}

describe('tmp eclipse/gem probe',()=>{ it('runs', async()=>{ await main(); expect(true).toBe(true); }, 300000); });
