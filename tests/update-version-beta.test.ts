// 更新横幅版本段 -beta 后缀结构锁(2026-09-23):防回归到纯三段式正则。
// 病史:0.1.35-beta 上线后横幅显示「vBvemkH」(bundle 指纹短码)——根因=
// UpdateCheck/UpdateBanner 两处 /^\d+\.\d+\.\d+$/ 把 -beta 判非版本段,回退
// 显示 bundle 名。修=两处正则放开预发布后缀;本测试钉住新正则在位。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p: string): string => readFileSync(join(ROOT, p), 'utf8');
const NEW_RE = String.raw`/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/`;

describe('update-version-beta 更新横幅版本段', () => {
  it('UpdateCheck/UpdateBanner 两处正则均接受预发布后缀(纯三段式即红)', () => {
    expect(srcOf('src/update/UpdateCheck.ts')).toContain(NEW_RE);
    expect(srcOf('src/update/UpdateBanner.ts')).toContain(NEW_RE);
  });

  it('行为钉:新正则对 0.1.35-beta 放行、对旧三段式放行、对指纹/HTML 拒绝', () => {
    const re = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?$/;
    expect(re.test('0.1.35-beta')).toBe(true);
    expect(re.test('0.1.34')).toBe(true);
    expect(re.test('index-BvemkHnu.js')).toBe(false);
    expect(re.test('<!DOCTYPE')).toBe(false);
  });
});
