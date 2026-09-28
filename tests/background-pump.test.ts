// ★后台 tick 泵锁（2026-09-28 用户需求:后台挂机——切后台 rAF 停发=世界冻结的
// Web 缺口;BackgroundPump worker 250ms 泵消息 → Game.onPumpMsg 四门 → fixedUpdate
// 驱动+跳过渲染）。量面：
//  ①pumpGate 真值表（两设置独立并存都要开才后台活/暂停尊重/前台竞态零痕/菜单零副作用）
//  ②pumpAccumulate 累计器契约（真实流逝 dt/单泵 ≤30 高钳/累计不爆发/余量跨泵携带/交接零爆发）
//  ③worker 条目纯泵锁（零 import/间隔 250ms 禁改大/op:'pump'）
//  ④Game 接线源锚（现场重判/单一时间权威/高钳/冻结帧复用/装配+拆除/交接诊断）
//  ⑤Options/Settings 接线源锚（缺省开+读档卫门+行序紧随失焦播放）
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  pumpGate, pumpAccumulate, BG_PUMP_INTERVAL_MS, BG_PUMP_MAX_TICKS,
} from '../src/core/BackgroundPumpCore';

const WORKER = readFileSync(new URL('../src/workers/BackgroundPump.ts', import.meta.url), 'utf8');
const GAME = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');
const OPTIONS = readFileSync(new URL('../src/core/Options.ts', import.meta.url), 'utf8');
const SETTINGS = readFileSync(new URL('../src/ui/Settings.ts', import.meta.url), 'utf8');

const DT = 1 / 60;
/** 基线=全开门（泵驱动态）;逐字段翻转断言 */
const gate = (o: Partial<Parameters<typeof pumpGate>[0]>) => pumpGate({
  running: true, world: true, hidden: true, backgroundRun: true, playWhenUnfocused: true, paused: false,
  ...o,
});

describe('pumpGate 真值表（两设置独立并存;都要开才后台活）', () => {
  it('基线:两开关开+hidden+非暂停+世界在场+running=泵驱动', () => {
    expect(gate({})).toBe(true);
  });
  it('前台（hidden=false）=泵零痕（rAF 原路径零变化）', () => {
    expect(gate({ hidden: false })).toBe(false);
  });
  it('backgroundRun=off=泵消息忽略（旧行为）', () => {
    expect(gate({ backgroundRun: false })).toBe(false);
  });
  it('playWhenUnfocused=off=失焦自暂停域（applyFocusPause 置 paused,含泵消息先于 visibilitychange 的置位竞态窗）→ 泵不跑', () => {
    expect(gate({ playWhenUnfocused: false })).toBe(false);
    expect(gate({ playWhenUnfocused: false, paused: true })).toBe(false);
  });
  it('暂停（手动/autoPause/失焦自暂停）=泵不越权（世界停=用户选择）', () => {
    expect(gate({ paused: true })).toBe(false);
  });
  it('菜单期（无世界）/主循环停机=无泵（零副作用）', () => {
    expect(gate({ world: false })).toBe(false);
    expect(gate({ running: false })).toBe(false);
  });
});

describe('pumpAccumulate 累计器契约（真实流逝 dt;单泵高钳;累计不爆发）', () => {
  it('250ms 泵节拍=15 tick（真实流逝推进,不冻结不加速）', () => {
    const r = pumpAccumulate(0, 0.25, DT, BG_PUMP_MAX_TICKS);
    expect(r.steps).toBe(15);
    expect(Math.abs(r.acc)).toBeLessThan(DT);   // 余量 < 1 tick
  });
  it('亚 tick 余量跨泵携带（不丢不重——交接/迟滞下零双计）', () => {
    const r1 = pumpAccumulate(0, 0.21, DT, BG_PUMP_MAX_TICKS);   // 12 tick 余 ~0.01
    expect(r1.steps).toBe(12);
    const r2 = pumpAccumulate(r1.acc, 0.05, DT, BG_PUMP_MAX_TICKS);   // +3 tick
    expect(r2.steps).toBe(3);
    expect(r2.acc).toBeGreaterThan(0.005);
    expect(r2.acc).toBeLessThan(0.015);
  });
  it('单泵 ≤30 高钳:2s 迟滞只走 30 tick 且累计器清零（累计不爆发）', () => {
    const r = pumpAccumulate(0, 2, DT, BG_PUMP_MAX_TICKS);
    expect(r.steps).toBe(BG_PUMP_MAX_TICKS);
    expect(r.acc).toBe(0);
  });
  it('钳满后不携余量:下一泵只走当拍真实流逝（15 tick=250ms 节拍）', () => {
    const a = pumpAccumulate(0, 5, DT, BG_PUMP_MAX_TICKS);
    expect(a.acc).toBe(0);
    const b = pumpAccumulate(a.acc, 0.25, DT, BG_PUMP_MAX_TICKS);
    expect(b.steps).toBe(15);
  });
  it('负 dt（时钟回拨）不吃 tick', () => {
    expect(pumpAccumulate(0, -1, DT, BG_PUMP_MAX_TICKS).steps).toBe(0);
  });
  it('交接零爆发:泵尾态余量 <1 tick,前台首帧 dt≤250ms 落在既有每帧 ≤5 步钳内（rAF 侧钳不动）', () => {
    const pumpTail = pumpAccumulate(0, 0.25, DT, BG_PUMP_MAX_TICKS);
    expect(Math.abs(pumpTail.acc)).toBeLessThan(DT);   // 泵只更新 lastTime → 首个 rAF dt ≤~250ms
  });
});

describe('worker 条目纯泵锁（零依赖;间隔常数与核心单源）', () => {
  it('零 import（worker chunk 极小;判定面=源文件无 import 语句）', () => {
    expect(WORKER.match(/^\s*import\s/m)?.length ?? 0).toBe(0);
  });
  it('250ms 间隔字面与 BG_PUMP_INTERVAL_MS 同源（泵间隔禁改大:2s 看门狗线依据）', () => {
    const m = WORKER.match(/const PUMP_INTERVAL_MS = (\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(BG_PUMP_INTERVAL_MS);
    expect(WORKER).toContain('}, PUMP_INTERVAL_MS);');   // 实参确用该常数
  });
  it('泵消息带 op:\'pump\'（主线程协议面）', () => {
    expect(WORKER).toContain("op: 'pump'");
  });
});

describe('Game 接线源锚（泵处理器/装配/拆除/交接诊断）', () => {
  it('onPumpMsg 走 pumpGate 现场重判（hidden/两设置全参灌入——处理时刻为准）', () => {
    expect(GAME).toContain('hidden: document.hidden');
    expect(GAME).toContain('backgroundRun: options.data.backgroundRun');
    expect(GAME).toContain('playWhenUnfocused: options.data.playWhenUnfocused');
    expect(GAME).toContain('paused: this.paused');
  });
  it('单一时间权威:泵消费后 lastTime=now（双向交接的根;门拒路径不碰 lastTime）', () => {
    expect(GAME).toContain('this.lastTime = now;   // ★单一时间权威:谁消费谁更新');
  });
  it('单泵高钳接 BG_PUMP_MAX_TICKS（前台 ≤5 钳语义不动）', () => {
    expect(GAME).toContain('pumpAccumulate(this.acc, dtMs / 1000, FIXED_DT, BG_PUMP_MAX_TICKS)');
    expect(GAME.match(/steps < 5\)/g)?.length ?? 0).toBeGreaterThanOrEqual(1);   // 前台钳保留
  });
  it('entry freeze 期泵跑冻结帧面（entryFreezeTick 复用=与 rAF 冻结帧同源）', () => {
    expect(GAME).toContain('if (this._entryFreeze) { this.entryFreezeTick(); return; }');
  });
  it('装配（new Worker URL 条目）+拆除（terminate 槽位归零,BJ328 纪律）', () => {
    expect(GAME).toContain("new Worker(new URL('../workers/BackgroundPump.ts', import.meta.url)");
    expect(GAME).toContain('this.pumpWorker.terminate()');
    expect(GAME).toContain('this.pumpWorker = null');
  });
  it('异常熔断闩（泵路径首抛即停,防 4 次/秒错误风暴）', () => {
    expect(GAME).toContain('_bgPumpDead');
  });
  it('交接诊断 bgPumpStart/bgPump/bgPumpEnd 入 recLog perf', () => {
    expect(GAME).toContain("ev: 'bgPumpStart'");
    expect(GAME).toContain("ev: 'bgPump'");
    expect(GAME).toContain("ev: 'bgPumpEnd'");
  });
});

describe('Options/Settings 接线源锚', () => {
  it('Options 字段缺省开+读档布尔卫门', () => {
    expect(OPTIONS).toContain('backgroundRun: boolean;');
    expect(OPTIONS).toContain('backgroundRun: true');
    expect(OPTIONS).toContain("this.data.backgroundRun = true");
  });
  it('Settings 行存在且紧随失焦播放行之后（同域相邻）', () => {
    const puw = SETTINGS.indexOf("Lang.text('UI.PlayWhenUnfocusedOn').replace");
    const bg = SETTINGS.indexOf('Mods.SandboxWorld.Settings.BackgroundRun');
    expect(puw).toBeGreaterThan(-1);
    expect(bg).toBeGreaterThan(puw);
  });
});
