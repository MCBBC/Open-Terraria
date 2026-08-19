// #A 合并验证:白天+GL 云 → glfx 应出现 cloud: 纹理键且天空有云;?cloudgl=0 → 2D 兜底。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/cloudm-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 150)));
page.setDefaultTimeout(200000);
await page.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 200 * 16;  // 湖上空,看天空
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 6000));
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const keys = r.glfx ? [...r.glfx.texs.keys()] : [];
  const wd = g.world.weather;
  const probe = { numClouds: wd.numClouds, numCloudsTemp: wd.numCloudsTemp,
    weatherCounter: wd.weatherCounter, cloudAlpha: +wd.cloudAlpha.toFixed(2),
    attachRef: !!r.sky.weatherRef, refNumClouds: r.sky.weatherRef?.numClouds };
  window.__cloudProbe = probe;
  const sky = r.sky;
  Object.assign(window.__cloudProbe ?? (window.__cloudProbe = {}), { vcloudsN: sky.vclouds.length, target: sky.targetCloudCount() });
  const ct = sky.vclouds?.slice(0, 3).map((c) => {
    const t = sky.cloudTex ? sky.cloudTex(c.type) : null;
    return { type: c.type, texOk: !!(t && t.width > 0), scale: +c.scale.toFixed(2) };
  });
  return { glfxAlive: !!r.glfx && !r.glfx.unavailable, texTotal: keys.length,
    cloudKeys: keys.filter((k) => k.startsWith('cloud:')),
    vclouds: sky.vclouds?.length ?? -1, sample: ct,
    useGLClouds: sky.useGLClouds, layerRef: !!sky.cloudGlLayer, probe: window.__cloudProbe };
});
console.log('[GL 共享层]', JSON.stringify(out));
// 等 110s 看 weatherCounter 到期重掷 → 云量回升(每 20s 采样)
for (let k = 0; k < 5; k++) {
  await new Promise((r) => setTimeout(r, 22000));
  const snap = await page.evaluate(() => {
    const g = window.__swGame, sky = g.renderer.sky, wd = g.world.weather;
    return { n: wd.numClouds, t: wd.numCloudsTemp, cnt: wd.weatherCounter, vclouds: sky.vclouds.length,
      cloudTex: [...g.renderer.glfx.texs.keys()].filter((x) => x.startsWith('cloud:')).length };
  });
  console.log(`[+${(k + 1) * 22}s]`, JSON.stringify(snap));
}
const shot = await page.screenshot({ type: 'png' }).catch(() => null);
if (shot) fs.writeFileSync('/Users/vinlic/.claude/jobs/8405c930/tmp/cloud-merge.png', shot);
await browser.close();
