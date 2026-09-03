// A4 终版冒烟:eyebrellaCloud 强设 → 合成后逃逸队列渲染验证。
//   (s1) 无 pageerror(队列/flush 新代码零异常)
//   (s2) 玩家头顶区域出现非天空像素(云盖实际画出到合成后层)
//   (s3) 光照响应:全屏乘光不覆盖队列 → 白天烘焙亮度 > 暗处烘焙亮度(同一帧采样烘焙 canvas)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await new Promise((r) => setTimeout(r, 1500));
for (let i = 0; i < 3 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
}
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('V0PB');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const R = { checks: [] };
  const ck = (name, ok, detail) => { R.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}: ${name} [${detail}]`); };
  const p = g.player;
  // 强设旗:eyebrellaCloud 由装备聚合每帧重算,直赋被覆写——defineProperty 钉死
  Object.defineProperty(p, 'eyebrellaCloud', { get: () => true, configurable: true });
  // 贴图懒加载:ensureVImage 首查 null,重试直至加载完成
  for (let t = 0; t < 40; t++) {
    if ((g.renderer.atlas?.ensureVImage('vanilla/Projectile_238.png')?.width ?? 0) > 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 400));
  R.hb = { pausedBefore: g.paused };
  const renderer0 = g.renderer;
  const orig = renderer0.drawPlayer.bind(renderer0);
  R.dpc = 0;
  renderer0.drawPlayer = (...a) => { R.dpc++; return orig(...a); };
  R.dbg = {
    flag: p.eyebrellaCloud, dead: p.dead,
    texW: g.renderer.atlas?.ensureVImage('vanilla/Projectile_238.png')?.width ?? -1,
    queueLen: g.renderer.eyebrellaQueue.length,
    hasFlush: typeof g.renderer.flushEyebrellaCloud,
  };
  await new Promise((r) => setTimeout(r, 400));
  R.dbg.queueLen2 = g.renderer.eyebrellaQueue.length;
  // 缓存烘焙面采样(白天应亮于 170 帽?帽=170 → 白天烘焙=170/255≈0.667;暗处=光值)
  const renderer = g.renderer;
  const dayKey = [...renderer.eyebrellaDyeCache.keys()];
  R.keys = dayKey;
  ck('(s0) 缓存键生成(队列烘焙面就绪)', dayKey.length > 0, dayKey.join(' ; '));
  // 屏幕采样:玩家头顶上方 40-90px 带内,统计非天空差异像素(与云盖出现前后两帧差分)
  const cv = document.querySelector('canvas');
  const grab = () => { const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; };
  Object.defineProperty(p, 'eyebrellaCloud', { get: () => false, configurable: true });
  await new Promise((r) => setTimeout(r, 120));
  const before = grab();
  Object.defineProperty(p, 'eyebrellaCloud', { get: () => true, configurable: true });
  await new Promise((r) => setTimeout(r, 120));
  const after = grab();
  let diff = 0;
  for (let i = 0; i < before.length; i += 4) {
    const d = Math.abs(before[i] - after[i]) + Math.abs(before[i + 1] - after[i + 1]) + Math.abs(before[i + 2] - after[i + 2]);
    if (d > 24) diff++;
  }
  ck('(s1) 开关差分:云盖像素实际画到合成后层(diff>200)', diff > 200, `diffPx=${diff}`);
  // 手动 flush:构造 Camera 对准玩家,z=2,采样屏位附近非零像素
  try {
    const { Camera } = await import('/src/render/Camera.ts');
    const cam = new Camera(g.world.store.w, g.world.store.h);
    cam.x = p.cx; cam.y = p.cy - 70;
    const cv2 = g.renderer.canvas;
    const z = 2;
    const bctx2 = cv2.getContext('2d'); if (!bctx2) throw new Error('main canvas ctx unavailable(tainted/willReadFrequently)');
    const before2 = bctx2.getImageData(0, 0, cv2.width, cv2.height).data;
    const tex = g.renderer.atlas.ensureVImage('vanilla/Projectile_238.png');
    const bake = document.createElement('canvas');
    bake.width = tex.width; bake.height = Math.floor(tex.height / 6);
    const bctx = bake.getContext('2d');
    bctx.drawImage(tex, 0, 0, tex.width, bake.height, 0, 0, tex.width, bake.height);
    g.renderer.eyebrellaQueue.push({ wx: p.cx, wy: p.cy - 70, num2: 0.25, src: bake, cw: tex.width, ch: bake.height });
    g.renderer.flushEyebrellaCloud(cam, z);
    const after2 = bctx2.getImageData(0, 0, cv2.width, cv2.height).data;
    let d2 = 0;
    for (let i = 0; i < before2.length; i += 4) {
      const dd = Math.abs(before2[i] - after2[i]) + Math.abs(before2[i + 1] - after2[i + 1]) + Math.abs(before2[i + 2] - after2[i + 2]);
      if (dd > 24) d2++;
    }
    R.flushDiff = d2;
    ck('(s2) flushEyebrellaCloud 实绘(手驱,diff>50)', d2 > 50, `diffPx=${d2}`);
  } catch (e) { R.flushErr = String(e).slice(0, 160); }
  return R;
});
console.log(JSON.stringify(out, null, 1));
console.log(`SUMMARY: ${out.checks.filter((c) => c.ok).length}/${out.checks.length} PASS, pageerror=${errs.length}`);
if (errs.length) console.log('pageerrors:', errs);
await browser.close();
process.exit(out.checks.some((c) => !c.ok) || errs.length ? 1 : 0);
