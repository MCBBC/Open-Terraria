// 瀑布贴图复现探针(第五轮):载入用户存档 → 传送 (1485,587) 花岗岩半砖水池台阶
// → 截图 + dump WaterfallRenderer.falls 长柱登记表 + 池区液体状态
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SAVE = '/Users/vinlic/Downloads/map-12345世界 (1).json';
const TX = 1485, TY = 590; // 相机中心(格)

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const save = readFileSync(SAVE, 'utf8');

async function attempt() {
  await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const r = await page.evaluate(async ([saveTxt, TX, TY]) => {
    const t0 = Date.now();
    while (!window.__swGame?.player && Date.now() - t0 < 60000) {
      await new Promise((r2) => setTimeout(r2, 500));
    }
    const g = window.__swGame;
    if (!g?.player) return 'no game';
    const { loadSave } = await import('/src/save/SaveFile.ts');
    const { world, player } = loadSave(saveTxt);
    g.world = world;
    Object.assign(g.player, player);
    g.player.x = (TX + 8) * 16; g.player.y = (TY + 8) * 16;
    world.explored.fill(1); world.exploredVersion++;
    g.camera.x = TX * 16; g.camera.y = TY * 16;
    g.lighting.liquidDirty = true;
    return 'ok';
  }, [save, TX, TY]);
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

// 等瀑布扫描(每 30 帧≈0.5s 一扫)至少两轮
await new Promise((r2) => setTimeout(r2, 2500));
await page.screenshot({ path: '/tmp/wf5-1.png' });
const diag = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const out = { falls: [], pool: [], waterStyle: null };
  const wf = g.renderer.waterfalls;
  if (wf) {
    out.fallsCount = wf.count;
    // falls 是私有,借 count + 重扫验证;直接读私有字段(浏览器无所谓)
    const arr = wf.falls ?? [];
    for (const f of arr) out.falls.push({ x: f.x, y: f.y, type: f.type });
  }
  for (let y = 585; y <= 596; y++) {
    const row = [];
    for (let x = 1479; x <= 1490; x++) {
      const i = st.idx(x, y);
      row.push(`t${st.type[i]}h${st.half[i]}s${st.slope[i]}L${st.liquid[i]}x${st.liquidType[i]}`);
    }
    out.pool.push(y + ': ' + row.join(' '));
  }
  return out;
});
console.log(JSON.stringify(diag, null, 1));
await new Promise((r2) => setTimeout(r2, 2000));
await page.screenshot({ path: '/tmp/wf5-2.png' });
console.log('shots: /tmp/wf5-1.png /tmp/wf5-2.png');
await browser.close();
