// 瀑布帧验证探针:载入用户存档 → 传送到标注点(2891,835) → 截图 + 液体动画帧诊断
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-违法的要塞 (2).json';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
    g.player.x = 1222 * 16; g.player.y = 325 * 16;
    g.camera.x = 1222 * 16; g.camera.y = 334 * 16;
    world.explored.fill(1); world.exploredVersion++;
    g.renderer.fullbright = true;
    // 复现瀑布:x=1222 顶部注满一列水(地表 337 → 从 310 起注到 332),任其下流
    const st = g.world.store;
    const STONE = g.tileByKey['stone'];
    // 平台:309 行整行石面;310 行 x1222 半砖(唇缘),右邻 1223 露空
    for (let x = 1215; x <= 1230; x++) {
      st.setTile(x, 309, STONE, 0, 0);
      st.half[st.idx(x, 310)] = 0;
      st.setTile(x, 310, 0);
    }
    st.setTile(1222, 310, STONE, 0, 0);
    st.half[st.idx(1222, 310)] = 1;
    // 上方大水池(300-308 × 1218-1226)持续供水
    for (let x = 1218; x <= 1226; x++) {
      for (let y = 300; y <= 308; y++) {
        st.setTile(x, y, 0);
        st.setLiquid(x, y, 255, 1);
      }
    }
    g.lighting.liquidDirty = true;
    g.camera.x = 1223 * 16; g.camera.y = 316 * 16;
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
await new Promise((r2) => setTimeout(r2, 3500));
await page.screenshot({ path: '/tmp/wf-1.png' });
const diag = await page.evaluate(() => {
    const wf = window.__swGame.renderer.waterfalls; if (wf) console.log('falls=' + wf.count);
  const g = window.__swGame;
  const st = g.world.store;
  const cells = [];
  for (let y = 325; y <= 340; y++) {
    cells.push(y + ': ' + st.liquid[st.idx(1222, y)]);
  }
  return { liq: cells, hasWaterNear: cells.some((c) => parseInt(c.split(': ')[1]) > 0) };
});
console.log(JSON.stringify(diag));
await new Promise((r2) => setTimeout(r2, 2500));
await page.screenshot({ path: '/tmp/wf-2.png' });
console.log('shots saved');
await browser.close();
