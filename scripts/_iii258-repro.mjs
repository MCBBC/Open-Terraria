// ★IIIII258 复现探针:生成预览面板过小(用户实报 sandbox.vinlic.com ≈2000×1184 视口,
// 面板缩到 ~300×55 疑似双矩形)。本探针在多档视口×dpr 跑真实创建流,采样 layoutRects
// + GenWorldPreview 内部位图模式状态(bitmapMode/revealX/show 尺寸——"双矩形"=擦除揭示
// 中 show 缓冲左新右旧的分界假说),出全页合成截图 + 面板特写裁片。
// 跑法: node tools/probe.mjs run scripts/_iii258-repro.mjs --vite=5307 --out=/tmp/iii258-out
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front, bootstrap, Ledger } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii258-out';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5307';

/** 视口档:[label, w, h, deviceScaleFactor]——含用户实报档(dpr1 与 Retina dpr2 两种判读) */
const CASES = [
  ['2000x1184-dpr1', 2000, 1184, 1],
  ['2000x1184-dpr2', 2000, 1184, 2],
  ['1000x592-dpr2', 1000, 592, 2],
  ['1920x1080-dpr1', 1920, 1080, 1],
];

const report = { cases: [] };

/** 页内采样:layoutRects(逻辑) + preview 内部状态(位图模式/揭示沿/双缓冲尺寸) */
async function sample(page) {
  return page.evaluate(() => {
    const ui = window.__swGenUi;
    if (!ui) return { why: 'no-genui' };
    const r = ui.layoutRects;
    const pv = ui.preview;
    return {
      cssW: window.innerWidth, cssH: window.innerHeight, dpr: window.devicePixelRatio,
      scale: r.scale, logicalW: r.logicalW, logicalH: r.logicalH,
      header: r.header, bar: r.bar, preview: r.preview, tips: r.tips,
      headerText: ui.header?.text ?? '',
      pctShown: ui.pctShown ?? null,
      // GenWorldPreview 内部(TS private 仅编译期;运行时可读)
      pvMode: pv ? (pv.bitmapMode ? 'bitmap' : 'sweep') : null,
      pvOffW: pv?.off?.width ?? null, pvOffH: pv?.off?.height ?? null,
      pvShowW: pv?.show?.width ?? null, pvShowH: pv?.show?.height ?? null,
      pvRevealX: pv ? pv.revealX : null,
      pvDim: pv ? ((d) => ({ x: d.x, y: d.y, w: d.width, h: d.height }))(pv.getDimensions()) : null,
    };
  }).catch((e) => ({ why: 'eval-err:' + String(e?.message ?? e).slice(0, 80) }));
}

/** 页内合成截图(逐张读回栅栏——III243 shot2 定谳结构) */
async function compositeShot(page, file) {
  const url = await page.evaluate(() => {
    const w = window.innerWidth, h = window.innerHeight;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d', { willReadFrequently: true });
    for (const c of document.querySelectorAll('canvas')) {
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      try {
        ctx.drawImage(c, r.left, r.top, r.width, r.height);
        ctx.getImageData(0, 0, w, h);
      } catch { /* 不可读层跳过 */ }
    }
    return out.toDataURL('image/png');
  });
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

/** 面板特写:ui-canvas 上 preview bbox 外扩 pad 的裁片(dpr 缩放回 CSS 域) */
async function panelCrop(page, box, pad, file) {
  const url = await page.evaluate(({ x, y, w, h, pad }) => {
    const cv = document.getElementById('ui-canvas');
    if (!cv) return null;
    const k = cv.width / window.innerWidth;   // dpr
    const sx = Math.max(0, (x - pad) * k), sy = Math.max(0, (y - pad) * k);
    const sw = Math.min(cv.width - sx, (w + pad * 2) * k), sh = Math.min(cv.height - sy, (h + pad * 2) * k);
    const c2 = document.createElement('canvas');
    c2.width = Math.round(sw); c2.height = Math.round(sh);
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, c2.width, c2.height);
    ctx.getImageData(0, 0, c2.width, c2.height);   // 读回栅栏
    return c2.toDataURL('image/png');
  }, { ...box, pad });
  if (url) writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

for (const [label, w, h, dsf] of CASES) {
  const browser = await launchBrowser({ viewport: { width: w, height: h, deviceScaleFactor: dsf } });
  const entry = { label, viewport: `${w}x${h}@${dsf}x`, samples: [], minPanelCss: null, maxPanelCss: null };
  report.cases.push(entry);
  try {
    const page = await openPage(browser, { errors: [] });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!boot.ok) { entry.error = 'bootstrap: ' + (boot.why ?? ''); continue; }
    await front(page);
    await page.evaluate(({ seed, w, h }) => {
      void window.__swFlow.createWorldProbe({ name: 'iii258', seed, size: 0, difficulty: 0, evil: -1, w: 4200, h: 1200 })
        ?.catch?.((e) => { globalThis.__swProbeGenErr = String(e?.message ?? e).slice(0, 300); });
    }, { seed: 'iiii258', w, h });

    let shotTaken = false, cropTaken = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 120_000) {
      await front(page);
      const ingame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false);
      if (ingame) break;
      const s = await sample(page);
      if (s.preview && !s.why) {
        const css = { w: s.preview.w * s.scale, h: s.preview.h * s.scale };
        entry.samples.push(s);
        if (!entry.minPanelCss || css.w < entry.minPanelCss.w) entry.minPanelCss = css;
        if (!entry.maxPanelCss || css.w > entry.maxPanelCss.w) entry.maxPanelCss = css;
        // 首个 ≥20% 进度样本:全页截图 + 面板特写 + 一份原始采样快照
        if (!shotTaken && s.pctShown != null && s.pctShown >= 20) {
          shotTaken = true;
          entry.snapshot = s;
          await compositeShot(page, join(OUT, `repro-${label}.png`));
          if (!cropTaken && s.preview.w > 0) {
            cropTaken = true;
            await panelCrop(page, s.preview, 60, join(OUT, `repro-${label}-panel.png`));
          }
        }
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    entry.sampleCount = entry.samples.length;
    if (entry.samples.length) {
      const s0 = entry.samples[0];
      entry.summary = {
        scale: s0.scale, logicalW: s0.logicalW, logicalH: s0.logicalH,
        previewLogical: s0.preview, previewCss: {
          x: s0.preview.x * s0.scale, y: s0.preview.y * s0.scale,
          w: s0.preview.w * s0.scale, h: s0.preview.h * s0.scale,
        },
        pvMode: s0.pvMode, pvOff: [s0.pvOffW, s0.pvOffH], pvShow: [s0.pvShowW, s0.pvShowH],
        bandTop: s0.preview.y, bandBottom: s0.preview.y + s0.preview.h,
        tipsLogical: s0.tips, barLogical: s0.bar,
      };
    }
    console.log(`[${label}] samples=${entry.sampleCount} min=${JSON.stringify(entry.minPanelCss)} max=${JSON.stringify(entry.maxPanelCss)}`);
    if (entry.summary) console.log(`  summary=${JSON.stringify(entry.summary)}`);
  } finally {
    await browser.close();
  }
}

writeFileSync(join(OUT, 'repro-report.json'), JSON.stringify(report, null, 2));
console.log(`\nreport → ${join(OUT, 'repro-report.json')}`);
