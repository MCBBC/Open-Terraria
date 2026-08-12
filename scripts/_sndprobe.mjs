// 爆炸音效探针:fetch+decode 验证 + 实播检查
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let r = null;
for (let att = 0; att < 12 && r === null; att++) {
  try {
    await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
    r = await page.evaluate(() => new Promise((res) => {
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
      // 0) 实爆路径打点
      const sfx0 = g.sfx;
      const calls = [];
      const origPlay = sfx0.play.bind(sfx0);
      sfx0.play = (n, v, x, y) => { calls.push([n, typeof x]); return origPlay(n, v, x, y); };
      (g).explodeAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16) + 3, 100, 4, true);
      await new Promise((r2) => setTimeout(r2, 500));
      (g).explodeAt(Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16) + 3, 100, 4, true);
      out.explodeCalls = calls.filter((c) => c[0] === 'explosion').length;
      out.bufAfterTwoExplosions = sfx0.buffers.has('Item_14');
      sfx0.play = origPlay;
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
      res(JSON.stringify(out));
    } else if (Date.now() - t0 > 60000) { clearInterval(iv); res('timeout'); }
  }, 300);
    }));
  } catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log(r);
await browser.close();
