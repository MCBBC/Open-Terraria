// ★IIIII258 验证探针:预览面板可读优先布局(IIIII243 净带策略反转)实机四档断言。
// 断言面(每档分辨率×每个采样):
//   ① 可读下限:面板逻辑宽 ≥ 500(自然宽 520 的 96%+;中/大世界 aspect 略异仍 ≥500)、
//      高 ≥ 140——用户实报旧态 141.4×40.4 逻辑,新态必须 ≥3×旧宽;
//   ② 零叠压四连:标题/进度条绘制 sprite 联合框(垂尾+106)/提示条实绘联合框零交叠 + 完整在屏;
//   ③ 模式锚:桌面档 mode='top'(标题上方带);
//   ④ 面板像素哨兵:ui-canvas 面板 bbox 非零像素 + 边框暗像素;
//   ⑤ 天顶('get fixed boi')反写回归:标题 ^%NN - 形态 + 同款零叠压(215b 彩蛋)。
// 四档:2000×1184(用户实报)/1920×1080/1280×720/2560×1440,各截图 → $SW_PROBE_OUT。
// 跑法: node tools/probe.mjs run scripts/_iii258-verify.mjs --vite=5307 --out=/tmp/iii258-out
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front, bootstrap, Ledger } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/iii258-out';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5307';
const VIEWPORTS = [[2000, 1184], [1920, 1080], [1280, 720], [2560, 1440]];
const EPS = 0.51;   // 叠压判定容差(css px;亚像素舍入不记罪)
/** 可读下限(逻辑 px;旧态 141.4×40.4 → 新态自然宽 520/高 ~148.6,钳 500/140 = ≥3.5×旧宽) */
const MIN_READABLE_W = 500;
const MIN_READABLE_H = 140;

const hit = (a, b) => !!a && !!b &&
  a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
  a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
const inside = (r, w, h) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= w + 0.5 && r.y + r.h <= h + 0.5;

/** 页内采样:layoutRects(逻辑) × scale → css px。__swGenUi = UIWorldLoadState(mainFlow 探针句柄)。 */
async function sample(page) {
  return page.evaluate(() => {
    const ui = window.__swGenUi;
    if (!ui) return { why: 'no-genui' };
    const r = ui.layoutRects;
    if (!r.preview) return { why: 'no-preview', hasPreview: ui.hasPreview === true };
    const s = r.scale;
    const px = (q) => (q ? { x: q.x * s, y: q.y * s, w: q.w * s, h: q.h * s } : null);
    return {
      cssW: window.innerWidth, cssH: window.innerHeight, scale: s,
      logicalW: r.logicalW, logicalH: r.logicalH,
      header: px(r.header), bar: px(r.bar), preview: px(r.preview), tips: px(r.tips),
      previewLogical: r.preview,
      headerText: ui.header?.text ?? '',
      pctShown: ui.pctShown ?? null,
    };
  }).catch((e) => ({ why: 'eval-err:' + String(e?.message ?? e).slice(0, 80) }));
}

/** 面板像素哨兵:ui-canvas 面板 bbox 读回(dpr=1 时 css px==canvas px)。 */
async function panelPixels(page, box) {
  return page.evaluate(({ x, y, w, h }) => {
    const cv = document.getElementById('ui-canvas');
    if (!cv) return { why: 'no-ui-canvas' };
    const k = cv.width / Math.max(1, window.innerWidth);
    const sw = Math.max(1, Math.round(w * k)), sh = Math.max(1, Math.round(h * k));
    const sx = Math.max(0, Math.min(cv.width - 1, Math.round(x * k))), sy = Math.max(0, Math.min(cv.height - 1, Math.round(y * k)));
    const cw = Math.min(sw, cv.width - sx), ch = Math.min(sh, cv.height - sy);
    const c2 = document.createElement('canvas');
    c2.width = cw; c2.height = ch;
    const ctx = c2.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(cv, sx, sy, cw, ch, 0, 0, cw, ch);
    const d = ctx.getImageData(0, 0, cw, ch).data;
    let nonZero = 0, nonBlack = 0, dark = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) nonZero++;
      if (d[i] + d[i + 1] + d[i + 2] > 30) nonBlack++;
      if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 250) dark++;   // 边框 rgb(0,0,0,α)
    }
    return { nonZero, nonBlack, dark, total: cw * ch };
  }, box);
}

/** 证据截图:页内合成(逐张 drawImage + 整幅同步读回栅栏——III243 shot2 定谳结构)。 */
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
        ctx.getImageData(0, 0, w, h);   // 整幅同步读回栅栏(逐张,防黑帧)
      } catch { /* 不可读层跳过 */ }
    }
    return out.toDataURL('image/png');
  });
  writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
}

/** 一档分辨率跑一轮创建流,逐样本断言;返回台账。 */
async function runViewport(L, { w, h, seed, shot, label }) {
  const browser = await launchBrowser({ viewport: { width: w, height: h } });
  try {
    const page = await openPage(browser, { errors: L.fails });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!L.chk(`bootstrap ${label}`, boot.ok, boot.why ?? '')) return;
    // 真实创建流(不 await——生成完成以 __swGame 出现为准,创建流采样纪律)
    await front(page);
    await page.evaluate(({ seed, w, h }) => {
      void window.__swFlow.createWorldProbe({ name: 'iiii258', seed, size: 0, difficulty: 0, evil: -1, w: 4200, h: 1200 })
        ?.catch?.((e) => { globalThis.__swProbeGenErr = String(e?.message ?? e).slice(0, 300); });
    }, { seed, w, h });

    let checked = 0, tipChecked = 0, shotTaken = false, minW = Infinity, minH = Infinity;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      await front(page);
      const ingame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false);
      if (ingame) break;
      const s = await sample(page);
      if (s.preview && !s.why) {
        checked++;
        const pl = s.previewLogical;
        const name = `${label} #${checked}`;
        minW = Math.min(minW, pl.w); minH = Math.min(minH, pl.h);
        // ① 可读下限(逻辑 px;分辨率无关断言——CSS 尺寸=逻辑×scale 只会更大)
        L.chk(`${name} 面板可读宽 ≥${MIN_READABLE_W}(实 ${pl.w.toFixed(1)})`, pl.w >= MIN_READABLE_W);
        L.chk(`${name} 面板可读高 ≥${MIN_READABLE_H}(实 ${pl.h.toFixed(1)})`, pl.h >= MIN_READABLE_H);
        // ② 零叠压四连:标题/进度条 sprite/提示条/在屏内
        L.chk(`${name} 面板×标题零叠压`, !hit(s.preview, s.header),
          `panel(${s.preview.x.toFixed(0)},${s.preview.y.toFixed(0)},${s.preview.w.toFixed(0)}×${s.preview.h.toFixed(0)}) header(${s.header.x.toFixed(0)},${s.header.y.toFixed(0)},${s.header.w.toFixed(0)}×${s.header.h.toFixed(0)})`);
        L.chk(`${name} 面板×进度条零叠压`, !hit(s.preview, s.bar),
          `bar(${s.bar.x.toFixed(0)},${s.bar.y.toFixed(0)},${s.bar.w.toFixed(0)}×${s.bar.h.toFixed(0)})`);
        if (s.tips) {
          tipChecked++;
          L.chk(`${name} 面板×提示条零叠压`, !hit(s.preview, s.tips),
            `tips(${s.tips.x.toFixed(0)},${s.tips.y.toFixed(0)},${s.tips.w.toFixed(0)}×${s.tips.h.toFixed(0)})`);
        }
        L.chk(`${name} 面板完整在屏内`, inside(s.preview, s.cssW, s.cssH),
          `viewport ${s.cssW}×${s.cssH} scale=${s.scale.toFixed(2)}`);
        // ③ 模式锚:面板应在标题上方(桌面上方带;面板底 ≤ 标题顶,逻辑域)
        L.chk(`${name} 面板位于标题上方(top 带)`, s.header.y * s.scale >= (s.preview.y + s.preview.h) * s.scale - EPS,
          `panelBottom=${((s.preview.y + s.preview.h) * s.scale).toFixed(0)} headerTop=${(s.header.y * s.scale).toFixed(0)}`);
        // ④ 像素哨兵 + 中程截图(同刻:preview+tips 同帧在屏且必已画过——挂载后首个
        //    采样可能落在 attach→下一帧 draw 窗口,画布尚无面板像素,III258 实测)
        if (!shotTaken && s.tips && s.pctShown != null && s.pctShown >= 20 && s.pctShown <= 80) {
          shotTaken = true;
          const px = await panelPixels(page, s.preview);
          L.chk(`${name} 面板像素哨兵(非零)`, px.nonZero > 100, `nonZero=${px.nonZero}/${px.total}`);
          L.chk(`${name} 面板边框暗像素在位`, px.dark > 50, `dark=${px.dark}`);
          await compositeShot(page, shot);
          L.say(`📸 ${shot} (pct=${s.pctShown}, header="${s.headerText.slice(0, 24)}")`);
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    L.chk(`${label} 采样到预览面板`, checked > 0, `samples=${checked} tipSamples=${tipChecked}`);
    L.chk(`${label} 采样到提示条同帧`, tipChecked > 0);
    L.chk(`${label} 中程截图已存`, shotTaken, shot);
    L.say(`${label} 最小面板逻辑尺寸 ${minW.toFixed(1)}×${minH.toFixed(1)}(旧态 141.4×40.4)`);
  } finally {
    await browser.close();
  }
}

mkdirSync(OUT, { recursive: true });
const L = new Ledger();
L.say(`IIIII258 预览面板可读优先布局验证 origin=${ORIGIN} out=${OUT}`);

for (const [w, h] of VIEWPORTS) {
  await L.step(`${w}×${h} 创建流采样`, async () => {
    await runViewport(L, { w, h, seed: 'iiii258', shot: join(OUT, `verify-${w}x${h}.png`), label: `${w}×${h}` });
  });
}

// ---- 天顶回归(215b 反写标题 + 同款零叠压+可读,1080p) ----
await L.step('天顶 get fixed boi 反写回归', async () => {
  const w = 1920, h = 1080;
  const browser = await launchBrowser({ viewport: { width: w, height: h } });
  try {
    const page = await openPage(browser, { errors: L.fails });
    page.__probeOrigin = ORIGIN;
    const boot = await bootstrap(page, ORIGIN);
    if (!L.chk('bootstrap zenith', boot.ok, boot.why ?? '')) return;
    await front(page);
    await page.evaluate(() => {
      void window.__swFlow.createWorldProbe({ name: 'iiii258-zenith', seed: 'get fixed boi', size: 0, difficulty: 0, evil: -1, w: 4200, h: 1200 })
        ?.catch?.((e) => { globalThis.__swProbeGenErr = String(e?.message ?? e).slice(0, 300); });
    });
    let reversed = '', panelSeen = false, overlapFree = 0, readable = 0, shotTaken = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      await front(page);
      const ingame = await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false);
      if (ingame) break;
      const s = await sample(page);
      if (s.preview && !s.why) {
        panelSeen = true;
        reversed = s.headerText;
        const noHit = !hit(s.preview, s.header) && !hit(s.preview, s.bar) && (!s.tips || !hit(s.preview, s.tips));
        if (noHit) overlapFree++;
        if (s.previewLogical.w >= MIN_READABLE_W && s.previewLogical.h >= MIN_READABLE_H) readable++;
        // 天顶反写:基串"正在创建地狱 - NN%"经 FTW 反写 → "^%NN - 狱地建创在正"
        if (!shotTaken && /^%\d{1,3} - /.test(s.headerText)) {
          shotTaken = true;
          await compositeShot(page, join(OUT, 'verify-zenith-1920x1080.png'));
          L.say(`📸 ${join(OUT, 'verify-zenith-1920x1080.png')} header="${s.headerText}"`);
        }
        if (shotTaken && overlapFree >= 3 && readable >= 3) break;   // 反写帧+叠压/可读样本齐了,提前收
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    L.chk('天顶 预览面板在屏', panelSeen);
    L.chk('天顶 反写标题形态(^%NN - 狱地…)', /^%\d{1,3} - /.test(reversed), `header="${reversed.slice(0, 32)}"`);
    L.chk('天顶 反写帧零叠压(≥3 样本)', overlapFree >= 3, `overlapFree=${overlapFree}`);
    L.chk('天顶 反写帧可读(≥3 样本)', readable >= 3, `readable=${readable}`);
    L.chk('天顶 反写截图已存', shotTaken);
  } finally {
    await browser.close();
  }
});

console.log(`\n===== IIII258 探针收口 ${L.elapsed()} =====`);
process.exit(L.exitCode());
