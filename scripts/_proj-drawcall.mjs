// 弹幕绘制调用级插桩(2026-08-19 武器全隐形定谳探针):
// 不采样画面像素(此前误测源——世界像素噪声),直接记录 drawImage 调用的
// 图像对象(类型/尺寸/src),回答"弹幕贴图到底有没有被绘制、画的是什么"。
// 同一探针跑 4173(PROD,SW+zip) 与 5199(dev,直连) 两源对照。
import puppeteer from 'puppeteer-core';

const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dc-profile-' + (B.match(/\d+/)?.[0] ?? 'x'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (/^(DUMP|SRC)/.test(t)) console.log(t.slice(0, 500)); });
page.setDefaultTimeout(200000);
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 230 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  g.player.inv.slots[0] = { id: 4, stack: 99 };   // 荧光棒(内部 id,此前实证)
  g.player.inv.selected = 0;
});

// 贴图源头体检:vimages/spriteCache 里 Projectile_50 到底是什么、有没有内容
const src = await page.evaluate(async () => {
  const atlas = window.__swAtlas;
  const out = {};
  // 1) 直接网络取原字节画一遍(基准:文件本身是否透明)
  const drawUrl = async (url) => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('load fail')); i.src = url; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let op = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 16) op++;
    return { w: im.width, h: im.height, opaque: op, via: 'network-direct' };
  };
  out.network = await drawUrl('sprites/vanilla/Projectile_50.png').catch((e) => ({ err: String(e.message) }));
  // 2) SW 缓存里的字节(若激活)
  try {
    const names = (await caches.keys()).filter((n) => n.startsWith('sw-assets-v'));
    if (names.length) {
      const cache = await caches.open(names[names.length - 1]);
      const hit = await cache.match('sprites/vanilla/Projectile_50.png') ?? await cache.match(location.origin + '/sprites/vanilla/Projectile_50.png');
      if (hit) {
        const buf = new Uint8Array(await hit.clone().arrayBuffer());
        const bl = document.createElement('canvas');
        const im = await createImageBitmap(new Blob([buf], { type: 'image/png' }));
        bl.width = im.width; bl.height = im.height;
        const x = bl.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, bl.width, bl.height).data;
        let op = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 16) op++;
        out.swCache = { bytes: buf.length, w: im.width, h: im.height, opaque: op, headHex: [...buf.slice(0, 8)].map((v) => v.toString(16).padStart(2, '0')).join('') };
      } else out.swCache = 'MISS(走网络)';
    } else out.swCache = '无 SW 缓存(dev?)';
  } catch (e) { out.swCache = 'err:' + String(e.message).slice(0, 60); }
  console.log('SRC', JSON.stringify(out));
  return out;
});

// drawImage 调用级插桩:全量计数 + 22x6(荧光棒)逐次记录绘制现场
await page.evaluate(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  window.__dc = { calls: 0, byDim: new Map(), imgKinds: new Map(), glow: [] };
  const mainCv = window.__swGame?.renderer?.canvas;
  proto.drawImage = function (img, ...rest) {
    const rec = window.__dc;
    rec.calls++;
    const w = img?.width ?? -1, h = img?.height ?? -1;
    const dim = `${w}x${h}`;
    rec.byDim.set(dim, (rec.byDim.get(dim) ?? 0) + 1);
    const kind = img?.constructor?.name
      ?? (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap ? 'ImageBitmap' : 'other');
    rec.imgKinds.set(kind, (rec.imgKinds.get(kind) ?? 0) + 1);
    // 矩阵普查:每个尺寸的首次绘制记录 {e,f,a} —— 一帧 census 定位"谁丢了世界变换"
    if (!rec.firstSeen) {
      rec.firstSeen = new Map();
      rec.frame0 = true;
    }
    if (!rec.firstSeen.has(dim)) {
      try {
        const m = this.getTransform();
        rec.firstSeen.set(dim, {
          e: Math.round(m.e), f: Math.round(m.f), a: +m.a.toFixed(2),
          on: this.canvas === mainCv ? 'main' : 'off',
        });
      } catch { rec.firstSeen.set(dim, null); }
    }
    if (w === 22 && h === 6 && rec.glow.length < 30) {
      // 目标矩形:5 参 (dx,dy,dw,dh) 或 9 参 (…,dx,dy,dw,dh)
      const n = rest.length;
      const dx = n >= 4 ? rest[n - 4] : rest[0], dy = n >= 4 ? rest[n - 3] : rest[1];
      const isMain = this.canvas === mainCv;
      // CTM → 设备坐标(dx,dy 经当前变换落点)
      let dev = null, m = null;
      try {
        m = this.getTransform();
        dev = { x: Math.round(m.a * dx + m.c * dy + m.e), y: Math.round(m.b * dx + m.d * dy + m.f) };
        window.__lastGlowDev = { ...dev, w: this.canvas?.width, h: this.canvas?.height, t: performance.now() };
      } catch { /* 老浏览器无 getTransform */ }
      rec.glow.push({
        on: isMain ? 'main' : `off:${this.canvas?.width}x${this.canvas?.height}`,
        dx: Math.round(dx), dy: Math.round(dy), dev,
        m: m ? { a: +m.a.toFixed(2), b: +m.b.toFixed(2), c: +m.c.toFixed(2), d: +m.d.toFixed(2), e: Math.round(m.e), f: Math.round(m.f) } : null,
        a: +this.globalAlpha.toFixed(2), gco: this.globalCompositeOperation,
        nArgs: n,
      });
    }
    // 健康参照:图块图集(48x1360)首次绘制的矩阵
    if (w === 48 && h === 1360 && !rec.tileRef) {
      try { const m = this.getTransform(); rec.tileRef = { a: +m.a.toFixed(2), e: Math.round(m.e), f: Math.round(m.f), on: this.canvas === mainCv ? 'main' : 'off' }; } catch { rec.tileRef = 'n/a'; }
    }
    return orig.apply(this, [img, ...rest]);
  };
});

// 掷荧光棒 ×3,收 60 帧
await page.mouse.move(760, 300);
for (let i = 0; i < 3; i++) {
  await page.mouse.down(); await new Promise((r) => setTimeout(r, 150)); await page.mouse.up();
  await new Promise((r) => setTimeout(r, 350));
}
const dump = await page.evaluate(async () => {
  const g = window.__swGame;
  let projs = 0;
  for (let k = 0; k < 30; k++) {
    await new Promise((res) => requestAnimationFrame(() => res()));
    projs = g.entities.projectiles.filter((q) => !q.dead).length;
  }
  const rec = window.__dc;
  CanvasRenderingContext2D.prototype.drawImage = CanvasRenderingContext2D.prototype.drawImage; // 保持(探针页销毁即还原)
  // 22x6(荧光棒贴图)计数 + 类型分布 + 逐次绘制现场
  const glow22x6 = rec.byDim.get('22x6') ?? 0;
  // 落点像素验证:最近一次 22x6 绘制的设备坐标处,画布上是否真有非背景像素
  let atDev = null;
  const lg = window.__lastGlowDev;
  if (lg && performance.now() - lg.t < 500 && lg.x >= 0 && lg.y >= 0 && lg.x < lg.w && lg.y < lg.h) {
    const ctx = g.renderer.ctx;
    const pad = 14, x0 = Math.max(0, lg.x - pad), y0 = Math.max(0, lg.y - pad);
    const d = ctx.getImageData(x0, y0, Math.min(pad * 2 + 8, lg.w - x0), Math.min(pad * 2 + 8, lg.h - y0)).data;
    let opaque = 0; const colors = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 16) {
        opaque++;
        const k = `${d[i] >> 4}${d[i + 1] >> 4}${d[i + 2] >> 4}`;
        colors.set(k, (colors.get(k) ?? 0) + 1);
      }
    }
    atDev = { x: lg.x, y: lg.y, opaque, topColors: [...colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }
  const out = {
    projsAlive: projs,
    drawImageTotal: rec.calls,
    glow22x6,
    glowSample: rec.glow.slice(0, 4),
    atDev,
    imgKinds: Object.fromEntries(rec.imgKinds),
    topDims: [...rec.byDim.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
  const g0 = rec.glow[0] ?? null;
  // 矩阵普查输出:main 画布上 e>0(裸世界坐标=丢变换)与 e<0(带相机=正确)两类各取样
  const census = [...(rec.firstSeen ?? new Map()).entries()]
    .map(([dim, v]) => ({ dim, ...v }))
    .filter((x) => x.on === 'main');
  const raw = census.filter((x) => x.e > 0).slice(0, 12);
  const worlded = census.filter((x) => x.e < -500).slice(0, 6);
  console.log('DUMP', JSON.stringify({
    projsAlive: projs, glow22x6: out.glow22x6,
    glow_m: g0?.m ?? null, glow_dev: g0?.dev ?? null,
    mainCensusRawE: raw, mainCensusWorldedE: worlded,
  }));
  return out;
});

console.log('RESULT', JSON.stringify({ origin: B, src, dump }));
await browser.close();
