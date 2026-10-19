import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/cache-space-' + (Date.now() % 100000), args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto('https://sandboxworld.online/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(async () => {
  const c = await caches.open('space-test');
  const raw = 'sprites/vanilla/Backgrounds_Underworld 0.png';   // manifest 条目名(空格)
  await c.put(raw, new Response(new Uint8Array([1]).buffer, { headers: { 'Content-Type': 'image/png' } }));
  const keyUrls = (await c.keys()).map((k) => k.url);
  const fromKeys = keyUrls.map((u) => new URL(u).pathname.replace(/^\//, ''));
  return { raw, keyUrls, fromKeys, matchByRaw: !!(await c.match(raw)),
    haveSetHasRaw: fromKeys.includes(raw) };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
process.exit(0);
