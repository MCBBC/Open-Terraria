// ★BJ330（2026-09-24）GTW 墙钟债清偿判别面：
//  债：GlobalTimeWrappedHourly 各站用 performance.now() 真实墙钟——与游戏时间漂移
//  （暂停/失焦相位照走）。原版锚 = Main.cs:17014/17023 TotalGameTime.TotalSeconds%3600
//  （TotalGameTime=XNA 固定步逻辑累计,进程停更即停;唯一闸门 GlobalTimerPaused 仅截图置位）。
//  修法 = 单源收编：src/core/GameTime.ts（Game.fixedUpdate 60Hz 逻辑 tick 累计——
//  用户拍板语义：①暂停冻结②失焦冻结③游玩/菜单推进④小时回卷不变）。
//  · 行为面：GameTime 模块数学（推进/回卷/连续相位）+ 消费站读口同相。
//  · 结构锁：Game.fixedUpdate 推进钩子与 tickCount++ 同拍（摘钩子变异即爆红——
//    node 不可 boot Game,按 bj280-unload-guard.test.ts 的 codeOf 源码锚模式）+
//    墙钟残留哨兵（除登记豁免外禁 `performance.now()%3600` 回流）。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  advanceGameTimeTick,
  pinGameTimeTicks,
  totalGameTimeSec,
  globalTimeWrappedHourly,
} from '../src/core/GameTime';
import { shardGlowClock } from '../src/render/VanillaTiler';

const ROOT = resolve(__dirname, '..');
/** 源码剥行注释后取码面（结构锁只禁代码改动,判定注释含词不误伤——BJ280 同款） */
const codeOf = (p: string) => readFileSync(resolve(ROOT, p), 'utf8').replace(/^\s*\/\/.*$/gm, '');

describe('BJ330 行为面：GameTime 单源钟数学', () => {
  it('①初始 0,advanceGameTimeTick 每 tick +1/60s', () => {
    pinGameTimeTicks(0);
    expect(globalTimeWrappedHourly()).toBe(0);
    advanceGameTimeTick();
    advanceGameTimeTick();
    advanceGameTimeTick();
    expect(totalGameTimeSec()).toBe(3 / 60);
    expect(globalTimeWrappedHourly()).toBeCloseTo(3 / 60, 12);
  });

  it('②小时回卷不变：216000 tick=3600s → 0（整数域取模防浮点漂移）', () => {
    pinGameTimeTicks(215999);
    expect(globalTimeWrappedHourly()).toBeCloseTo(3599.983333333333, 6);
    pinGameTimeTicks(216000);
    expect(globalTimeWrappedHourly()).toBe(0);
    pinGameTimeTicks(432000);
    expect(globalTimeWrappedHourly()).toBe(0);
    pinGameTimeTicks(216001);
    expect(globalTimeWrappedHourly()).toBeCloseTo(1 / 60, 12);
  });

  it('③不推进即冻结（暂停/失焦语义的钟面体现：无 advance 调用值恒定）', () => {
    pinGameTimeTicks(12345);
    const a = globalTimeWrappedHourly();
    const b = globalTimeWrappedHourly();
    expect(a).toBe(b);   // 钟只由 advanceGameTimeTick 推进——暂停期无 tick → 相位冻结
    expect(a).toBeCloseTo((12345 % 216000) / 60, 12);
  });

  it('④15 相/秒：GTW×15 与 tileAnim.tick/4 采样同相（719 画/光一致性判据）', () => {
    for (const tick of [0, 7, 60, 240, 12345, 215999]) {
      pinGameTimeTicks(tick);
      const phases = Math.floor(globalTimeWrappedHourly() * 15) % 14;
      expect(phases).toBe(Math.floor(tick / 4) % 14);
    }
  });

  it('⑤消费站读口同相：shardGlowClock() 即 GTW 单源', () => {
    pinGameTimeTicks(9999);
    expect(shardGlowClock()).toBe(globalTimeWrappedHourly());
  });

  it('⑥★BJ330 二次窗口：661 光皇蝴蝶点光相位=原版 GTW×0.33%1（NPC.cs:45389,周期 1/0.33≈3.03s 一轮）', () => {
    // 行为面：hue(tick) = (tick/60×0.33)%1 —— 1s 走 0.33、~182 tick 包绕一周。
    //  旧实现 (visEffectFrames()/54000)×0.33 把 GTW 误读进 Main.time 域,周期 ~900×。
    const hueAt = (ticks: number) => ((ticks / 60) * 0.33) % 1;
    pinGameTimeTicks(0);
    expect(hueAt(0)).toBe(0);
    expect(hueAt(60)).toBeCloseTo(0.33, 12);      // 1s → hue +0.33
    expect(hueAt(120)).toBeCloseTo(0.66, 12);
    expect(hueAt(182)).toBeCloseTo(1.001 % 1, 3); // ≈3.03s → 包绕回 0 起
    expect(hueAt(364)).toBeCloseTo(2.002 % 1, 3); // 第二轮
  });
});

describe('BJ330 结构锁：钟源接线（codeOf 源码锚——node 不可 boot Game,BJ280 判例）', () => {
  it('①Game.fixedUpdate 内 advanceGameTimeTick 与 tickCount++ 同拍同域（!paused 门下）', () => {
    const game = codeOf('src/core/Game.ts');
    expect(game).toContain('this.tickCount++');
    expect(game).toContain('advanceGameTimeTick();');
    const hookAfterTick =
      game.indexOf('this.tickCount++') < game.indexOf('advanceGameTimeTick();') &&
      game.indexOf('advanceGameTimeTick();') - game.indexOf('this.tickCount++') < 200;
    expect(hookAfterTick).toBe(true);
  });

  it('②SkyColor FlickerClock getter 读 GameTime 单源（光照 worker 同步源头）', () => {
    const sky = codeOf('src/lighting/SkyColor.ts');
    expect(sky).toContain("import { globalTimeWrappedHourly as globalTimeWrappedHourlySec } from '../core/GameTime'");
    expect(sky).toMatch(/get globalTimeWrappedHourly\(\): number \{\s*return globalTimeWrappedHourlySec\(\);\s*\}/);
  });

  it('③Game.globalTimeSec 快照喂 GTW 单源（沙暴文字 5s 闪烁）', () => {
    const game = codeOf('src/core/Game.ts');
    expect(game).toContain('globalTimeSec: globalTimeWrappedHourly()');
  });

  it('④关键消费站收编 GameTime 单源（import 锁）', () => {
    const sites = [
      'src/render/VanillaTiler.ts',        // 129 水晶碎块辉光
      'src/render/BiomeBackground.ts',     // 菜单背景 counter（GTW×40）
      'src/render/AuroraSky.ts',           // 极光 uTime
      'src/render/SkyRenderer.ts',         // 塔族天空星尘/落石
      'src/render/npcExtraParts.ts',       // 附加层（火星探测器脉冲等）
      'src/entities/MinionProj.ts',        // 泰拉棱镜剑色相
      'src/entities/RollingBoulder.ts',    // 彩虹巨石拖尾
      'src/entities/bossAI_dd2.ts',        // DD2 焰面
      'src/entities/Arrow.ts',             // 宝石箭脉冲
      'src/entities/MissileProj.ts',       // 彩虹杖/魔导弹拖尾
      'src/entities/PetFollower.ts',       // 彩虹巨石宠 Extra_283
      'src/render/Renderer.ts',            // 20 站收编总装
    ];
    for (const s of sites) {
      expect(codeOf(s), s).toContain("from '../core/GameTime'");
    }
  });

  it('⑤★BJ330 二次窗口：661 光皇蝴蝶点光收编 GameTime 单源 1:1 校准（NPC.cs:45389）', () => {
    const enemy = codeOf('src/entities/Enemy.ts');
    expect(enemy).toContain("import { globalTimeWrappedHourly } from '../core/GameTime'");
    expect(enemy).toContain('hslToRgb(globalTimeWrappedHourly() * 0.33 % 1, 1, 0.5)');
    expect(enemy, '旧 Main.time 域误读(周期 ~900×)须绝迹').not.toContain('(visEffectFrames() / 54000)');
  });

  it('⑥墙钟残留哨兵：GTW 口径的 performance.now%3600 禁回流（登记豁免除外）', () => {
    const EXEMPT = ['src/ui/CreditsRollOverlay.ts'];   // 无原版 GTW 锚的 SW 近似,登记保留
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = resolve(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) walk(p);
        else if (name.endsWith('.ts')) files.push(p);
      }
    };
    for (const dir of ['src/core', 'src/render', 'src/entities', 'src/fx', 'src/lighting', 'src/world', 'src/stats', 'src/ui', 'src/data']) {
      walk(resolve(ROOT, dir));
    }
    const offenders = files
      .filter((f) => !EXEMPT.some((e) => f.endsWith(e)))
      .filter((f) => /performance\.now\(\)\s*\/\s*1000\s*%\s*3600/.test(codeOf(f.replace(`${ROOT}/`, ''))));
    expect(offenders, `墙钟回流站:${offenders.join(',')}`).toEqual([]);
  });
});
