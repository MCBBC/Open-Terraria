import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[0] = 1; g.player.builderAccStatus[1] = 0;
});
await freezeClock(page, { tod: 0.5 });
await page.mouse.move(1050, 650);
await pump(page, 60);
const res = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const cache = r._gridStripCache;
  const out = { keys: [...cache.keys()].map((k) => k + ':' + cache.get(k).width + 'x' + cache.get(k).height) };
  // 抽 U 条带与 img 模板对拍：img=scratch slot0（当前帧 tintedExtra 后）
  const scratch = r._rulerTintScratch;
  const img = scratch[0];
  const stripU = cache.get([...cache.keys()].find((k) => k.startsWith('U')));
  if (stripU && img) {
    const so = stripU.getContext('2d').getImageData(0, 0, 16, 32).data;
    const io = img.getContext('2d').getImageData(0, 18, 16, 16).data;
    let diff = 0; const first = [];
    for (let j = 0; j < 32; j++) for (let i = 0; i < 16; i++) {
      const si = (j * 16 + i) * 4, ii = ((j % 16) * 16 + i) * 4;
      if (so[si] !== io[ii] || so[si + 1] !== io[ii + 1] || so[si + 2] !== io[ii + 2] || so[si + 3] !== io[ii + 3]) {
        diff++;
        if (first.length < 4) first.push({ sx: i, sy: j, strip: [so[si], so[si + 1], so[si + 2], so[si + 3]], img: [io[ii], io[ii + 1], io[ii + 2], io[ii + 3]] });
      }
    }
    out.uDiff = diff; out.uFirst = first;
    out.imgDims = img.width + 'x' + img.height;
  } else out.uMiss = { hasStrip: !!stripU, hasImg: !!img };
  return out;
});
console.log('STRIP-INSPECT:', JSON.stringify(res, null, 1));
await browser.close();
