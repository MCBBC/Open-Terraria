// 瀑布帧验证探针:载入用户存档 → 传送到标注点(2891,835) → 截图 + 液体动画帧诊断
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-无能的智慧偏僻地区.json';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const r = await page.evaluate(async (saveTxt) => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 60000) {
      await new Promise((r2) => setTimeout(r2, 500));
    }
    const g = window.__swGame;
    if (!g?.player) return 'no game';
    // 换装用户世界(loadSaveData → 重建 world/player)
    const { loadSave } = await import('/src/save/SaveFile.ts');
    const { world, player } = loadSave(saveTxt);
    g.world = world;
    Object.assign(g.player, player);
    // 相机+视野
    g.player.x = 2891 * 16 - 8; g.player.y = 820 * 16;
    g.camera.x = 2891 * 16; g.camera.y = 845 * 16;
    world.explored.fill(1); world.exploredVersion++;
    return 'ok';
  }, save);
  return r;
}

let ok = null;
for (let att = 0; att < 12; att++) {
  try { ok = await attempt(); break; }
  catch (e) {
    if (!/navigation|detached/i.test(e.message)) throw e;
    console.log('retry', att);
    await new Promise((r2) => setTimeout(r2, 2500));
  }
}
console.log('load:', ok);
if (ok !== 'ok') { console.log('GAVE UP'); await browser.close(); process.exit(1); }

// 等液流跑一会(湖面溢流形成下落柱),期间采两帧对比动画
await new Promise((r2) => setTimeout(r2, 6000));
await page.screenshot({ path: '/tmp/wf-1.png' });
const diag = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const cells = [];
  for (let y = 830; y <= 845; y++) {
    cells.push(y + ': ' + st.liquid[st.idx(2891, y)]);
  }
  return { liq: cells, hasWaterNear: cells.some((c) => parseInt(c.split(': ')[1]) > 0) };
});
console.log(JSON.stringify(diag));
await new Promise((r2) => setTimeout(r2, 1500));
await page.screenshot({ path: '/tmp/wf-2.png' });
console.log('shots saved');
await browser.close();
