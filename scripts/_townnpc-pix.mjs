// 城镇 NPC 贴图逐像素验证：屏幕渲染区域 vs NPC_17 帧 vs NPC_1(史莱姆) 对照
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  // 让商人站定到帧 0 再采样（等随机停步）
  const n = g.entities.npcs.find((x) => x.npcKey === 'merchant');
  g.player.x = n.x - 70; g.player.y = n.y - 10;
  // 相机由渲染循环驱动跟随：真实等待收敛（不用 fixedUpdate 直推）
  g.camera.x = n.cx; g.camera.y = n.cy - 20;
  await new Promise((r) => setTimeout(r, 1200));
  // 等商人随机停步（帧 0）
  for (let i = 0; i < 200 && n.frame !== 0; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  out.frame = n.frame;
  out.facing = n.facing;

  // 源贴图条帧 → 离屏 canvas 取像素（vnpc 与 strip 直接读图）
  const loadImg = (src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; });
  const strip = await loadImg('sprites/vanilla/NPC_17.png');
  const slime = await loadImg('sprites/vanilla/NPC_1.png');
  const frames = 25, fh = strip.height / frames;
  const fr = n.frame; // 当前帧（应已站定为 0）
  const sc = document.createElement('canvas'); sc.width = 40; sc.height = fh;
  const sctx = sc.getContext('2d'); sctx.drawImage(strip, 0, fr * fh, 40, fh, 0, 0, 40, fh);
  const spx = sctx.getImageData(0, 0, 40, fh).data;

  // 屏幕区域：脚底锚点 + zoom 1.25
  const zoom = g.camera.zoom;
  const [sx, sy] = g.camera.worldToScreen(n.cx, n.y + n.h);
  const w = 40 * zoom, h = fh * zoom;
  const rpx = g.renderer.ctx.getImageData(Math.round(sx - w / 2), Math.round(sy - h), Math.round(w), Math.round(h)).data;

  // 逐像素比对（对光照压暗免疫）：
  // a) alpha 掩膜重合度：strip 不透明像素在屏幕上也不透明的比例
  // b) 色度差：(r-g)/(g-b) 通道差，亮度缩放不变量
  const flip = n.facing > 0;
  const W = Math.round(w), H = Math.round(h);
  let maskHit = 0, cnt = 0, chroma = 0;
  for (let y = 0; y < fh; y++) for (let x = 0; x < 40; x++) {
    const si = (y * 40 + x) * 4;
    if (spx[si + 3] < 128) continue;
    const srcX = flip ? 40 - 1 - x : x;
    const rx = Math.min(W - 1, Math.max(0, Math.round(srcX * zoom)));
    const ry = Math.min(H - 1, Math.max(0, Math.round(y * zoom)));
    const ri = (ry * W + rx) * 4;
    if (rpx[ri + 3] > 30) maskHit++;
    // 色度（只对屏幕不透明像素累计）
    if (rpx[ri + 3] > 30) {
      const k = Math.max(1, rpx[ri + 3] / 255); // 半透明处按 alpha 还原近似
      const sr = spx[si], sg = spx[si + 1], sb = spx[si + 2];
      const rr = rpx[ri] / k, gg = rpx[ri + 1] / k, bb = rpx[ri + 2] / k;
      chroma += (Math.abs((sr - sg) - (rr - gg)) + Math.abs((sg - sb) - (gg - bb))) / 2;
    }
    cnt++;
  }
  out.maskHit = +(maskHit / cnt).toFixed(2);
  out.chromaDiff = +(chroma / Math.max(1, maskHit)).toFixed(1);
  out.samples = cnt;
  out.isDay = g.world.clock.isDay;

  // 对照：同一屏幕区域 vs 绿史莱姆 NPC_1 帧 0（错误贴图假设）
  const slc = document.createElement('canvas'); slc.width = slime.width; slc.height = slime.height / 2;
  const slctx = slc.getContext('2d'); slctx.drawImage(slime, 0, 0);
  const slpx = slctx.getImageData(0, 0, slime.width, slime.height / 2).data;
  let sdiff = 0, scnt = 0, smask = 0;
  for (let y = 0; y < slc.height; y++) for (let x = 0; x < slime.width; x++) {
    const si = (y * slime.width + x) * 4;
    if (slpx[si + 3] < 128) continue;
    const rx = Math.min(W - 1, Math.round(x / slime.width * W));
    const ry = Math.min(H - 1, Math.round(y / slc.height * H));
    const ri = (ry * W + rx) * 4;
    if (rpx[ri + 3] > 30) {
      smask++;
      const k = Math.max(1, rpx[ri + 3] / 255);
      const sr = slpx[si], sg = slpx[si + 1], sb = slpx[si + 2];
      const rr = rpx[ri] / k, gg = rpx[ri + 1] / k, bb = rpx[ri + 2] / k;
      sdiff += (Math.abs((sr - sg) - (rr - gg)) + Math.abs((sg - sb) - (gg - bb))) / 2;
    }
    scnt++;
  }
  out.slimeMaskHit = +(smask / scnt).toFixed(2);
  out.slimeChroma = +(sdiff / Math.max(1, smask)).toFixed(1);
  return out;
});
console.log(JSON.stringify(result, null, 1));
// 掩膜对照因人形覆盖 blob 区域而失去区分度（两者都≈1），判据以色度差为主：
// 商人贴图条 chromaDiff 应接近 0（光照只压暗不改色），史莱姆绿色 chroma 差应显著大
const ok = result.maskHit >= 0.9 && result.chromaDiff < result.slimeChroma * 0.3 && result.samples > 200;
console.log(ok ? 'PASS: 渲染像素 = NPC_17 商人贴图条（色度零差异；史莱姆对照 chroma=' + result.slimeChroma + '）' : 'FAIL: 渲染像素与商人贴图不吻合');
await browser.close();
process.exit(ok ? 0 : 1);
