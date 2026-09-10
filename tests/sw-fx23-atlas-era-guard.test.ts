import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ★SW-FX23（2026-09-10）：vanilla-atlas.mjs 追加时代守卫——同族全量重跑事故已四发
// （8/21、8/23 0042c846、09-10 15:41 与 17:44,FX22 定谳=键序洗牌→golden/SW 缓存链
// /追加语义全破+:449 静默丢散件键）。守卫=检测到 vanilla.json 含 Item_Atlas_2/3 页
// 引用即拒绝(exit 1)+指引走 atlas-append-1457 通道。

const SCRIPT = join(process.cwd(), 'scripts', 'vanilla-atlas.mjs');

describe('vanilla-atlas 追加时代守卫（SW-FX23）', () => {
  it('行为面:追加时代下默认运行被拒（exit 1+指引走追加通道）,零写盘', () => {
    const r = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8', timeout: 60_000 });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('拒绝全量重写');
    expect(r.stderr).toContain('Item_Atlas_2/3');
    expect(r.stderr).toContain('atlas-append-1457.mjs');
    expect(r.stderr).toContain('--force-full');
  });

  it('结构锁:守卫先于任何 writeFileSync(拒绝路径零写盘的结构前提)', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    const guardAt = src.indexOf('追加时代守卫');
    const firstWrite = src.indexOf('writeFileSync');
    expect(guardAt).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(guardAt);
    expect(src).toContain("--force-full");
    // 守卫探测式=引用 Atlas_2/3 页（追加时代判据,与 49+3 件在册锚同源）
    expect(src).toMatch(/Item_Atlas_\[23\]\\\.png/);
  });
});
