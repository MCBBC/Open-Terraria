// 蠕虫族掘地音效回归（AI_006 :52375-52395）：
//   EoW 三段(13-15) → eowDig 专属轨；【其余蠕虫(骨蛇39/食世者等) → Roar_1】
//   ——PlaySound(15,x,y) 无 style → LegacySoundPlayer Style 缺省 1 = Roar_1
//   (boss 唤醒才是显式 style0=Roar_0;曾用 'roar' 键随机双轨,一半概率播成
//   boss 唤醒音 + Roar_1 被 FILE_CASE_VOL 误乘 0.25,2026-08-18 修正)
//   间隔=距离/40 钳 10..20；排除表 621/87/117/454/412 不发声；仅 buried(掘地分支)发声
import { describe, it, expect, vi } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { Sfx } from '../src/core/Sfx';
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
    playSfx: (name: string) => { sounds.push(`sfx:${name}`); },
    playSfxWav: (file: string) => { sounds.push(file); },
    playSfxFiles: () => {},
    addDamageNumber: () => {},
    damagePlayer: (): number => 0,
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
  it('骨蛇 39(埋地)周期性 Roar_1(非 boss 唤醒轨)', () => {
    const sounds: string[] = [];
    runWorm(39, sounds);
    const roars = sounds.filter((s) => s === 'Roar_1');
    expect(roars.length).toBeGreaterThanOrEqual(3);   // 240t / 间隔≤20 → ≥3 次
    expect(sounds).not.toContain('dig');              // ★曾误用 dig 近似
    expect(sounds).not.toContain('sfx:roar');         // ★曾用 roar 键随机出 Roar_0(boss 唤醒音)
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
    expect(sounds.filter((s) => s === 'eowDig' || s === 'sfx:eowDig').length).toBeGreaterThanOrEqual(3);
    expect(sounds).not.toContain('sfx:roar');
    expect(sounds).not.toContain('Roar_1');
  });

  it('排除表 412(任务蠕虫)不发声', () => {
    const sounds: string[] = [];
    runWorm(412, sounds);
    expect(sounds).not.toContain('sfx:roar');
    expect(sounds).not.toContain('Roar_1');
    expect(sounds).not.toContain('eowDig');
    expect(sounds).not.toContain('sfx:eowDig');
  });
});

// ---- case 15 单实例互斥（LegacySoundPlayer :825-841 State==Playing 跳过）----
// 毁灭者 80 段各自掷 soundDelay 靠同槽互斥收敛单声——治"满响吼叫音墙"的关键机制
describe('Roar 单实例互斥（case 15）', () => {
  it('Roar_1 播放中不重触发,播完(onended)后可重播;NPC_Killed_4 不受互斥', async () => {
    // stub 最小 AudioContext 链(node 环境无 window)
    const started: Array<{ onended: (() => void) | null }> = [];
    const fakeSrc = () => ({
      buffer: null, playbackRate: { value: 1 },
      connect() { return this; }, start() { started.push(this as never); }, stop() {},
      onended: null as (() => void) | null,
    });
    const fakeCtx = {
      state: 'running', currentTime: 0, destination: {},
      resume: () => Promise.resolve(),
      createBufferSource: fakeSrc,
      createGain: () => ({ gain: { value: 0, setValueAtTime() {}, setTargetAtTime() {} },
        connect() { return this; }, disconnect() {} }),
    };
    vi.stubGlobal('window', { AudioContext: class { constructor() { Object.assign(this, fakeCtx); } } });
    const sfx = new Sfx();
    // 喂已解码缓冲,绕过 fetch
    (sfx as unknown as { buffers: Map<string, unknown> }).buffers
      .set('Roar_1', { fake: 1 }).set('Roar_0', { fake: 1 }).set('NPC_Killed_4', { fake: 1 });
    expect(sfx.playWavFile('Roar_1', 1)).toBe(true);
    expect(sfx.playWavFile('Roar_1', 1)).toBe(false);   // 播着跳过
    expect(sfx.playWavFile('Roar_0', 1)).toBe(true);    // 分槽:Roar_0 独立
    expect(sfx.playWavFile('NPC_Killed_4', 1)).toBe(true);  // 非互斥族不拦
    // case36 ForceRoar 语义(:1312-1325 直接覆盖槽,旧实例续播):replace 豁免互斥
    expect(sfx.playWavFile('Roar_0', 1, undefined, undefined, undefined, true)).toBe(true);
    started[0].onended?.();                             // Roar_1 自然播完
    expect(sfx.playWavFile('Roar_1', 1)).toBe(true);    // 槽释放可重播
    vi.unstubAllGlobals();
  });
});
