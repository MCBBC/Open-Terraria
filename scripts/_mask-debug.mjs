import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:5201/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const out = await p.evaluate(async () => {
  const vt = await import('/src/render/VanillaTiler.ts');
  const tmf = await import('/src/render/TileMergeFamily.ts');
  return {
    merges: tmf.frameMergesWith(22, 54),
    merges2: tmf.frameMergesWith(54, 22),
    vid22: tmf.vanillaIdOf(22), vid54: tmf.vanillaIdOf(54),
    norm22: tmf.normalizedVidOf(22), norm54: tmf.normalizedVidOf(54),
    hasAutoFrameAt: typeof vt.autoFrameAt, hasFrameFor: typeof vt.frameFor, hasMask8: typeof vt.mask8,
    keys: Object.keys(vt).slice(0, 30),
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
