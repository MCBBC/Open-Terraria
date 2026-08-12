// 爆炸音效探针:fetch+decode 验证 + 实播检查
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(() => new Promise((res) => {
  const t0 = Date.now();
  const iv = setInterval(async () => {
    if (window.__swGame?.player) {
      clearInterval(iv);
      const g = window.__swGame;
      const out = {};
      // 1) fetch+decode
      try {
        const resp = await fetch('sounds/Item_14.wav');
        out.status = resp.status;
        const ab = await resp.arrayBuffer();
        out.bytes = ab.byteLength;
        const actx = new AudioContext();
        const buf = await actx.decodeAudioData(ab);
        out.decoded = buf.duration.toFixed(2) + 's ' + buf.numberOfChannels + 'ch';
      } catch (e) { out.decodeError = String(e).slice(0, 80); }
      // 2) sfx 内部状态
      const sfx = g.sfx;
      const s = sfx;
      out.master = s.master;
      out.buffersHas = s.buffers.has ? s.buffers.has('Item_14') : 'no-map';
      out.failedHas = s.failed.has ? s.failed.has('Item_14') : 'no-set';
      // 3) 预载后实播(play 返回值路径不可见,听 playWavFile 前后 buffer)
      if (s.preloadFiles) { s.preloadFiles(['Item_14']); }
      await new Promise((r2) => setTimeout(r2, 800));
      out.afterPreload = s.buffers.has('Item_14');
      out.explosionMap = WAV ? 'n/a' : 'n/a';
      res(JSON.stringify(out));
    } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
  }, 300);
}));
console.log(r);
await browser.close();
