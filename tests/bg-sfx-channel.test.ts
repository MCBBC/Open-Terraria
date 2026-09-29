// ★后台 SFX 通道锁（2026-09-29 用户报「后台泵模式（世界照跑+BGM 在）下雨声/怪物声
// 等音效消失」定谳三因 → 三刀）：
//  因①sfx ctx 失焦挂起（Sfx.setAudioSuspension——PauseSounds :97-107 Web 同构）
//  因②环境面失焦归零（Sfx.ambientQuiet——QuietAmbientSounds :109 同构）
//  因③环境 cue 斜坡（雨声 cue28/风声 cue45）住 frame() rAF 相——隐藏标签页 rAF 停转
//     =斜坡冻结（frame() audioAcc 块头注原「登记未接」债）。
//  修 = Sfx.bgAudioProbe（pumpGate 四门同口径探针,Sfx 三消费点）+ Game 构造期接线/
//  destroy 摘除 + onPumpMsg 后台音频 pass（与 frame() audioAcc 块逐行同构公式）。
//  语义锚：后台=「世界照常运转只是看不见」——SFX 按更新路径的既有判定面延续
//  （atten 2500px 监听器距离衰减=屏内判定的原版同构,后台泵里监听器随玩家/相机照常
//  刷新）;怪声（Enemy.ambientSoundTick）与一次性事件族住 fixedUpdate 泵已覆盖。
import { describe, it, expect, afterEach } from 'vitest';
import { Sfx } from '../src/core/Sfx';
import { readFileSync } from 'node:fs';

/** AudioContext 结构桩（闸只消费 state/suspend/resume——playwhenunfocused 同款） */
class FakeCtx {
  state: 'running' | 'suspended' = 'running';
  suspendCount = 0;
  resumeCount = 0;
  async suspend(): Promise<void> { this.state = 'suspended'; this.suspendCount++; }
  async resume(): Promise<void> { this.state = 'running'; this.resumeCount++; }
}

const registry = () => (Sfx as unknown as { ctxRegistry: Map<unknown, string> }).ctxRegistry;
/** 失焦两源静态（node 无 document 不挂钩,直接置源驱动合并态） */
const focusSrc = () => (Sfx as unknown as { visHidden: boolean; winBlurred: boolean });
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const asCtx = (c: FakeCtx) => c as unknown as AudioContext;

afterEach(() => {
  Sfx.mpProbe = null;
  Sfx.bgAudioProbe = null;
  registry().clear();
  focusSrc().visHidden = false;
  focusSrc().winBlurred = false;
});

describe('Sfx.bgAudioProbe（后台泵音频豁免探针）', () => {
  it('探针 null（未接）+ 失焦：sfx ctx 照旧挂起（旧行为保持,现状=后台静音）', async () => {
    const sfx = new FakeCtx();
    registry().set(asCtx(sfx), 'sfx');
    focusSrc().visHidden = true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(sfx.state).toBe('suspended');
    expect(sfx.suspendCount).toBe(1);
  });

  it('探针开（pumpGate 全开）+ 失焦：sfx ctx 不挂起（PauseSounds 后台泵豁免臂）', async () => {
    const sfx = new FakeCtx();
    registry().set(asCtx(sfx), 'sfx');
    focusSrc().visHidden = true;
    Sfx.bgAudioProbe = () => true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(sfx.state).toBe('running');
    expect(sfx.suspendCount).toBe(0);
  });

  it('探针开+失焦后回前台：resume 恢复路径不受豁免影响（两态对合）', async () => {
    const sfx = new FakeCtx();
    sfx.state = 'suspended';
    registry().set(asCtx(sfx), 'sfx');
    focusSrc().visHidden = true;
    Sfx.bgAudioProbe = () => true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(sfx.resumeCount).toBe(0);        // 豁免=不动（不 resume 也不 suspend）
    focusSrc().visHidden = false;
    Sfx.setAudioSuspension(false);
    await flush();
    expect(sfx.state).toBe('running');
    expect(sfx.resumeCount).toBe(1);
  });

  it('music ctx 不吃本探针（放行面仍是 playWhenUnfocused——AllowMusic 独立分域）', async () => {
    const music = new FakeCtx();
    registry().set(asCtx(music), 'music');
    focusSrc().visHidden = true;
    Sfx.bgAudioProbe = () => true;
    Sfx.setAudioSuspension(true);
    await flush();
    expect(music.state).toBe('suspended');  // playWhenUnfocused=false → music 照停
  });

  it('ambientQuiet：未激活+探针 null=0（QuietAmbientSounds 旧行为）;探针开=1（环境面后台放行）;MP 探针不放行环境面（:109 无 netMode 门语义保持）', () => {
    const sfx = new Sfx();
    const ambientQuiet = () => (sfx as unknown as { ambientQuiet(): number }).ambientQuiet();
    focusSrc().visHidden = true;
    Sfx.mpProbe = () => true;
    expect(ambientQuiet()).toBe(0);          // MP 豁免下 ctx 在跑但环境轨仍归零（既有登记）
    Sfx.bgAudioProbe = () => true;
    expect(ambientQuiet()).toBe(1);          // 泵豁免=环境 cue/循环轨按冻结视口延续
    focusSrc().visHidden = false;
    expect(ambientQuiet()).toBe(1);          // 前台恒 1
  });
});

describe('后台音频 pass（Game.onPumpMsg——环境 cue 斜坡的泵驱动）', () => {
  const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
  const SFX = readFileSync(new URL('../src/core/Sfx.ts', import.meta.url), 'utf8');

  it('Game 接线源锚：探针=pumpGate 四门同口径（running/world/!paused+两开关）,destroy 摘除', () => {
    const iWire = GAME.indexOf('Sfx.bgAudioProbe = () =>');
    const iDestroy = GAME.indexOf('Sfx.bgAudioProbe = null;');
    expect(iWire).toBeGreaterThan(0);
    expect(iDestroy).toBeGreaterThan(iWire);
    const wire = GAME.slice(iWire, iWire + 300);
    expect(wire).toContain('this.running');
    expect(wire).toContain('!!this.world');
    expect(wire).toContain('!this.paused');
    expect(wire).toContain('options.data.backgroundRun');
    expect(wire).toContain('options.data.playWhenUnfocused');
  });

  it('onPumpMsg 后台音频 pass：audioAcc 同公式消费（elapsed 钳 0.25 同 frame）+BG_PUMP_MAX_TICKS 钳+driveAmbientCues', () => {
    const iMsg = GAME.indexOf('private onPumpMsg = (ev: MessageEvent): void => {');
    const iStart = GAME.indexOf('  start() {');
    expect(iMsg).toBeGreaterThan(0);
    const pump = GAME.slice(iMsg, iStart);
    expect(pump).toContain('this.audioAcc += Math.min(dtMs / 1000, 0.25);');
    expect(pump).toContain('while (this.audioAcc >= FIXED_DT && asteps < BG_PUMP_MAX_TICKS)');
    expect(pump.match(/this\.driveAmbientCues\(\)/g)?.length ?? 0).toBe(1);
    expect(pump).toContain('this.audioAcc -= FIXED_DT;');
  });

  it('frame() 前台 audioAcc 块不动（elapsed 原式+≤5 钳保留——前台零变化）', () => {
    expect(GAME).toContain('this.audioAcc += elapsed;');
    expect(GAME).toContain('while (this.audioAcc >= FIXED_DT && asteps < 5)');
    expect(GAME).toContain('this.driveAmbientCues();');
  });

  it('Sfx 三消费点源锚：setAudioSuspension/ensure gateBlocked/ambientQuiet 全走 bgAudioProbe', () => {
    expect(SFX).toContain('static bgAudioProbe: (() => boolean) | null = null;');
    expect(SFX).toContain("if (kind === 'sfx' && (Sfx.bgAudioProbe?.() ?? false)) continue;");
    expect(SFX).toContain('&& !(Sfx.bgAudioProbe?.() ?? false);');   // ensure gateBlocked
    expect(SFX).toContain('return (Sfx.bgAudioProbe?.() ?? false) ? 1 : 0;');   // ambientQuiet
  });
});
