// 配置守卫探针:任何基线采集之前先跑,输出"呈现配置指纹"。指纹不一致的
// 两次采集不可对比(审计官裁定:_conf-guard 必须首个通过否则本次作废)。
// 检查面:devicePixelRatio / 画布 backing vs CSS 尺寸比 / frameCap / renderScale
// (auto 态展开为实际生效值)/ renderMode / waveQuality / GL 层可用性 / SW 禁用态。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_conf-guard.mjs
import { launch, origin } from './_perf-lib.mjs';

const b = await launch();
try {
  const p = await b.newPage();
  await p.goto(origin() + '/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });

  const conf = await p.evaluate(async () => {
    const out = {};
    out.dpr = window.devicePixelRatio;
    const opts = (await import('/src/core/options.ts')).options;
    const d = opts.data;
    out.frameCap = d.frameCap;
    out.renderScale = d.renderScale;
    out.renderScaleAuto = d.renderScaleAuto;
    out.renderMode = d.renderMode;
    out.waveQuality = d.waveQuality;
    out.minimapFrame = d.minimapFrame ?? null;
    // 主画布几何:CSS 尺寸 vs backing 尺寸(本仓契约=backing 恒 CSS px)
    const cv = document.querySelector('#game-root canvas');
    if (cv) {
      out.cssSize = [Math.round(cv.clientWidth), Math.round(cv.clientHeight)];
      out.backingSize = [cv.width, cv.height];
      out.backingMatchesCss = cv.width === cv.clientWidth && cv.height === cv.clientHeight;
    } else { out.cssSize = null; }
    // GL 层可用性探测(webgl2 主通路 + webgl 回退)
    try {
      const t = document.createElement('canvas');
      out.webgl2 = !!t.getContext('webgl2');
      out.webgl = !out.webgl2 && !!t.getContext('webgl');
    } catch { out.webgl2 = false; }
    // OffscreenCanvas worker 化可行性锚(iOS16.4+/Android 常在)
    out.offscreenCanvas = typeof OffscreenCanvas !== 'undefined';
    try { out.offscreen2d = typeof createImageBitmap === 'function' && !!new OffscreenCanvas(4, 4).getContext('2d'); }
    catch { out.offscreen2d = false; }
    // 环境信号:iOS 伪装 UA 也直接认触屏与内存 API 缺失双特征
    out.ua = navigator.userAgent;
    out.iosLike = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    out.perfMemory = !!performance.memory;
    return out;
  });

  console.log(JSON.stringify({ probe: 'conf-guard', ...conf }));
} finally {
  await b.close();
}
