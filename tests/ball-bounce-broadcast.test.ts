// 859 沙滩球踢次世界聊天广播清偿（2026-09-03）：
//   Projectile.cs:18714-18728 type==155 撞墙支：ai[1]>10 →
//   ChatHelper.BroadcastChatMessage(NetworkText.FromKey("Game.BallBounceResult",
//   FromKey(弹名), ai[1]), ChatColors.ServerMessage)（ChatColors.cs:13 = 255,240,20）;
//   ai[1]=0 重置。本仓广播单口 = game.chatBroadcast（单机 ChatMonitor + 联机
//   channel2 系统行中继其他端）；文案键 Game.BallBounceResult 为原版 l10n 键
//   （en "{0} was hit {1} times before touching the ground!" / zh "{0}在落地前被击中{1}次！"）。
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { BeachBallProj } from '../src/entities/BallProjs';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { Lang } from '../src/i18n/Lang';
import { languageManager } from '../src/i18n/LanguageManager';
import type { GameHooks } from '../src/entities/types';

beforeAll(() => {
  // l10n 资产直载（tests/chat-commands.test.ts 同式）——广播文本断言用真值非键回退
  languageManager.loadPackJson(JSON.parse(readFileSync('public/l10n/zh-Hans.json', 'utf8')));
});

function makeGame(w: World) {
  const broadcast: Array<{ text: string; r: number; g: number; b: number }> = [];
  const game = {
    world: w,
    player: { x: -9999, y: -9999, w: 20, h: 42, cx: 0, cy: 0, dead: true, iframes: 0 },
    enemies: () => [], critters: () => [], npcs: () => [], projectiles: () => [],
    playSfx: () => {}, playSfxFiles: () => {}, spawnParticles: () => {},
    addDamageNumber: () => {}, spawnDrop: () => null, cutTile: () => {},
    damagePlayer: (): number => 0, onEnemyKilled: () => {}, spawnEnemy: () => ({}),
    chatBroadcast: (text: string, r: number, g: number, b: number) => { broadcast.push({ text, r, g, b }); },
  } as unknown as GameHooks;
  return { game, broadcast };
}

describe('沙滩球 155 踢次广播（Projectile.cs:18719）', () => {
  it('ai[1]>10 撞墙 → Game.BallBounceResult(弹名,踢次) + ServerMessage(255,240,20)', () => {
    const w = new World(80, 80, 5, 'open');
    const { game, broadcast } = makeGame(w);
    const ball = new BeachBallProj(40 * TILE, 40 * TILE, 2, 4);
    ball.bounceCount = 11;                      // ai[1]=11 > 10
    // 触发撞墙支：hitWall 走 stepWithCollision → 直接置位撞墙旗后过反跳段
    ball.hitWall = true;
    ball.collideY = false;
    // fixedUpdate 内 stepWithCollision 会重算 hitWall——用空地世界则无碰撞;
    // 改走公开面：直接调 fixedUpdate 前把它放到实心格上方 1px,保证撞墙态
    for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 45, 1, 0, 0);
    (ball as { x: number; y: number }).x = 40 * TILE;
    (ball as { x: number; y: number }).y = 45 * TILE - 44 - 1;   // 底缘贴地
    (ball as { vy: number }).vy = 6;
    ball.fixedUpdate(1 / 60, game);
    expect(broadcast.length).toBe(1);
    const name = Lang.projectileName(155) ?? '';
    // 文本 = Game.BallBounceResult 模板解析值（含弹名与踢次,非键回退）
    expect(broadcast[0]!.text).toBe(Lang.text('Game.BallBounceResult', name, 11));
    expect(broadcast[0]!.text).toContain(name);
    expect(broadcast[0]!.text).toContain('11');
    expect(broadcast[0]!.text).not.toContain('Game.BallBounceResult');
    expect(broadcast[0]!.r).toBe(255);
    expect(broadcast[0]!.g).toBe(240);
    expect(broadcast[0]!.b).toBe(20);
    expect(ball.bounceCount).toBe(0);           // ai[1]=0 重置（:18721）
  });

  it('ai[1]<=10 撞墙 → 不广播（仅反弹重置）', () => {
    const w = new World(80, 80, 5, 'open');
    const { game, broadcast } = makeGame(w);
    const ball = new BeachBallProj(40 * TILE, 40 * TILE, 2, 4);
    ball.bounceCount = 10;                      // 恰 10 不广播（原版严格 >10）
    for (let x = 0; x < 80; x++) w.store.setTileSilent(x, 45, 1, 0, 0);
    (ball as { x: number; y: number }).x = 40 * TILE;
    (ball as { x: number; y: number }).y = 45 * TILE - 44 - 1;
    (ball as { vy: number }).vy = 6;
    ball.fixedUpdate(1 / 60, game);
    expect(broadcast.length).toBe(0);
    expect(ball.bounceCount).toBe(0);
  });

  it('文案 = 原版 l10n 键 Game.BallBounceResult 的【解析值】（非键回退）', () => {
    const name = Lang.projectileName(155) ?? '';
    expect(name.length).toBeGreaterThan(0);                        // ProjectileName.BeachBall
    const rendered = Lang.text('Game.BallBounceResult', name, 11);
    expect(rendered).not.toContain('Game.BallBounceResult');       // 键已解析
    expect(rendered).toContain(name);
    expect(rendered).toContain('11');
  });
});
