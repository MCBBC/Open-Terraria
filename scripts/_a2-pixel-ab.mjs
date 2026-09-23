// ★A2 光照×扭曲 FBO 链像素对拍（2026-09-23;_bj77 范式跨载入版——wfbo 是载入期
//   静态旗,无法页内翻面,故双载入+确定性套件:同种子+freezeClock+sky dt=0+持物清空。
//   判据:全帧 md5 相等且逐像素 diff==0;随机面污染时看 maxΔ 报告分级）。
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=420000 scripts/_a2-pixel-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const L = ledger();
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});

async function runOnce(flag) {
  const page = await openPage(browser, {});
  await page.goto(`${ORIGIN}/?wfbo=${flag}`, { waitUntil: 'domcontentloaded' });
  await bootstrap(page, `${ORIGIN}/?wfbo=${flag}`);
  await createGame(page, { seed: '05162020', size: 'small' });
  await page.waitForFunction(() => !!(window.__swGame?.renderer?.sky), { timeout: 30000 });
  // 确定性套件（_bj77 同源:sky dt=0 定格云态;持物清空钉帧相位;冻结时钟停光照推进）
  await page.evaluate(() => {
    const g = window.__swGame;
    if (!g) throw new Error('__swGame 不在位');
    const sky = g.renderer.sky;
    const proto = Object.getPrototypeOf(sky);
    const origDraw = proto.draw;
    sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
      return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    };
    try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
    const lc = document.createElement('canvas');
    const lctx = lc.getContext('2d', { willReadFrequently: true });
    window.__snapB64 = () => {
      const c = g.renderer.canvas;
      if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
      lctx.clearRect(0, 0, lc.width, lc.height);
      lctx.drawImage(c, 0, 0);
      const d = lctx.getImageData(0, 0, lc.width, lc.height).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return btoa(bin);
    };
  });
  await freezeClock(page, { tod: 0.5 });   // 正午（光照收敛后定格）
  await pump(page, 40);                     // 收敛窗（chunk 烘焙/光照传播稳定）
  const b64 = await page.evaluate(() => window.__snapB64());
  // 连续第二帧（确定性自检:同态两帧应恒等——随机面在场的哨兵）
  await pump(page, 1);
  const b64b = await page.evaluate(() => window.__snapB64());
  await page.close();
  return { md5: md5(b64), md5b: md5(b64b), b64 };
}

const A = await runOnce('0');   // 旧链基线
const B = await runOnce('1');   // A2 FBO 链
console.log(`[land] 旧链 md5=${A.md5.slice(0, 10)} 自检两帧 ${A.md5 === A.md5b ? '恒等' : '漂移!'}`);
console.log(`[land] A2   md5=${B.md5.slice(0, 10)} 自检两帧 ${B.md5 === B.md5b ? '恒等' : '漂移!'}`);
if (A.md5 !== A.md5b || B.md5 !== B.md5b) {
  L.chk('[land] 载入内确定性（同态两帧恒等）', false, '随机面在场——先修探针再判 A2');
} else {
  L.chk('[land] 全帧 md5 一致', A.md5 === B.md5, `${A.md5.slice(0, 8)} vs ${B.md5.slice(0, 8)}`);
  if (A.md5 !== B.md5) {
    // 逐像素 diff 归因（maxΔ+计数+bbox——≤1~2LSB 备案口径）
    const diff = await (async () => {
      const page = await openPage(browser, {});
      await page.goto(`${ORIGIN}/?wfbo=0`, { waitUntil: 'domcontentloaded' });
      const r = await page.evaluate(({ x, y }) => {
        const dec = (b64) => { const s = atob(b64); const u = new Uint8ClampedArray(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
        const A = dec(x), B = dec(y);
        let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let i = 0; i < A.length; i++) {
          const d = Math.abs(A[i] - B[i]);
          if (d > 0) {
            n++;
            if (d > maxd) maxd = d;
            const px = (i >> 2) % 2000, py = (i >> 2) / 2000 | 0;
            if (px < x0) x0 = px; if (px > x1) x1 = px;
            if (py < y0) y0 = py; if (py > y1) y1 = py;
          }
        }
        return { n, maxd, bbox: [x0, y0, x1, y1] };
      }, { x: A.b64, y: B.b64 });
      await page.close();
      return r;
    })();
    console.log(`[land] diff=${diff.n} maxΔ=${diff.maxd} bbox=${JSON.stringify(diff.bbox)}`);
    L.chk('[land] 逐像素 diff==0（字节等价）', diff.n === 0, `diff=${diff.n} maxΔ=${diff.maxd}`);
  }
}
await browser.close();
L.report();
