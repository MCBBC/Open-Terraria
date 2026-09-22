// BJ278 修复验证探针：
// A. 世界画布 α 直读——79 头部修后应不在世界画布（α=0）
// B. 主画布星体仍在（头部可见性不丢）
// C. 同内容旧面 vs 新面合成实验（真实 sprite+染色数学）：
//    旧= 'lighter' 入透明画布 → source-over 压亮底（复现黑影）
//    新= opaque 底 'lighter'（零压暗）
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

await page.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ278验');
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
  await page.keyboard.type('bj278probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -300; dx <= 300; dx++) {
    for (let dy = -30; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.entities.drops.length = 0;
  g.entities.enemies.length = 0;
  g.entities.critters.length = 0;
  g.entities.projectiles.length = 0;
  g.paused = false;
  for (let k = 0; k < 20; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  return { pcy: Math.round(g.player.cy) };
});
console.log('setup', JSON.stringify(setup));

// 生成悬停弹
const hover = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx + 30, cy0 = g.player.cy - 60;
  const m = new MagicMissileProj(cx0, cy0, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: m0.cx, y: m0.cy }),
    payMana: () => true,
  });
  const m0 = m;
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('hover', JSON.stringify(hover));
await new Promise((r) => setTimeout(r, 400));

const report = await page.evaluate(async (hv) => {
  const g = window.__swGame;
  const r = g.renderer;
  const wc = r['worldCanvas'];
  const out = { hasWorldCanvas: !!wc };
  if (!wc) return out;
  const z = 1;   // glZoom/世界层 wK=1 档
  const camRX = Math.round(g.camera.x * z) / z;
  const camRY = Math.round(g.camera.y * z) / z;
  const sx = Math.round((hv.x - camRX) * z + wc.width / 2);
  const sy = Math.round((hv.y - camRY) * z + wc.height / 2);
  // A. 世界画布 α（星心 5×5 均值）
  const wctx = wc.getContext('2d', { willReadFrequently: true });
  const wd = wctx.getImageData(sx - 2, sy - 2, 5, 5).data;
  let aSum = 0, rgbSum = 0;
  for (let i = 0; i < wd.length; i += 4) { aSum += wd[i + 3]; rgbSum += Math.max(wd[i], wd[i + 1], wd[i + 2]); }
  out.worldCanvasHead = { alphaAvg: Math.round(aSum / 25), rgbMaxAvg: Math.round(rgbSum / 25) };
  // B. 主画布星体亮度（星心十字均值）
  const mc = [...document.querySelectorAll('#game-root canvas')].find((c) => c.width >= 1280 && c.offsetParent);
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const md = mctx.getImageData(sx - 2, sy - 2, 5, 5).data;
  let mSum = 0;
  for (let i = 0; i < md.length; i += 4) mSum += Math.max(md[i], md[i + 1], md[i + 2]);
  out.mainCanvasHeadMax = Math.round(mSum / 25);
  // C. 旧面 vs 新面合成实验（真实 sprite+染色数学）
  {
    const { projSprite } = await import('/src/entities/Arrow.ts');
    const img = projSprite(79);
    if (!img) { out.experiment = { fatal: 'no sprite' }; return out; }
    const iw = img.width, ih = img.height;
    const tintOf = (hx) => {
      const hue2rgb = (c, t1, t2) => {
        let x = c; if (x < 0) x += 1; if (x > 1) x -= 1;
        if (6 * x < 1) return t1 + (t2 - t1) * 6 * x;
        if (2 * x < 1) return t2;
        if (3 * x < 2) return t1 + (t2 - t1) * (2 / 3 - x) * 6;
        return t1;
      };
      const h = ((hx % 1) + 1) % 1;
      const q = 1, t = 0;   // l=0.5: q=1, t=0
      const rr = Math.round(hue2rgb(h + 1 / 3, t, q) * 255);
      const gg = Math.round(hue2rgb(h, t, q) * 255);
      const bb = Math.round(hue2rgb(h - 1 / 3, t, q) * 255);
      return [
        Math.max(0, Math.min(255, Math.trunc(rr * 0.3))),
        Math.max(0, Math.min(255, Math.trunc(gg * 0.3))),
        Math.max(0, Math.min(255, Math.trunc(bb * 0.3))),
      ];
    };
    // 染色光环合成画布（六团全画,星心布局同 drawHead）
    const halo = document.createElement('canvas');
    halo.width = 160; halo.height = 160;
    const hc = halo.getContext('2d', { willReadFrequently: true });
    hc.imageSmoothingEnabled = false;
    const s79 = 1, twoPi = Math.PI * 2, T = 0.25;
    const spinR = 2 * (1.4 * s79) + Math.cos(T * twoPi) * 0.4;
    for (let i = 0; i < 6; i++) {
      const [tr, tg, tb] = tintOf(i / 6);
      const c2 = document.createElement('canvas');
      c2.width = iw; c2.height = ih;
      const cc = c2.getContext('2d', { willReadFrequently: true });
      cc.drawImage(img, 0, 0);
      const d = cc.getImageData(0, 0, iw, ih);
      const px = d.data;
      for (let k = 0; k < px.length; k += 4) {
        px[k] = (px[k] * tr) / 255; px[k + 1] = (px[k + 1] * tg) / 255; px[k + 2] = (px[k + 2] * tb) / 255;
      }
      cc.putImageData(d, 0, 0);
      const ang = T * twoPi + (i / 6) * twoPi;
      const w = iw * 1.4, hh = ih * 1.4;
      hc.drawImage(c2, 80 + Math.cos(ang) * spinR - w / 2, 80 + Math.sin(ang) * spinR - hh / 2, w, hh);
    }
    const w2 = iw, h2 = ih;
    hc.drawImage(img, 80 - w2 / 2, 80 - h2 / 2, w2, h2);
    hc.drawImage(img, 80 - w2 / 2, 80 - h2 / 2, w2, h2);
    // 实验底：亮天空蓝 (120,170,240)
    const mkBg = () => {
      const b = document.createElement('canvas');
      b.width = 160; b.height = 160;
      const bc = b.getContext('2d');
      bc.fillStyle = 'rgb(120,170,240)';
      bc.fillRect(0, 0, 160, 160);
      return b;
    };
    // 旧面：halo（透明底内容）source-over 压亮底 = 生产 worldCanvas→main 复合
    const bgOld = mkBg();
    bgOld.getContext('2d').drawImage(halo, 0, 0);   // 缺省 source-over
    // 新面：opaque 底 'lighter' = 生产 flushTrailShade 主画布复合
    const bgNew = mkBg();
    const bnc = bgNew.getContext('2d');
    bnc.globalCompositeOperation = 'lighter';
    bnc.drawImage(halo, 0, 0);
    // 量测：光环环带（半径 30-48px 环内 max 通道负增量 + 绝对值样本）
    const measure = (cv) => {
      const d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, 160, 160).data;
      let worst = 0, worstPx = null, negN = 0;
      for (let y = 0; y < 160; y++) {
        for (let x = 0; x < 160; x++) {
          const rad = Math.hypot(x - 80, y - 80);
          if (rad < 28 || rad > 50) continue;
          const i = (y * 160 + x) * 4;
          const dr = Math.max(120 - d[i], 170 - d[i + 1], 240 - d[i + 2]);
          if (dr > 2) {
            negN++;
            if (dr > worst) { worst = dr; worstPx = { x, y, now: [d[i], d[i + 1], d[i + 2]] }; }
          }
        }
      }
      return { negN, worst, worstPx };
    };
    out.experiment = {
      OLD_sourceOver: measure(bgOld),
      NEW_lighterOpaque: measure(bgNew),
    };
    return out;
  }
}, hover);
console.log(JSON.stringify(report, null, 1));
await browser.close();
process.exit(0);
