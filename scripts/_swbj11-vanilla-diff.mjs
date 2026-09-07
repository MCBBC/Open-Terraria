// SW-BJ11 2026-09-07 定谳探针 v3:独立原版公式渲染器 vs 本仓 compositePaperDoll 烘焙
//  原版式样(照 PlayerDrawLayers.cs 反编译方程,全部层 top-left = base + 层偏移):
//   base = 帧锚;torso/arm/shoulder(composite)额外 + OffsetsPlayerHeadgear[row]-2(Main.cs:530)
//   头(0/1/2 竖条 row 行)、腿(10/11/12)、躯干复合 3 格(torsoX,0)、肩 4 格(1,1)/(0,1)、
//   臂 7/8/13 格(armX,armY/+2)、发(后=整帧先画,前=26px)、甲:Armor_Head/Armor/legs 竖条 row 行。
//  对拍:逐像素 alpha 指纹差(阈值 24),统计 mismatch 数与首差坐标。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const OUT = '/tmp/swbj11';
mkdirSync(OUT, { recursive: true });
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/tmp/swbj11-profile',
  args: ['--no-first-run'], defaultViewport: { width: 400, height: 300 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.setDefaultTimeout(300000);
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // ---- 独立贴图加载(不走 UITextures,直连 /sprites/vanilla/) ----
  const imgCache = new Map();
  async function V(name) {
    if (imgCache.has(name)) return imgCache.get(name);
    const img = new Image();
    img.src = '/sprites/vanilla/' + name;
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
    imgCache.set(name, img);
    return img;
  }
  // ---- OffsetsPlayerHeadgear(Main.cs:530) ----
  const OFFS = [2, 2, 2, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2];
  // ---- CreateCompositeData 帧表(PlayerDrawSet.cs:1916-2043) ----
  function armCell(row) { // frameIndex2
    switch (row) {
      case 0: return [2, 0]; case 1: return [3, 0]; case 2: return [4, 0]; case 3: return [5, 0];
      case 4: return [6, 0]; case 5: return [2, 1]; case 6: return [3, 1];
      case 7: case 8: case 9: case 10: return [4, 1];
      case 11: case 12: case 13: return [3, 1];
      case 14: return [5, 1]; case 15: case 16: return [6, 1]; case 17: return [5, 1];
      default: return [3, 1];   // 18,19
    }
  }
  const FW = 40, FH = 56;
  const scratch = document.createElement('canvas');
  scratch.width = FW; scratch.height = FH;
  const sc = scratch.getContext('2d', { willReadFrequently: true });
  sc.imageSmoothingEnabled = false;
  function cell(img, cx, cy) { // 取 40×56 格直绘到 scratch 原点
    sc.clearRect(0, 0, FW, FH);
    sc.drawImage(img, cx * FW, cy * FH, FW, FH, 0, 0, FW, FH);
    return scratch;
  }
  function strip(img, row) {
    sc.clearRect(0, 0, FW, FH);
    sc.drawImage(img, 0, row * FH, FW, Math.min(FH, (img.height | 0) - row * FH) || FH, 0, 0, FW, FH);
    return scratch;
  }
  // ---- 独立原版式渲染(男 variant0,站姿/行走 row;equip={head,body,legs} 甲贴图序号) ----
  async function vanillaFrame(row, equip) {
    const out = document.createElement('canvas');
    out.width = FW; out.height = FH;
    const c = out.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = false;
    const hg = OFFS[row] - 2;   // composite 层纵向偏移(方向 +1,直立)
    const [ax, ay] = armCell(row);
    const torsoX = row === 5 ? 1 : 0;
    const s0 = await V('Player_0_0.png'), s1 = await V('Player_0_1.png'), s2 = await V('Player_0_2.png');
    const s3 = await V('Player_0_3.png'), s4 = await V('Player_0_4.png'), s5 = await V('Player_0_5.png');
    const s6 = await V('Player_0_6.png'), s7 = await V('Player_0_7.png'), s8 = await V('Player_0_8.png');
    const s10 = await V('Player_0_10.png'), s11 = await V('Player_0_11.png'), s12 = await V('Player_0_12.png');
    const s13 = await V('Player_0_13.png');
    const hair = await V('Player_Hair_2.png');
    // 后发(1.4.4+:backHair 时后发整帧先画——hair 1 是后发型)
    c.drawImage(hair, 0, (row - 6) * FH, FW, FH, 0, 0, FW, FH);
    // 腿:皮肤(10)裤(11)鞋(12)——腿甲替代(13_Leggings else-if)
    if (!equip?.legs) {
      c.drawImage(s10, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s11, 0, row * FH, FW, FH, 0, 0, FW, FH);
      c.drawImage(s12, 0, row * FH, FW, FH, 0, 0, FW, FH);
    } else {
      const la = await V(`Armor_Legs_${equip.legs}.png`);
      c.drawImage(la, 0, row * FH, FW, FH, 0, 0, FW, FH);
    }
    // 躯干皮肤复合(:1289 vector+headgear) + 底衫/衬衫双 pass(17_TorsoComposite !flag 支)
    c.drawImage(cell(s3, torsoX, 0), 0, hg);
    c.drawImage(cell(s4, 1, 1), 0, hg);   // 后肩·底衫
    c.drawImage(cell(s4, torsoX, 0), 0, hg); // 躯干·底衫
    c.drawImage(cell(s4, 0, 1), 0, hg);   // 前肩·底衫
    c.drawImage(cell(s6, 1, 1), 0, hg);   // 后肩·衬衫
    c.drawImage(cell(s6, torsoX, 0), 0, hg);
    c.drawImage(cell(s6, 0, 1), 0, hg);
    // 后臂四层(皮肤7A/7B→底衫8→衬衫13)(:1385-1403)——格(ax,ay+2),+headgear
    c.drawImage(cell(s7, ax, ay + 2), 0, hg);
    c.drawImage(cell(s5, ax, ay + 2), 0, hg);
    c.drawImage(cell(s8, ax, ay + 2), 0, hg);
    c.drawImage(cell(s13, ax, ay + 2), 0, hg);
    // 身甲(17_TorsoComposite:复合甲替代肤/衣着;后肩→后臂→躯干→前肩→前臂 :1345-1366)
    if (equip?.body) {
      const ba = await V(`Armor_Armor_${equip.body}.png`);
      c.drawImage(cell(ba, 1, 1), 0, hg);
      c.drawImage(cell(ba, ax, ay + 2), 0, hg);
      c.drawImage(cell(ba, torsoX, 0), 0, hg);
      c.drawImage(cell(ba, 0, 1), 0, hg);
      c.drawImage(cell(ba, ax, ay), 0, hg);
    } else {
      // 前臂四层(皮肤7→底衫8→衬衫13→衬衫6B)(:3796-3803)——格(ax,ay),+headgear
      c.drawImage(cell(s7, ax, ay), 0, hg);
      c.drawImage(cell(s8, ax, ay), 0, hg);
      c.drawImage(cell(s13, ax, ay), 0, hg);
      c.drawImage(cell(s6, ax, ay), 0, hg);
    }
    // 头:肤(0)眼白(1)瞳(2)
    c.drawImage(strip(s0, row), 0, 0);
    c.drawImage(s1, 0, row * FH, FW, FH, 0, 0, FW, FH);
    c.drawImage(s2, 0, row * FH, FW, FH, 0, 0, FW, FH);
    // 前发(backHair 裁 26px)
    c.drawImage(hair, 0, (row - 6) * FH, FW, 26, 0, 0, FW, 26);
    // 头甲(发后)
    if (equip?.head) {
      const ha = await V(`Armor_Head_${equip.head}.png`);
      c.drawImage(ha, 0, row * FH, FW, FH, 0, 0, FW, FH);
    }
    return c.getImageData(0, 0, FW, FH);
  }
  // ---- 本仓烘焙 ----
  const m = await import('/src/player/PaperDoll.ts');
  const a = { name: 'probe', hair: 1, skinVariant: 0,
    hairColor: { r: 120, g: 80, b: 40 }, skinColor: { r: 255, g: 219, b: 172 },
    eyeColor: { r: 105, g: 90, b: 75 }, shirtColor: { r: 187, g: 79, b: 60 },
    undershirtColor: { r: 130, g: 130, b: 130 }, pantsColor: { r: 95, g: 105, b: 200 },
    shoeColor: { r: 150, g: 110, b: 80 }, difficulty: 0 };
  async function oursFrame(row, equip) {
    let d = null;
    const opts = row === 0 ? undefined : { rows: { body: row, legs: row } };
    for (let k = 0; k < 12 && !d; k++) { d = m.compositePaperDoll(a, equip, opts); if (!d) await sleep(350); }
    await sleep(600);
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
  function diff(v, o) {
    if (!v || !o) return 'NULL';
    let mm = 0, first = '';
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const va = v.data[(y * FW + x) * 4 + 3] > 24, oa = o.data[(y * FW + x) * 4 + 3] > 24;
      if (va !== oa) { mm++; if (!first) first = `(${x},${y}) v=${va ? 1 : 0} o=${oa ? 1 : 0}`; }
    }
    return `${mm}${mm ? ' first=' + first : ''}`;
  }
  const res = {};
  for (const row of [0, 6, 7, 8, 9, 10, 14, 15, 19]) {
    res[`bare_r${row}`] = diff(await vanillaFrame(row, null), await oursFrame(row, undefined));
  }
  for (const row of [0, 7, 8]) {
    const eq = { head: 1, body: 1, legs: 1 };
    res[`copper_r${row}`] = diff(await vanillaFrame(row, eq), await oursFrame(row, eq));
  }
  return res;
}).catch((e) => ({ err: String(e && e.stack || e).slice(0, 400) }));
console.log(JSON.stringify(out, null, 1));
await browser.close();
