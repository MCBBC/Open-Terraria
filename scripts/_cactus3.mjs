import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await page.type('input', 'cactuspx');
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, {timeout: 120000});
const buf = readFileSync('/Users/vinlic/Downloads/不负责任的女妖啤酒厂.wld');
const out = await page.evaluate(async (arr) => {
  const { parseWldToSave } = await import('/src/wld/WldImport.ts');
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const { drawCactusCell } = await import('/src/render/VanillaTiler.ts');
  const r = parseWldToSave(new Uint8Array(arr));
  const { world } = loadSave(JSON.stringify(r.save));
  const st = world.store;
  const atlas = window.__swGame.renderer.atlas;
  const cactusId = TILE_BY_KEY['v_80_cactus'];
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  drawCactusCell(ctx, atlas, st, 2216, 297, cactusId, 0, 0);
  const d = ctx.getImageData(0, 0, 16, 16).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) {
    if (d[i+3] > 100) { px.push([d[i], d[i+1], d[i+2]]); if (px.length >= 6) break; }
  }
  return { pixels: px };
}, Array.from(buf));
console.log('DRAWN', JSON.stringify(out));
// 对照两张贴图中心像素
const browser2 = browser;
await browser2.close();
