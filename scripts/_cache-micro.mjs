import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/cache-micro-' + Date.now() % 100000,
  args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.goto('https://sandbox.vinlic.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(async () => {
  const out = {};
  const c = await caches.open('micro-test');
  const name = 'sprites/vanilla/SplashScreens_ResonanceArray.png';
  try {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    await c.put(name, new Response(buf, { headers: { 'Content-Type': 'image/png' } }));
    out.put = 'ok';
  } catch (e) { out.put = String(e); }
  const hit = await c.match(name);
  out.match = hit ? `${hit.status} ${hit.headers.get('content-type')}` : 'MISS';
  out.keys = (await caches.keys()).map(async (k) => [k, (await (await caches.open(k)).keys()).length]);
  out.keysAll = await Promise.all(out.keys);
  // 相对名 vs 绝对 URL 双读
  const hit2 = await c.match('https://sandbox.vinlic.com/' + name);
  out.matchAbs = hit2 ? 'HIT' : 'MISS';
  // SW 控制下的经网请求(应 cache-first 命中真实条目)
  const real = await fetch(name).then((x) => x.status).catch((e) => String(e));
  out.realFetch = real;
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
process.exit(0);
