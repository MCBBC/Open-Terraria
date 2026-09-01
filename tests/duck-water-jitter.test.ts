// 鸭族水陆形态抖动回归（2026-08-21 用户实报"鸭子在水中飞/游之间抽搐"）：
// 标杆 NPC.cs AI_068——落地段 :34994-34996 `ai[0]=0; ai[1]=0f`（飞行计时清零）；
// 走→飞变形（:53585-53589 → Transform(363,0,0)）新飞形 ai 从 0 起步。
// ★曾两处错把 Transform 第三参 200+Next(200)（那是给新走形的站计时）用在飞形自身：
// ①落地 ai1 = 200+rand(200) → 惊飞（ai0=1）几 tick 就 ai1≥300 → 立即降落 →
//   水面又惊飞 → 飞秒落循环 = 飞/游动画帧抽搐；
// ②走→飞变形继承走形 ai1（站计时 200-898）→ 新飞形 ai1 恒 ≥200 → 同秒落循环。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 80, H = 40, FLOOR = 30;

function makeWorld(): World {
  const w = new World(W, H, 11, 'duck-jitter');
  const st = w.store;
  for (let x = 0; x < W; x++) st.setTile(x, FLOOR, 1);
  return w;
}

function makeHooks(w: World) {
  const rec = { enemies: [] as Enemy[], projectiles: [] as unknown[] };
  let nextId = 1;
  const player = new Player(40 * TILE, (FLOOR - 4) * TILE, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => rec.enemies, critters: () => [], npcs: () => [],
    damagePlayer: (): number => 0, spawnDrop: () => null, addDamageNumber: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, spawnParticles: () => {},
    spawnBurst: () => {}, addLightAt: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    showPickupLabel: () => {}, cutTile: () => {}, breakTile: () => {},
    scene: { zoneGraveyard: false },
    entities: { nextId, add: (e: unknown, bucket: string) => {
      (e as { id: number }).id = nextId++;
      if (bucket === 'enemies') rec.enemies.push(e as Enemy);
    } },
  } as unknown as GameHooks;
  return { hooks, rec, player };
}

const drive = (e: Enemy, fn: string) =>
  (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>)[fn];

describe('鸭族飞形 ai1 计时链（AI_068 :34994/:34996）', () => {
  it('走→飞变形：新飞形 ai0/ai1 从 0 起步（Transform(363,0,0)）', () => {
    const w = makeWorld();
    const { hooks, rec } = makeHooks(w);
    const duck = Enemy.fromVanilla(362, 20 * TILE, (FLOOR - 1) * TILE);
    if (!duck) return;
    duck.id = 1; rec.enemies.push(duck);
    // 走形站计时设高（模拟站了很久）
    duck.ai0 = 0; duck.ai1 = 898; duck.wet = true;
    drive(duck, 'townCritterWalkAI').call(duck, hooks, null);
    // wet → 变形为 363 + ai 归零
    expect(duck.vanillaId).toBe(363);
    expect(duck.ai0).toBe(0);
    expect(duck.ai1).toBe(0, '飞形 ai1 必须归零（继承走形站计时 = 起飞即降落段）');
  });

  it('飞形落地（入水）：ai0=0 且 ai1=0（非 200+rand(200)）', () => {
    const w = makeWorld();
    const st = w.store;
    // 水面：FLOOR 上方 3 格水
    for (let x = 10; x < 30; x++) for (let y = FLOOR - 3; y < FLOOR; y++) st.liquid[st.idx(x, y)] = 255;
    const { hooks, rec, player } = makeHooks(w);
    const duck = Enemy.fromVanilla(363, 20 * TILE, (FLOOR - 2) * TILE);
    if (!duck) return;
    duck.id = 1; rec.enemies.push(duck);
    // 模拟飞行已到降落段：ai0=1, ai1=350；玩家远离（不触发惊飞）
    duck.ai0 = 1; duck.ai1 = 350; duck.wet = true;
    duck.vx = 1; duck.vy = 2;
    player.x = 200 * TILE; player.y = 200 * TILE;   // 玩家远离
    drive(duck, 'duckFlyAI').call(duck, hooks, player);
    expect(duck.ai0).toBe(0);
    expect(duck.ai1, '落地 ai1 归零（200+rand 曾致惊飞秒落循环）').toBe(0);
  });

  it('水面模式惊飞 → 飞 300t 才再落（不再秒落）', () => {
    const w = makeWorld();
    const st = w.store;
    for (let x = 10; x < 30; x++) for (let y = FLOOR - 3; y < FLOOR; y++) st.liquid[st.idx(x, y)] = 255;
    const { hooks, rec, player } = makeHooks(w);
    const duck = Enemy.fromVanilla(363, 20 * TILE, (FLOOR - 2) * TILE);
    if (!duck) return;
    duck.id = 1; rec.enemies.push(duck);
    // 水面模式 + 玩家在旁 → 惊飞
    duck.ai0 = 0; duck.ai1 = 0; duck.wet = true;
    player.x = duck.cx - 50; player.y = duck.cy;
    drive(duck, 'duckFlyAI').call(duck, hooks, player);
    expect(duck.ai0).toBe(1, '惊飞进入飞行态');
    // 修后 ai1 从 0 起步 → 跑 299 tick 不应落地（ai1 < 300）
    for (let i = 0; i < 299; i++) drive(duck, 'duckFlyAI').call(duck, hooks, player);
    expect(duck.ai0, '飞行满 299t 仍在飞（旧 bug 会 ai1≥300 秒落）').toBe(1);
    // 第 300 tick 进入降落段（碰水落地）
    drive(duck, 'duckFlyAI').call(duck, hooks, player);
    expect(duck.ai1).toBeGreaterThanOrEqual(300);
  });
});
