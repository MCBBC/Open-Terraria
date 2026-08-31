// ★B2①（2026-08-31）石化过渡碎裂声回归——独立文件防并行会话 buffer 覆写。
// 原版真值锚：Player.cs:25414-25431 过渡段（双向）——Hurt(ByOther(5)) →
// SoundEngine.PlaySound(0,x,y)（:25417,Hurt→Sound→尘 序）→ 尘 20；legacy 案号 0 =
// Dig 三变体（LSP.cs:443-458 Next(3) 择轨 + Next(-10,11)×0.01 抖动,case 内无音量修正
// ⇒ volumeScale 1）。别名现状=public/sounds/Dig_{0,1,2}.wav 在盘 + Sfx WAV_MAP.dig/
// PITCH 表就位 → 「接真名」支落地（非登记缺失走兜底支）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import { TILE_BY_KEY } from '../src/data/tiles';

type DigCall = [string[], number?, number?, number?];

function mkEnv(seed: number) {
  const w = new World(72, 96, seed, 'b2-stoned-dig');
  for (let x = 10; x <= 60; x++) w.store.setTileSilent(x, 52, TILE_BY_KEY['dirt']);
  const p = new Player(30 * 16, 44 * 16, new Inventory());
  const digCalls: DigCall[] = [];
  const particles: string[] = [];
  const hooks: Record<string, unknown> = {
    world: w,
    player: p,
    enemies: () => [],
    critters: () => [],
    projectiles: () => [],
    spawnDrop: () => null,
    damagePlayer: () => 40,
    settlePlayerDeath: () => {},
    addDamageNumber: vi(),
    cutTile: vi(),
    breakTile: vi(),
    fellCactus: vi(),
    onEnemyKilled: vi(),
    spawnEnemy: vi(),
    spawnParticles: (_x: number, _y: number, color: string): void => { particles.push(color); },
    broadcastParticleOrchestra: vi(),
    notifyInventoryChanged: vi(),
    playSfx: vi(),
    playSfxFiles: (files: string[], vol?: number, x?: number, y?: number): void => {
      digCalls.push([files, vol, x, y]);
    },
    showPickupLabel: vi(),
    punchCamera: vi(),
    sfx: { play: vi(), playWavFile: vi() },
  };
  return { p, hooks: hooks as never, digCalls, particles };
}

function vi(): (...a: unknown[]) => void {
  return () => {};
}

const isDig = (call: DigCall | undefined): call is DigCall =>
  !!call && call[0].length === 3 && call[0].every((f) => /^Dig_[0-2]$/.test(f));

describe('★B2① 石化过渡碎裂声：SoundEngine.PlaySound(0)=Dig 真名直播（:25417 双向各一次）', () => {
  it('成型过渡拍播 Dig 三变体、音量=volumeScale 1;解除反向过渡同样发一声', () => {
    const { p, hooks, digCalls } = mkEnv(43);
    p.buffs.apply(BuffType.Stoned, 5);
    let entered = false;
    for (let i = 0; i < 400 && !entered; i++) {
      p.fixedUpdate(1 / 60, hooks);
      entered = digCalls.some(isDig);
    }
    expect(entered).toBe(true);                       // 成型过渡必有碎裂声（曾缺省播报）
    const call = digCalls.find(isDig)!;
    expect(call[1]).toBe(1);                          // volumeScale 缺省（裸 PlaySound(0,x,y)）
    expect(typeof call[2]).toBe('number');            // 定位参与 pan/atten
    // 解除侧：剥除 buff → 反向过渡再发一次（原文无条件段）
    const before = digCalls.filter(isDig).length;
    p.buffs.remove(BuffType.Stoned);
    p.fixedUpdate(1 / 60, hooks);
    expect(digCalls.filter(isDig).length).toBe(before + 1);
  }, 20000);

  it('冷却外的普通 tick 不发碎裂声（无过渡即无声）', () => {
    const { p, hooks, digCalls } = mkEnv(44);
    for (let i = 0; i < 60; i++) p.fixedUpdate(1 / 60, hooks);
    expect(digCalls.filter(isDig).length).toBe(0);    // 平常帧零 Dig 调用
  }, 20000);
});
