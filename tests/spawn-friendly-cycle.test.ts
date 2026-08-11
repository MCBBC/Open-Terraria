// spawnFriendly 掷骰回归(NPC.cs:711-832):
//   外层门(白天/非血月/非邪恶区) && townNPCs 决定友好概率;
//   townNPCs==0 → 永不友好(不出小动物——浮空岛/荒野无 NPC,原版语义);
//   友好轮 SpawnAnNPC 只走小动物链(else-if :2006),敌怪链整体跳过。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { VanillaSpawner } from '../src/world/spawn/VanillaSpawner';
import { RNG } from '../src/core/rng';

const CRITTER_IDS = new Set([357, 377, 46, 299, 300, 74, 148, 149]);

describe('spawnFriendly 掷骰（NPC.cs:711-832）', () => {
  it('townNPCs=0 → spawnFriendlyCycle 恒 false(不出小动物)', () => {
    const w = new World(400, 600, 42, 'rate-test');
    const sp = new VanillaSpawner(w);
    let friendlyHits = 0;
    for (let k = 0; k < 300; k++) {
      sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false,
        0, true, false, false);
      if ((sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle) friendlyHits++;
    }
    expect(friendlyHits).toBe(0);
  });

  it('townNPCs≥3 + 白天地表 → 友好轮概率高;夜/血月/邪恶区关闭', () => {
    const w = new World(400, 600, 42, 'rate-test');
    const sp = new VanillaSpawner(w);
    const cycle = () => (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle;
    let dayHits = 0;
    for (let k = 0; k < 100; k++) {
      sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 3, true, false, false);
      if (cycle()) dayHits++;
    }
    expect(dayHits).toBe(100);           // :824 非 ftw 恒友好
    // 夜间:外层门 !bloodMoon||dayTime → 夜+非血月仍过门(原版夜晚也可友好);
    // 血月夜 → 门关
    let bloodHits = 0;
    for (let k = 0; k < 100; k++) {
      sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 3, false, false, true);
      if (cycle()) bloodHits++;
    }
    expect(bloodHits).toBe(0);           // 血月夜门关
    // 邪恶区 → 门关
    let evilHits = 0;
    for (let k = 0; k < 100; k++) {
      sp.getSpawnRate(100 * 16, 0, false, 800, 100 * 16, false, false, false, false, 3, true, true, false);
      if (cycle()) evilHits++;
    }
    expect(evilHits).toBe(0);
  });

  it('友好轮敌怪链守卫:spawnFriendlyCycle=true 时 spawn 不出敌怪(岛边场景)', () => {
    const w = new World(400, 600, 42, 'rate-test');
    const st = w.store;
    const sp = new VanillaSpawner(w);
    // 构造:草地面(地表 y=100) + 玩家站在旁边
    for (let x = 80; x < 120; x++) {
      st.setTileSilent(x, 100, 1 /* dirt */, 0, 0);
    }
    (sp as unknown as { spawnFriendlyCycle: boolean }).spawnFriendlyCycle = true;
    sp.setPlayerFlags(false, false);
    let enemySpawned = 0;
    for (let k = 0; k < 400; k++) {
      const e = sp.spawn(100 * 16, 96 * 16, new RNG(k * 7919 + 13), 30, 18);
      if (e && e.vanillaId != null && !CRITTER_IDS.has(e.vanillaId)) enemySpawned++;
    }
    expect(enemySpawned).toBe(0);        // 友好轮绝不落入敌怪链
  });
});
