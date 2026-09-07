// SW-BJ11 2026-09-07 定谳探针 v5:三方并排(独立原版式 | 本仓烘焙 | 差异图) 8x 放大
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1400, height: 700 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FW = 40, FH = 56;
  const imgCache = new Map();
  async function V(name) {
    if (imgCache.has(name)) return imgCache.get(name);
    const img = new Image();
    const ok = await new Promise((res) => {
      img.onload = () => res(true); img.onerror = () => res(false);
      img.src = '/sprites/vanilla/' + name;
    });
    if (!ok && !name.startsWith('Player_0_')) return V(name.replace(/^Player_\d+_/, 'Player_0_'));
    if (!ok) throw new Error('missing ' + name);
    imgCache.set(name, img);
    return img;
  }
  const OFFS = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
  function armCell(row) {
    switch (row) {
      case 0: return [2, 0]; case 1: return [3, 0]; case 2: return [4, 0]; case 3: return [5, 0];
      case 4: return [6, 0]; case 5: return [2, 1]; case 6: return [3, 1];
      case 7: case 8: case 9: case 10: return [4, 1];
      case 11: case 12: case 13: return [3, 1];
      case 14: return [5, 1]; case 15: case 16: return [6, 1]; case 17: return [5, 1];
      default: return [3, 1];
    }
  }
  const scratch = document.createElement('canvas');
  scratch.width = FW; scratch.height = FH;
  const sc = scratch.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingEnabled = false;
  function blit(img, sx, sy, h = FH) {
    sc.clearRect(0, 0, FW, FH);
    sc.drawImage(img, sx, sy, FW, h, 0, 0, FW, h);
    return scratch;
  }
  async function vanillaFrame(row, equip, variant, hair) {
    const out = document.createElement('canvas');
    out.width = FW; out.height = FH;
    const c = out.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    const hg = OFFS[row] - 2;
    const [ax, ay] = armCell(row);
    const torsoX = row === 5 ? 1 : 0;
    const dy = (variant !== 0 && variant !== 1 && variant !== 2 && variant !== 3 && variant !== 8 && variant !== 10) ? 2 : 0;
    const g = (n) => `Player_${variant}_${n}.png`;
    const s0 = await V(g(0)), s1 = await V(g(1)), s2 = await V(g(2));
    const s3 = await V(g(3)), s4 = await V(g(4)), s5 = await V(g(5));
    const s6 = await V(g(6)), s7 = await V(g(7)), s8 = await V(g(8));
    const s10 = await V(g(10)), s11 = await V(g(11)), s12 = await V(g(12));
    const s13 = await V(g(13));
    const hairImg = await V(`Player_Hair_${hair + 1}.png`);
    const hy = Math.max(0, row - 6) * FH;
    const BACK_HAIR = (h2) => (h2 === 6 || h2 === 133 || h2 === 134 || h2 === 146 || h2 === 162)
      || (h2 > 50 && (h2 < 56 || h2 > 63) && (h2 < 74 || h2 > 77) && (h2 < 88 || h2 > 89)
        && h2 !== 94 && h2 !== 100 && h2 !== 104 && h2 !== 112 && h2 < 116);
    if (BACK_HAIR(hair)) c.drawImage(hairImg, 0, hy, FW, FH, 0, 0, FW, FH);
    if (!equip?.legs) {
      c.drawImage(s10, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s11, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s12, 0, row * FH, FW, FH, 0, 0, FW, FH);
    }
    c.drawImage(blit(s3, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s4, FW, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s4, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s4, 0, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s6, FW, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s6, torsoX * FW, dy * FH), 0, hg);
    c.drawImage(blit(s6, 0, (1 + dy) * FH), 0, hg);
    c.drawImage(blit(s7, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s5, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s8, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s13, ax * FW, (ay + 2) * FH), 0, hg);
    c.drawImage(blit(s7, ax * FW, ay * FH), 0, hg);
    c.drawImage(blit(s8, ax * FW, ay * FH), 0, hg);
    c.drawImage(blit(s13, ax * FW, ay * FH), 0, hg);
    c.drawImage(blit(s6, ax * FW, ay * FH), 0, hg);
    c.drawImage(s0, 0, row * FH, FW, FH, 0, 0, FW, FH);
    c.drawImage(s1, 0, row * FH, FW, FH, 0, 0, FW, FH);
    c.drawImage(s2, 0, row * FH, FW, FH, 0, 0, FW, FH);
    // 前发:backHair=26px,否则整帧
    const frontH = BACK_HAIR(hair) ? 26 : FH;
    c.drawImage(hairImg, 0, hy, FW, frontH, 0, 0, FW, frontH);
    return c.getImageData(0, 0, FW, FH);
  }
  const m = await import('/src/player/PaperDoll.ts');
  const baseApp = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  async function oursFrame(row, equip, variant, hair) {
    const a = { ...baseApp, skinVariant: variant, hair };
    const opts = row === 0 ? undefined : { rows: { body: row, legs: row } };
    let d = null;
    for (let k = 0; k < 12 && !d; k++) { d = m.compositePaperDoll(a, equip, opts); if (!d) await sleep(300); }
    await sleep(500);
    d = m.compositePaperDoll(a, equip, opts);
    if (!d) return null;
    const cv = document.createElement('canvas');
    cv.width = FW; cv.height = FH;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    const isFull = d.height >= 20 * FH;
    c.drawImage(d, 0, (isFull ? row : 0) * FH, FW, FH, 0, 0, FW, FH);
    return c.getImageData(0, 0, FW, FH);
  }
  // 并排图:每个状态一行 [原版式|本仓|差异],8x
  const Z = 8;
  const states = [
    { row: 0, equip: null, variant: 4, hair: 0 },
    { row: 0, equip: { head: 3, body: 3, legs: 3 }, variant: 4, hair: 8 },
  ];
  const cv = document.createElement('canvas');
  cv.id = 'swbj11-sbs';
  cv.width = 3 * (FW * Z + 30) + 20; cv.height = states.length * (FH * Z + 26) + 10;
  cv.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#333;image-rendering:pixelated';
  document.body.appendChild(cv);
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const res = [];
  for (let i = 0; i < states.length; i++) {
    const st = states[i];
    const v = await vanillaFrame(st.row, st.equip, st.variant, st.hair);
    const o = await oursFrame(st.row, st.equip, st.variant, st.hair);
    const oy = i * (FH * Z + 26) + 8;
    // 原版式
    const vcv = document.createElement('canvas'); vcv.width = FW; vcv.height = FH;
    vcv.getContext('2d').putImageData(v, 0, 0);
    c.drawImage(vcv, 10, oy, FW * Z, FH * Z);
    c.fillStyle = '#fff'; c.font = '13px monospace';
    c.fillText('vanilla-eq', 10, oy + FH * Z + 16);
    // 本仓
    const ocv = document.createElement('canvas'); ocv.width = FW; ocv.height = FH;
    if (o) ocv.getContext('2d').putImageData(o, 0, 0);
    c.drawImage(ocv, 20 + FW * Z, oy, FW * Z, FH * Z);
    c.fillText('ours', 20 + FW * Z, oy + FH * Z + 16);
    // 差异图:红=仅原版 蓝=仅本仓
    const dcv = document.createElement('canvas'); dcv.width = FW; dcv.height = FH;
    const dc = dcv.getContext('2d');
    const dimg = dc.createImageData(FW, FH);
    let mm = 0;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const idx = (y * FW + x) * 4 + 3;
      const va = v.data[idx] > 24, oa = o.data[idx] > 24;
      const p = (y * FW + x) * 4;
      if (va && !oa) { dimg.data[p] = 255; dimg.data[p + 1] = 40; dimg.data[p + 2] = 40; dimg.data[p + 3] = 255; mm++; }
      else if (!va && oa) { dimg.data[p] = 60; dimg.data[p + 1] = 90; dimg.data[p + 2] = 255; dimg.data[p + 3] = 255; mm++; }
      else if (va && oa) { dimg.data[p] = 255; dimg.data[p + 1] = 255; dimg.data[p + 2] = 255; dimg.data[p + 3] = 40; }
    }
    dc.putImageData(dimg, 0, 0);
    c.drawImage(dcv, 30 + 2 * FW * Z, oy, FW * Z, FH * Z);
    c.fillText(`diff=${mm}`, 30 + 2 * FW * Z, oy + FH * Z + 16);
    res.push({ tag: `v${st.variant}h${st.hair}r${st.row}`, n: mm });
  }
  return res;
}).catch((e) => ({ err: String(e && e.stack || e).slice(0, 300) }));
console.log(JSON.stringify(out));
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: OUT + '/sbs.png', clip: { x: 0, y: 0, width: 1400, height: 660 } });
console.log('SBS-DONE');
await browser.close();
