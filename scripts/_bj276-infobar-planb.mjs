// ★BJ276 信息栏文本方案 B(动态读数直绘)探针:churn/出生率/帧时/观感 A/B 留证。
// 用法:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_bj276-infobar-planb.mjs <tag> <dpr>
//   tag  = before|after(输出文件名标记;before=烘焙管线基线,after=方案 B)
//   dpr  = 2(hidpi 档,Mac Retina)|1(pixel 档,Windows 100%)
// 断言/产物:
//  ① 实机 canvas 出生率(测量窗内 document.createElement('canvas') 增量;烘焙 churn 面)
//  ② 实机 fillText/drawImage(canvas 源)计数:信息行动态面走哪条路径的机制指纹
//     (before=信息行 fillText=0 且 bake blit 每帧;after=信息行 fillText>0 且 bake blit=0)
//  ③ 帧时(rAF 间隔 avg/p50/p95/max + >25ms 帧数,行走 12s 窗;GPU 页禁 trace,只用 rAF)
//  ④ 受控 A/B 台架(白底,同一动态读数串):烘焙路径(真实 drawBakedMouseText)vs
//     直绘路径(after=真实 drawDirectMouseText;before=同式内联复刻)——
//     ramp(中间调)/hard(硬边对)/solid(实心芯)三度量(FX58 同式)+行带截图
//  ⑤ 截图:/tmp/bj276-<tag>-dpr<dpr>-infobar.png(实机信息栏)/-bench.png(台架)/-full.png
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// run-diag 子进程 argv = [node, self, '--_child', <script>, <tag>, <dpr>] → 取尾部两参
const TAIL = process.argv.slice(-2);
const TAG = /^\w+$/.test(TAIL[0]) ? TAIL[0] : 'after';
const DPR = Number.isFinite(Number(TAIL[1])) ? Number(TAIL[1]) : 2;
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5202') + '/?dev=1';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800, deviceScaleFactor: DPR },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// 全局仪表:canvas 出生计数 + fillText(按 font 分桶)+ canvas 源 5 参 drawImage + rAF 间隔
// evaluateOnNewDocument=在页面任何脚本前装表(捕获启动期全部出生)
await page.evaluateOnNewDocument(() => {
  const w = window;
  // 预种欢迎横幅 ack(WelcomeAnnounce z-60 会撕后续截图/挡行走;探针坑先例)
  try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ }
  w.__swBirths = 0;
  const origCreate = document.createElement.bind(document);
  document.createElement = function (tag, ...rest) {
    if (String(tag).toLowerCase() === 'canvas') w.__swBirths++;
    return origCreate(tag, ...rest);
  };
  w.__swFill = 0; w.__swFillInfo = 0; w.__swBlit = 0;
  const origF = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y, ...rest) {
    w.__swFill++;
    const rows = w.__swRowTexts;
    if (rows && rows.some((r) => r && String(s).startsWith(r.slice(0, 6)))) w.__swFillInfo++;
    return origF.call(this, s, x, y, ...rest);
  };
  const origD = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    if (args.length === 5 && args[0] instanceof HTMLCanvasElement) w.__swBlit++;
    return origD.apply(this, args);
  };
  w.__swFrames = [];
  const origRaf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => origRaf((t) => {
    const f = w.__swFrames;
    f.push(t); if (f.length > 4000) f.splice(0, 2000);
    return cb(t);
  });
});

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('BJ276探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 入包五件信息饰品(时间/深度/罗盘/DPS/秒表;_infoaccs-probe 同键)
const granted = await page.evaluate(() => {
  const g = window.__swGame;
  const keys = ['vi_17_gold_watch', 'vi_18_depth_meter', 'vi_393_compass', 'vi_3119_dps_meter', 'vi_3099_stopwatch'];
  const ids = keys.map((k) => window.__swItems[k]).filter((v) => v !== undefined);
  ids.forEach((id, i) => { g.player.inv.slots[40 + i] = { id, stack: 1 }; });
  return ids.length;
});
check('信息饰品入包 5 件', granted === 5, `granted=${granted}`);
await new Promise((r) => setTimeout(r, 1200));

const rows = await page.evaluate(() => (window.__swGame.renderer.infoAccs?.state?.rows ?? []).map((r) => r.text));
check('信息行 ≥5(时/深/罗/DPS/速)', rows.length >= 5, JSON.stringify(rows));
await page.evaluate((texts) => { window.__swRowTexts = texts; }, rows);

// ---- 实机测量窗:行走 12s(d 按住 + 1.2s 一跳),churn 面全开 ----
const births0 = await page.evaluate(() => window.__swBirths);
await page.keyboard.down('d');
const walk = (async () => {
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1200));
    await page.keyboard.down(' ');
    await new Promise((r) => setTimeout(r, 150));
    await page.keyboard.up(' ');
  }
})();
// 窗口中段截信息栏(行走态,行文本在 churn 中;clip 从 iconRects 实锚——
// 行首在小地图之下 Y≈351,固定 clip 会整段脱靶)
await new Promise((r) => setTimeout(r, 5000));
const infoClip = await page.evaluate(() => {
  const W = window.innerWidth;   // 主画布后备=逻辑分辨率(resize:3351)=CSS 宽;首个 canvas 是世界中间层,不能用
  const st = window.__swGame.renderer.infoAccs?.state;
  const r = st?.iconRects?.[0];
  const x = Math.max(0, W - 320);
  console.log('[bj276] clip-time state: rows=', JSON.stringify((st?.rows ?? []).map((q) => q.text)),
    'invOpen=', st?.inventoryOpen, 'icon0=', JSON.stringify(r));
  return r ? { x, y: Math.max(0, r.y - 26), width: 320, height: 300 } : { x, y: 330, width: 320, height: 300 };
});
await page.screenshot({ path: `/tmp/bj276-${TAG}-dpr${DPR}-infobar.png`, clip: infoClip });
await new Promise((r) => setTimeout(r, 7000));
await page.keyboard.up('d');
await walk;
const live = await page.evaluate(() => {
  const f = window.__swFrames;
  const iv = [];
  for (let i = 1; i < f.length; i++) {
    const d = f[i] - f[i - 1];
    if (d > 0 && d < 1000) iv.push(d);
  }
  iv.sort((a, b) => a - b);
  const q = (p) => iv.length ? iv[Math.min(iv.length - 1, Math.floor(iv.length * p))] : 0;
  const avg = iv.length ? iv.reduce((s, x) => s + x, 0) / iv.length : 0;
  return {
    births: window.__swBirths, fill: window.__swFill, fillInfo: window.__swFillInfo, blit: window.__swBlit,
    frames: iv.length, avg: Math.round(avg * 100) / 100, p50: q(0.5), p95: q(0.95),
    max: iv.length ? iv[iv.length - 1] : 0, over25: iv.filter((x) => x > 25).length,
  };
});
const birthsDelta = live.births - births0;
const secs = 12;
console.log(`[bj276 ${TAG} dpr=${DPR}] live: births=${birthsDelta}(${(birthsDelta / secs).toFixed(1)}/s) fill=${live.fill}(${(live.fill / secs).toFixed(1)}/s, info=${live.fillInfo}) bake-blit=${live.blit}(${(live.blit / secs).toFixed(1)}/s)`);
console.log(`[bj276 ${TAG} dpr=${DPR}] frames=${live.frames} avg=${live.avg}ms p50=${live.p50}ms p95=${live.p95}ms max=${live.max}ms over25=${live.over25}`);
check('信息行动态面 fillText 走直绘(after)或烘焙(before)指纹', true, `fillInfo=${live.fillInfo} blit=${live.blit}`);
await page.screenshot({ path: `/tmp/bj276-${TAG}-dpr${DPR}-full.png` });

// ---- 受控 A/B 台架:白底,同一动态读数串,烘焙 vs 直绘,三度量 + 截图 ----
// (vite dev 服务器源 URL 动态 import 真实模块;before-run 无 drawDirectMouseText → 内联同式复刻)
const bench = await page.evaluate(async () => {
  const out = {};
  try {
    const mod = await import('/src/vui/draw/MouseTextBake.ts');
    const PixelText = await import('/src/vui/draw/PixelText.ts');
    out.font = PixelText.CANVAS_MOUSETEXT_FONT;
    out.hasDirect = typeof mod.drawDirectMouseText === 'function';
    const bake = mod.drawBakedMouseText;
    const direct = mod.drawDirectMouseText ?? ((ctx, text, ax, ay, o) => {
      ctx.save();
      ctx.font = PixelText.CANVAS_MOUSETEXT_FONT;
      ctx.textAlign = 'left'; ctx.textBaseline = o.anchor;
      ctx.translate(ax, ay);
      if ((o.scaleX ?? 1) !== 1 || (o.scaleY ?? 1) !== 1) ctx.scale(o.scaleX ?? 1, o.scaleY ?? 1);
      if ((o.alpha ?? 1) < 1) ctx.globalAlpha = o.alpha;
      for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { ctx.fillStyle = '#000'; ctx.fillText(text, ox, oy); }
      ctx.fillStyle = o.color; ctx.fillText(text, 0, 0);
      ctx.restore();
      return true;
    });
    const mk = () => { const c = document.createElement('canvas'); c.width = 300; c.height = 120; return c; };
    const texts = ['速度: 41 mph', '位置: 1284 英尺 东', '深度: 34 英尺 地表', '附近没有敌人', '时间: 10:15 AM'];
    const rowsL = [];
    const drawSet = (fn) => {
      const cv = mk(); const c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, 300, 120);
      texts.forEach((t, i) => { fn(c, t, 12, 18 + i * 22, { anchor: 'middle', color: i === 4 ? '#646464' : '#e8e4f0' }); rowsL.push(t); });
      return cv;
    };
    const cvA = drawSet((c, t, x, y, o) => { bake(c, t, x, y, o); });       // 烘焙(现行为/悬停层保留)
    const cvB = drawSet((c, t, x, y, o) => { direct(c, t, x, y, o); });    // 直绘(方案 B)
    // 度量(FX58 同式):行带 [ty-11, ty+11) × [8, 292),白底调色板 + 文本色 + 黑描边
    const metrics = (cv) => {
      const c = cv.getContext('2d');
      const img = c.getImageData(0, 0, 300, 120).data;
      const inPal = (r, g, b) => (r > 242 && g > 242 && b > 242) || (r < 25 && g < 25 && b < 25)
        || (Math.abs(r - 232) < 36 && Math.abs(g - 228) < 36 && Math.abs(b - 240) < 36)
        || (Math.abs(r - 100) < 36 && Math.abs(g - 100) < 36 && Math.abs(b - 100) < 36);
      let ramp = 0, hard = 0, solid = 0;
      for (let y = 4; y < 116; y++) {
        for (let x = 8; x < 292; x++) {
          const i = (y * 300 + x) * 4;
          if (inPal(img[i], img[i + 1], img[i + 2])) {
            const lum = (img[i] + img[i + 1] + img[i + 2]) / 3;
            if (lum > 60 && lum < 210) ramp++;
            if (lum < 60) solid++;
            const j = (y * 300 + x + 1) * 4;
            const lum2 = (img[j] + img[j + 1] + img[j + 2]) / 3;
            if (lum < 60 && lum2 > 200) hard++;
          }
        }
      }
      return { ramp, hard, solid };
    };
    out.A = metrics(cvA); out.B = metrics(cvB);
    // 逐像素 diff(烘焙 vs 直绘)
    const da = cvA.getContext('2d').getImageData(0, 0, 300, 120).data;
    const db = cvB.getContext('2d').getImageData(0, 0, 300, 120).data;
    let diff = 0, sum = 0, maxd = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.abs(da[i] - db[i]);
      if (d > 8) diff++;
      sum += d; if (d > maxd) maxd = d;
    }
    out.diff = { px: diff, avg: Math.round(sum / (da.length / 4) * 100) / 100, max: maxd };
    // 合成截图页:上=烘焙 下=直绘
    const shot = document.createElement('canvas'); shot.width = 300; shot.height = 248;
    const sc = shot.getContext('2d');
    sc.fillStyle = '#fff'; sc.fillRect(0, 0, 300, 248);
    sc.drawImage(cvA, 0, 0); sc.drawImage(cvB, 0, 124);
    sc.strokeStyle = '#f00'; sc.strokeRect(0.5, 124.5, 299, 123);
    out.shotData = shot.toDataURL('image/png');
  } catch (e) { out.err = String(e && e.stack || e); }
  return out;
});
if (bench.err) { console.log('BENCH ERROR:', bench.err); fail++; }
else {
  console.log(`[bj276 ${TAG} dpr=${DPR}] bench A(烘焙): ramp=${bench.A.ramp} hard=${bench.A.hard} solid=${bench.A.solid}`);
  console.log(`[bj276 ${TAG} dpr=${DPR}] bench B(直绘${bench.hasDirect ? '=真实模块' : '=内联复刻'}): ramp=${bench.B.ramp} hard=${bench.B.hard} solid=${bench.B.solid}`);
  console.log(`[bj276 ${TAG} dpr=${DPR}] 逐像素 diff(A vs B): ${JSON.stringify(bench.diff)}`);
  const fs = await import('node:fs');
  fs.writeFileSync(`/tmp/bj276-${TAG}-dpr${DPR}-bench-dataurl.txt`, bench.shotData);
  // 台架截图落地:dataURL → PNG(经浏览器转存)
  const b64 = bench.shotData.split(',')[1];
  fs.writeFileSync(`/tmp/bj276-${TAG}-dpr${DPR}-bench.png`, Buffer.from(b64, 'base64'));
  check('A 烘焙锐利(hard 边显著/ramp 低)', bench.A.hard > 100 && bench.A.ramp < bench.B.ramp,
    `A.hard=${bench.A.hard} A.ramp=${bench.A.ramp}`);
  check('B 直绘平滑(ramp 有界过渡,硬边塌陷)', bench.B.ramp > bench.A.ramp,
    `B.ramp=${bench.B.ramp} vs A=${bench.A.ramp}`);
}
check('页面零报错', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`[bj276] RESULT ${TAG} dpr=${DPR}: pass=${pass} fail=${fail}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
