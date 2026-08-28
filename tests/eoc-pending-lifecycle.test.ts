// EoC/机械 Boss 自然召唤旗生命周期守卫（2026-08-28 用户实报回归锁）。
// 缺陷史：spawnEyePending/spawnHardBossPending 的入夜清零两行曾写在 crossed(DUSK)
// 块【外】——每帧无条件执行 → 入夜 roll 置位的 pending 活不过一帧，消费端
// （nightTicks>4860 起每帧查旗）整夜读 false → "收到邪恶存在消息但克眼整夜
// 不生成直接天亮"。修=清零挪进 crossed(DUSK) 块内（每夜重置语义）。
// 原版：触发 StartNight(Main.cs:64732) / 消费 UpdateTime(Main.cs:64542-64621，
// spawnHardBoss 无条件清零=原版同款 :64621) / 黎明清旗(Main.cs:64625)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf8');

describe('自然 Boss 召唤旗生命周期（crossed(DUSK) 块内清零）', () => {
  it('入夜重置必须在 crossed(DUSK) 块内（紧随块开）', () => {
    expect(src).toMatch(
      /if \(crossed\(Clock\.DUSK\)\) \{\s*\n\s*this\.spawnEyePending = false;\s*\n\s*this\.spawnHardBossPending = 0;/,
    );
  });
  it('重置块必须与 roll 门紧邻（两者之间插入裸清零即破坏匹配）', () => {
    expect(src).toMatch(
      /this\.spawnHardBossPending = 0;\s*\n\s*\}\s*\n\s*if \(crossed\(Clock\.DUSK\) && !w\.isFastForwardingTime\(\)/,
    );
  });
  it('消费端仍为 nightTicks>4860 门 + 无条件清旗（原版 :64596 同款）', () => {
    expect(src).toMatch(
      /if \(nightTicks > 4860 && surfaceOk && !nearMoonLord\) \{[\s\S]{0,600}?if \(this\.spawnEyePending\) \{\s*\n\s*this\.spawnEyePending = false;/,
    );
  });
});
