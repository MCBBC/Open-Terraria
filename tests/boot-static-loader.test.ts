// 首屏静态读条结构锁(2026-09-20):index.html 内联零 JS 读条 + main.ts 摘除接线。
// 防回退面:①HTML 内联层被构建改动剥离 ②main.ts 摘除点丢失(静态层盖住 splash)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('boot-static-loader 首屏静态读条', () => {
  it('index.html 内联层在位:容器+条+steps 动画+z 序低于启动幕', () => {
    const html = srcOf('index.html');
    expect(html).toContain('<div id="sw-boot-static"><div class="sb-bar"></div></div>');
    expect(html).toContain('#sw-boot-static');
    expect(html).toContain('sb-march');
    expect(html).toContain('steps(4)');
    // z 序:静态层 9998 < 启动幕 10000(源码钉值,防任一侧漂移造成覆盖错位)
    expect(html).toContain('z-index: 9998');
    expect(srcOf('src/main.ts')).toContain('z-index: 10000');
  });

  it('main.ts 摘除接线双点在位:启动幕挂载时 + bypass 回调入口', () => {
    const main = srcOf('src/main.ts');
    expect(main).toContain('const removeStaticBoot = (): void => {');
    // 幕挂载点(bootVeil = veil 之后)
    expect(main).toMatch(/bootVeil = veil;\s*\n\s*removeStaticBoot\(\);/);
    // bypass 入口(bypassBoot 判定行之后)
    expect(main).toMatch(/has\('vuidemo'\);[\s\S]{0,120}if \(bypassBoot\) removeStaticBoot\(\);/);
  });
});
