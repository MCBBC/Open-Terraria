// BJ403 探针:704 龙卷 alpha 黑斑——隔离复现+三层二分+XNA 预乘递推 oracle 对拍
// 用法: SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj403-storm-blackblob-probe.mjs
// 环境变量: BJ403_FLAGS='' (缺省 acc/shim 链 bgl+bglshim+b2b) | 'bgl=0' (2D 全链)
// 输出: /tmp/bj403-<tag>.json + /tmp/bj403-<tag>-*.png
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const FLAGS = process.env.BJ403_FLAGS || '';
const URL_ = ORIGIN + (FLAGS ? '?' + FLAGS : '');
console.log('PROBE URL:', URL_);

const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('BJ403V');
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
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const TILE = 16;
  const R = { chain: null, spawn: null, live: null, iso: null, frames: [], pngs: {} };
  R.chain = {
    bgl: g.renderer.bglPathUsed ?? null,
    shim: g.renderer.bglShimStats?.() ?? null,
    dpr: g.renderer.dpr,
  };
  const items = await import('/src/data/items.ts');
  const key = items.VANILLA_ITEM_KEY_BY_ID[3852];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY['vi_3852_'];
  const p = g.player;
  p.inv.slots[2] = { id, stack: 1 };
  p.inv.selected = 2;
  const sy = g.world.groundLevel;
  if (g.world.journeyPowers) g.world.journeyPowers.godmode = true;
  // 场地整平
  const px = Math.floor(p.x / TILE);
  for (let dx = -30; dx <= 30; dx++) {
    for (let dy = sy; dy < sy + 6; dy++) g.world.store.setTile(px + dx, dy, 1, 0, 0, true);
    for (let dy = sy - 8; dy < sy; dy++) g.world.store.setTile(px + dx, dy, 0, 0, 0, true);
  }
  const pin = () => { p.x = px * TILE; p.y = sy * TILE - p.h; p.vx = 0; p.vy = 0; };
  for (let i = 0; i < 8; i++) { pin(); g.fixedUpdate(1 / 60); }
  p.useTime = 0; p.itemTime = 0;
  p.mana = 400; p.statManaMax2 = 400; p.manaMax = 400;

  const cv = g.renderer.canvas;
  // 开火一发
  g.input.rightDown = true;
  for (let i = 0; i < 3; i++) { pin(); g.input.rightDown = true; g.fixedUpdate(1 / 60); }
  g.input.rightDown = false;
  let st = g.entities.projectiles.find((q) => q.projId === 704);
  if (!st) return { ...R, err: 'no-704-spawned' };
  R.spawn = { x: +st.cx.toFixed(0), y: +st.cy.toFixed(0), t: st.t };

  // ===== 隔离取证(推进到 t≈90 包络全开) =====
  const TARGET_T = 90;
  for (let f = 0; f < 300; f++) {
    await new Promise((r) => requestAnimationFrame(r));
    pin();
    st = g.entities.projectiles.find((q) => q.projId === 704);
    if (!st) break;
    if (st.t >= TARGET_T) break;
  }
  if (!st || st.t < TARGET_T / 2) return { ...R, err: 'storm-died-early', t: st ? st.t : -1 };
  R.live = { t: st.t, x: +st.x.toFixed(1), y: +st.y.toFixed(1), w: st.w, h: st.h };

  // 隔离画布:透明底,平移让龙卷落画布内(透明底 destination-out 为恒等,lighter 直加)
  const IW = 320, IH = 420;
  const mkIso = () => {
    const c = document.createElement('canvas'); c.width = IW; c.height = IH;
    return c;
  };
  const stats = (c, label) => {
    const cx = c.getContext('2d', { willReadFrequently: true });
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let nVis = 0, nBlack = 0, aSum = 0, rgbSum = 0, maxA = 0;
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    const blackSamples = [];
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const o = (y * c.width + x) * 4;
      const a = d[o + 3];
      if (a <= 2) continue;
      nVis++;
      const rs = d[o] + d[o + 1] + d[o + 2];
      aSum += a; rgbSum += rs; if (a > maxA) maxA = a;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      // 黑斑:不透明度高但 rgb 极低(getImageData straight 值)
      if (a > 200 && rs < 150) {
        nBlack++;
        if (blackSamples.length < 6) blackSamples.push({ x, y, r: d[o], g: d[o + 1], b: d[o + 2], a });
      }
    }
    return { label, nVis, nBlack, meanA: nVis ? +(aSum / nVis).toFixed(1) : 0,
      meanRGB: nVis ? +(rgbSum / nVis / 3).toFixed(1) : 0, maxA,
      bbox: nVis ? [minX, minY, maxX, maxY] : null, blackSamples };
  };

  // —— 变体 A:真实 draw 原链(透明底) ——
  {
    const c = mkIso(); const ic = c.getContext('2d');
    ic.translate(IW / 2 - (st.x + st.w / 2), IH - 60 - (st.y + st.h));
    st.draw({ ctx: ic }, null);
    R.iso = R.iso ?? {};
    R.iso.real = stats(c, 'real-draw');
    R.pngs.isoReal = c.toDataURL('image/png');
    // 合成到天空底色(观感对拍:透明底 viewer 渲黑无意义)
    const comp = (srcC) => {
      const k = document.createElement('canvas'); k.width = IW; k.height = IH;
      const kc = k.getContext('2d');
      kc.fillStyle = 'rgb(96,144,214)';   // 地表天空蓝
      kc.fillRect(0, 0, IW, IH);
      kc.drawImage(srcC, 0, 0);
      return k;
    };
    R.pngs.skyReal = comp(c).toDataURL('image/png');
  }
  // —— 变体 D:XNA 预乘递推 oracle(JS 逐像素) ——
  //  递推: rgb_p' = P + rgb_p×(1−sa); a' = sa + a×(1−sa)
  //  P = tex.rgb×tex.a×tint×f (预乘,straight 贴图), sa = tex.a×STORM_A×f
  //  rasterize: 每层 raw 贴图同 transform 画 scratch → straight 采样
  {
    const img = await (async () => {
      const m = await import('/src/entities/Arrow.ts');
      return m.projSprite(704);
    })();
    const iw = img.width, ih = img.height;
    const bx = st.x + st.w / 2, by = st.y + st.h, ty = st.y, H = st.h;
    const t = st.t;
    let env = Math.min(1, t / 30);
    if (t > st.life - 60) env = Math.max(0, 1 - (t - (st.life - 60)) / 60);
    const side = st.vx > 0 ? -1 : 1;
    const spin = -(Math.PI / 20) * t * side;
    const flipV = st.vx > 0;
    const step = Math.max(4.11, 5.01 + (t / 150) * -0.9);
    const ph = t % 60;
    const glv = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
    const blueK = ph < 30 ? glv(22, 30, ph) : glv(38, 30, ph);
    const STORM_A = (127 * 0.5) / 255;
    const TINT = [[160, 140, 100], [140, 160, 255]];
    // oracle 缓冲(浮点 premul)
    const W = IW, Hh = IH;
    const oR = new Float64Array(W * Hh), oG = new Float64Array(W * Hh), oB = new Float64Array(W * Hh), oA = new Float64Array(W * Hh);
    const scratch = document.createElement('canvas'); scratch.width = W; scratch.height = Hh;
    const sc = scratch.getContext('2d', { willReadFrequently: true });
    let acc = 0;
    for (let yy = Math.floor(by); yy > Math.floor(ty); yy -= step) {
      acc += step;
      const n = acc / H;
      const twist = acc * (Math.PI * 2) / -20 * (st.vx > 0 ? -1 : 1);
      const k = n <= 0.5 ? n * 2 : 2 - n * 2;
      const fB = k * env;
      if (fB <= 0.004) continue;
      const scl = 1 + (n - 0.35);
      const layer = (which, f, s) => {
        if (!(f > 0.004)) return;
        sc.save();
        sc.setTransform(1, 0, 0, 1, 0, 0);
        sc.clearRect(0, 0, W, Hh);
        sc.imageSmoothingEnabled = false;
        sc.translate(W / 2 - (st.x + st.w / 2), IH - 60 - (st.y + st.h));
        sc.translate(bx, yy);
        sc.rotate(spin + twist);
        sc.scale(s, flipV ? -s : s);
        sc.drawImage(img, -iw / 2, -ih / 2);
        const sd = sc.getImageData(0, 0, W, Hh).data;
        const [tr, tg, tb] = TINT[which];
        const mR = tr * f / 255, mG = tg * f / 255, mB = tb * f / 255, mE = STORM_A * f;
        for (let i = 0; i < W * Hh; i++) {
          const a = sd[i * 4 + 3] / 255;
          if (a <= 0) continue;
          const sa = a * mE;
          if (sa <= 0) continue;
          const o = i * 4;
          const P_r = sd[o] / 255 * a * mR, P_g = sd[o + 1] / 255 * a * mG, P_b = sd[o + 2] / 255 * a * mB;
          const inv = 1 - sa;
          oR[i] = P_r + oR[i] * inv; oG[i] = P_g + oG[i] * inv; oB[i] = P_b + oB[i] * inv;
          oA[i] = sa + oA[i] * inv;
        }
        sc.restore();
      };
      if (blueK > 0) layer(1, fB * blueK, scl * 0.8);
      layer(0, fB, scl);
    }
    // oracle 结果:premul → straight + 黑斑统计 + 与 real 对拍
    const oc = mkIso(); const octx = oc.getContext('2d');
    const oim = octx.createImageData(W, Hh);
    let nVis = 0, nBlack = 0, aSum = 0, rgbSum = 0;
    for (let i = 0; i < W * Hh; i++) {
      const A = Math.min(1, oA[i]);
      const o = i * 4;
      const rs = Math.min(1, oR[i]) / (A > 0 ? A : 1), gs = Math.min(1, oG[i]) / (A > 0 ? A : 1), bs = Math.min(1, oB[i]) / (A > 0 ? A : 1);
      oim.data[o] = Math.round(rs * 255); oim.data[o + 1] = Math.round(gs * 255);
      oim.data[o + 2] = Math.round(bs * 255); oim.data[o + 3] = Math.round(A * 255);
      if (A > 0.008) {
        nVis++; aSum += A * 255; rgbSum += (rs + gs + bs) / 3 * 255;
        if (A > 0.78 && (rs + gs + bs) * 255 < 150) nBlack++;
      }
    }
    octx.putImageData(oim, 0, 0);
    R.iso = R.iso ?? {};
    R.iso.oracle = { label: 'xna-oracle', nVis, nBlack, meanA: +(aSum / Math.max(1, nVis)).toFixed(1),
      meanRGB: +(rgbSum / Math.max(1, nVis)).toFixed(1), maxA: 255, bbox: null, blackSamples: [] };
    R.pngs.isoOracle = oc.toDataURL('image/png');
    if (R.pngs.skyReal) {
      const kc2 = document.createElement('canvas'); kc2.width = IW; kc2.height = IH;
      const k2 = kc2.getContext('2d');
      k2.fillStyle = 'rgb(96,144,214)';
      k2.fillRect(0, 0, IW, IH);
      k2.drawImage(oc, 0, 0);
      R.pngs.skyOracle = kc2.toDataURL('image/png');
    }

    // —— 逐像素对拍 real vs oracle(同区域) ——
    const rc = mkIso(); const ric = rc.getContext('2d');
    ric.translate(IW / 2 - (st.x + st.w / 2), IH - 60 - (st.y + st.h));
    st.draw({ ctx: ric }, null);
    const rd = ric.getImageData(0, 0, W, Hh).data;
    let dA = 0, dRGB = 0, dPremul = 0, cnt = 0, bigA = 0, bigRGB = 0, bigPm = 0, nRealVis = 0, nOrVis = 0;
    const worst = [], worstRGB = [];
    for (let i = 0; i < W * Hh; i++) {
      const o = i * 4;
      const ra = rd[o + 3] / 255, oa = oim.data[o + 3] / 255;
      if (ra > 0.008) nRealVis++;
      if (oa > 0.008) nOrVis++;
      if (ra <= 0.008 && oa <= 0.008) continue;
      cnt++;
      const da = ra - oa;
      const drg = rd[o] - oim.data[o], dgg = rd[o + 1] - oim.data[o + 1], dbg = rd[o + 2] - oim.data[o + 2];
      // 预乘域差(real straight×a vs oracle straight×a)=两遍混合式真正控制的量
      const pmr = [rd[o] * ra - oim.data[o] * oa, rd[o + 1] * ra - oim.data[o + 1] * oa,
        rd[o + 2] * ra - oim.data[o + 2] * oa];
      const pmAbs = (Math.abs(pmr[0]) + Math.abs(pmr[1]) + Math.abs(pmr[2])) / 3;
      dA += da; dRGB += (Math.abs(drg) + Math.abs(dgg) + Math.abs(dbg)) / 3; dPremul += pmAbs;
      if (Math.abs(da) > 0.15) bigA++;
      if ((Math.abs(drg) + Math.abs(dgg) + Math.abs(dbg)) / 3 > 40) bigRGB++;
      if (pmAbs > 0.06) bigPm++;
      if (worst.length < 5 && Math.abs(da) > 0.3) worst.push({ i, x: i % W, y: (i / W) | 0,
        real: [rd[o], rd[o + 1], rd[o + 2], rd[o + 3]], oracle: [oim.data[o], oim.data[o + 1], oim.data[o + 2], oim.data[o + 3]] });
      if (worstRGB.length < 6 && pmAbs > 0.08) worstRGB.push({ x: i % W, y: (i / W) | 0,
        real: [rd[o], rd[o + 1], rd[o + 2], rd[o + 3]], oracle: [oim.data[o], oim.data[o + 1], oim.data[o + 2], oim.data[o + 3]],
        pmAbs: +pmAbs.toFixed(3) });
    }
    R.iso.compare = { pxCnt: cnt, nRealVis, nOrVis, meanDA: +(dA / Math.max(1, cnt)).toFixed(4),
      meanDRGB: +(dRGB / Math.max(1, cnt)).toFixed(1), meanDPremul: +(dPremul / Math.max(1, cnt)).toFixed(4),
      bigADiffPx: bigA, bigRGBDiffPx: bigRGB, bigPremulDiffPx: bigPm, worst, worstRGB };
  }
  return R;
});

const fs = await import('node:fs');
const tag = (FLAGS || 'acc-shim').replace(/[^a-z0-9]+/gi, '-');
const pngs = out.pngs ?? {};
delete out.pngs;
fs.writeFileSync(`/tmp/bj403-${tag}.json`, JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(pngs)) {
  fs.writeFileSync(`/tmp/bj403-${tag}-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
}
console.log(JSON.stringify(out, null, 1).slice(0, 3600));
console.log(`SAVED /tmp/bj403-${tag}.json (+${Object.keys(pngs).length} png)`);
await browser.close();
