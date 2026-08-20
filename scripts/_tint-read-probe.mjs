// 读 tinted 变体本体:tintAtlas 中 npc1 变体像素 vs 理论(texel×color/255)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 280000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ren = g.renderer;
  const atlas = ren.atlas;
  // 等 NPC_1 加载完
  for (let i = 0; i < 50 && !atlas.vimages.has('vanilla/NPC_1.png'); i++) {
    atlas.vnpc(1, 0);
    await new Promise((r) => setTimeout(r, 100));
  }
  const frame = atlas.vnpc(1, 0);
  if (!frame) return { frame: 'null' };
  // 源帧中心像素
  const srcCv = document.createElement('canvas');
  srcCv.width = frame.sw; srcCv.height = frame.sh;
  const sctx = srcCv.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(frame.img, frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, frame.sw, frame.sh);
  const srcC = sctx.getImageData(11, 10, 5, 5).data;
  let sr = 0, sg = 0, sb = 0, sa = 0;
  for (let j = 0; j < srcC.length; j += 4) { sr += srcC[j]; sg += srcC[j + 1]; sb += srcC[j + 2]; sa += srcC[j + 3]; }
  const src = [Math.round(sr / 25), Math.round(sg / 25), Math.round(sb / 25), Math.round(sa / 25)];
  // 烘焙变体
  const t = ren.tintedSprite('npc1probe', frame, [0, 80, 255, 100]);
  if (!t) return { src, tinted: 'null' };
  const tctx = t.c.getContext('2d');
  const d = tctx.getImageData(t.x + 11, t.y + 10, 5, 5).data;
  let r = 0, gg = 0, b = 0, a = 0;
  for (let j = 0; j < d.length; j += 4) { r += d[j]; gg += d[j + 1]; b += d[j + 2]; a += d[j + 3]; }
  const tinted = [Math.round(r / 25), Math.round(gg / 25), Math.round(b / 25), Math.round(a / 25)];
  // 理论:src.rgb × (0,80,255)/255
  const theory = [Math.round(src[0] * 0 / 255), Math.round(src[1] * 80 / 255), Math.round(src[2] * 255 / 255), src[3]];
  ren.tintAtlas.drop(`npc1probe|${frame.sx},${frame.sy},${frame.sw},${frame.sh}|0,80,248`);
  return { src, tinted, theory };
});
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('页面异常:', errors.slice(0, 5));
await browser.close();
process.exit(0);
