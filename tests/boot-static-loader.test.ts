// 首屏静态加载屏结构锁(2026-09-20 重设计为原版 1.4.5.7 加载屏 1:1 后更新):
// index.html 内联零 JS 向日葵屏(原版 DrawSplash 长尾态:黑底+Sunflower_Loading
// 19 帧转圈)+ main.ts 摘除接线。防回退面:①HTML 内联层被构建改动剥离
// ②main.ts 摘除点丢失(静态层盖住 splash)③纹理改回外部请求(破坏零请求约束)。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcOf = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

describe('boot-static-loader 首屏静态加载屏', () => {
  it('index.html 内联层在位:容器+原版向日葵(data-URI 零请求)+steps 动画+z 序低于启动幕', () => {
    const html = srcOf('index.html');
    expect(html).toContain('<div id="sw-boot-static"><div class="sb-flower"></div></div>');
    expect(html).toContain('#sw-boot-static');
    expect(html).toContain('sb-flower');
    expect(html).toContain('steps(1, end)');
    // 零外部请求:向日葵 19 帧竖条(原版 UI/Sunflower_Loading.png)必须 data-URI 内联
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('sprites/vanilla-ui/UI_Sunflower_Loading.png');
    // 原版逐值锚:num=max(1,sw/1920,sh/1200) 缩放式与 pixelated 采样
    expect(html).toContain('tan(atan2(100vw, 1920px))');
    expect(html).toContain('image-rendering: pixelated');
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
