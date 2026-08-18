// 蠕虫族掘地音效回归（AI_006 :52375-52395）：
//   EoW 三段(13-15) → eowDig 专属轨；【其余蠕虫(骨蛇39/食世者等) → roar】
//   ——用户报"地狱骨龙接近有音效"(2026-08-18)：SoundID 15 Roar,间隔=距离/40 钳 10..20
//   排除表 621/87/117/454/412 不发声；仅 buried(掘地分支)发声
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';

function makeWorld(): World {
  const w = new World(60, 60, 7, 'worm-roar-test');
  const st = w.store;
  // 全图填石(蠕虫埋地必经),仅中部挖 2x3 玩家腔
  for (let x = 0; x < 60; x++) for (let y = 0; y < 60; y++) st.setTileSilent(x, y, 2, 0, 0);
  for (let x = 30; x <= 31; x++) for (let y = 29; y <= 31; y++) st.setTile(x, y, 0, 0, 0);
  return w;
}

function makeGame(world: World, sounds: string[]) {
  return {
    world,
    player: { x: 30 * 16 + 16, y: 30 * 16, w: 12, h: 28, dead: false,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      vx: 0, vy: 0 },
    enemies: () => [],
    spawnParticles: () => {},
    playSfx: (name: string) => { sounds.push(name); },
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    damagePlayer: () => {},
    spawnDrop: () => {},
    spawnEnemy: () => null,
    spawnProj: () => {},
    onEnemyKilled: () => {},
    critters: () => [],
  } as unknown as GameHooks;
}

function runWorm(vanillaId: number, sounds: string[]): void {
  const w = makeWorld();
  const g = makeGame(w, sounds);
  const head = Enemy.fromVanilla(vanillaId, 40 * 16, 20 * 16);
  expect(head).not.toBeNull();
  // 躕过生成帧
  for (let t = 0; t < 240; t++) head!.fixedUpdate(1 / 60, g);
}

describe('蠕虫族掘地音效（AI_006 :52375-52395）', () => {
  it('骨蛇 39(埋地)周期性 roar', () => {
    const sounds: string[] = [];
    runWorm(39, sounds);
    const roars = sounds.filter((s) => s === 'roar');
    expect(roars.length).toBeGreaterThanOrEqual(3);   // 240t / 间隔≤20 → ≥3 次
    expect(sounds).not.toContain('dig');              // ★曾误用 dig 近似
  });

  it('EoW 头段 13 → eowDig 专属轨(非 roar)', () => {
    // EoW 断链自查(:51886 头无下段即灭)=原版语义——须手工建双段链
    const sounds: string[] = [];
    const w = makeWorld();
    const g = makeGame(w, sounds);
    const head = Enemy.fromVanilla(13, 40 * 16, 20 * 16)!;
    const tail = Enemy.fromVanilla(15, 41 * 16, 20 * 16)!;
    head.wormNext = tail; tail.wormFollow = head;
    for (let t = 0; t < 240; t++) { head.fixedUpdate(1 / 60, g); tail.fixedUpdate(1 / 60, g); }
    expect(sounds.filter((s) => s === 'eowDig').length).toBeGreaterThanOrEqual(3);
    expect(sounds).not.toContain('roar');
  });

  it('排除表 412(任务蠕虫)不发声', () => {
    const sounds: string[] = [];
    runWorm(412, sounds);
    expect(sounds).not.toContain('roar');
    expect(sounds).not.toContain('eowDig');
  });
});
