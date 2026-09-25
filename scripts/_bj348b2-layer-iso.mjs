// ★BJ348b-2 分层隔离探针——主层（Extra_64+filter 暗化）vs glow 层（Glow_195+lighter）
// 逐层像素统计（纯 2D 复现绘制序列,零截图读取）+ miscCounter 游戏内实测值域。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5213', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const log = { misc: [], layers: {}, loadTest: {} };

  // ---- miscCounter 实测值域（连续 20 帧采样）----
  const p = g.player;
  for (let i = 0; i < 20; i++) {
    g.fixedUpdate(1 / 60);
    log.misc.push(p.miscCounter);
  }

  // ---- 加载贴图（走游戏 atlas 同款 ensureVImage）----
  const atlas = g.renderer.atlas ?? g.atlas;
  const ex64 = atlas.ensureVImage('vanilla/Extra_64.png');
  const g195 = atlas.ensureVImage('vanilla/Glow_195.png');
  await new Promise((r) => setTimeout(r, 1500));   // 等懒载
  log.loadTest = {
    ex64: ex64 ? { w: ex64.width, h: ex64.height } : null,
    g195: g195 ? { w: g195.width, h: g195.height } : null,
  };
  if (!ex64 || !g195 || !(ex64.width > 0) || !(g195.width > 0)) {
    log.loadTest.retry = 'waited again';
    await new Promise((r) => setTimeout(r, 3000));
  }
  const ex64b = atlas.ensureVImage('vanilla/Extra_64.png');
  const g195b = atlas.ensureVImage('vanilla/Glow_195.png');

  const statFrame = (cv, tag) => {
    const c = cv.getContext('2d');
    const d = c.getImageData(0, 0, cv.width, cv.height).data;
    let opaque = 0, rs = 0, gs = 0, bs = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 16) { opaque++; rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; }
    }
    return { tag, opaque, avgRGB: opaque ? [Math.round(rs / opaque), Math.round(gs / opaque), Math.round(bs / opaque)] : null };
  };

  // ---- 分层隔离：帧 0，24×24 画布 ----
  const mk = () => { const c = document.createElement('canvas'); c.width = 24; c.height = 24; return c; };
  for (let fr = 0; fr < 9; fr++) {
    // A: 主层（我的序列：source-over + alpha0.8 + brightness(0.5)）
    const a = mk(); const ca = a.getContext('2d');
    ca.save(); ca.globalAlpha = 0.8; ca.filter = 'brightness(0.5)';
    ca.drawImage(ex64b, 0, fr * 24, 24, 24, 0, 0, 24, 24);
    ca.restore();
    // A2: 主层无 filter（对照——filter 是否吞绘制）
    const a2 = mk(); const ca2 = a2.getContext('2d');
    ca2.save(); ca2.globalAlpha = 0.8;
    ca2.drawImage(ex64b, 0, fr * 24, 24, 24, 0, 0, 24, 24);
    ca2.restore();
    // A3: 主层无 filter 无 alpha（原样）
    const a3 = mk(); const ca3 = a3.getContext('2d');
    ca3.drawImage(ex64b, 0, fr * 24, 24, 24, 0, 0, 24, 24);
    // B: glow 层（lighter + 125/255）
    const b = mk(); const cb = b.getContext('2d');
    cb.save(); cb.globalCompositeOperation = 'lighter'; cb.globalAlpha = 125 / 255;
    cb.drawImage(g195b, 0, fr * 24, 24, 24, 0, 0, 24, 24);
    cb.restore();
    log.layers[`f${fr}`] = {
      main_filtered: statFrame(a, 'main+filter'),
      main_alpha_only: statFrame(a2, 'main α0.8'),
      main_raw: statFrame(a3, 'main raw'),
      glow: statFrame(b, 'glow lighter'),
    };
  }
  return log;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
