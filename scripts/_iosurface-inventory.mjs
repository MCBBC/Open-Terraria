// IOSurface 占用盘点(2026-08-19):单页面养了多少张画布/GL 纹理,按家族分组。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_iosurface-inventory.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/inv-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 },
});
const page = await browser.newPage();
page.setDefaultTimeout(300000);
await page.goto((process.env.SW_ORIGIN || 'http://localhost:5201') + '/debug-line.html?cloudgl=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => import('/src/data/items.ts').catch(() => {})).catch(() => {});
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async () => {
  const res = await fetch('/debug-save.sbw.json');
  await window.__swFlow.loadJson(await res.text());
});
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 260 * 16;
  g.player.debugGod = true;
});
// 跑 90s 让敌人/掉落/云/区块全部铺开(工作集成型)
await new Promise((r) => setTimeout(r, 90000));
const inv = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer, sky = r.sky;
  const dom = [...document.querySelectorAll('canvas')].map((c) => [c.width, c.height]);
  const chunks = g.chunks;
  const cc = chunks ?? {};
  const glfx = r.glfx;
  const groups = {
    domCanvases: { count: dom.length, list: dom.map(([w, h]) => `${w}x${h}`) },
    chunkCache: { chunks: cc.chunks?.size ?? -1, wallPages: cc.wallPages?.length ?? -1,
      MAX_CHUNKS: cc.MAX_CHUNKS ?? -1 },
    glfx: glfx ? { texs: glfx.texs?.size ?? -1, bytesMB: +((glfx.bytes ?? 0) / 1048576).toFixed(1),
      canvas: `${glfx.canvas?.width}x${glfx.canvas?.height}` } : null,
    cloudGL: sky?.cloudGL ? { texs: sky.cloudGL.texs?.size ?? -1, quads: sky.cloudGL.quadsLastPass ?? -1 } : null,
    tintCache: { count: r.tintCache?.size ?? -1 },
    cloudTintCache: { count: sky?.cloudTintCache?.size ?? -1 },
    biomeBg: r.biomeBg ? { keys: Object.keys(r.biomeBg).length } : null,
  };
  // 敌怪在场数量(染色变体的驱动因素)
  groups.entities = { enemies: g.enemies?.length ?? -1, drops: g.drops?.length ?? -1, npcs: g.npcs?.length ?? -1 };
  return groups;
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log(JSON.stringify(inv, null, 1));
await browser.close();
