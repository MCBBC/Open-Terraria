// IIII251 现状定谳探针:Starter World(map 30)载入 → 池塘两处斜坡水缘 → 截图+波场/管线状态取证。
// 用法(game/ 下):SW_ORIGIN=http://localhost:5301 node tools/run-diag.mjs scripts/_iii251-recon.mjs
import { DOWNLOADS, needInput } from './_pathlib.mjs';
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile, worldToScreen, viewRectTiles } from '../tools/probe/lib/camera.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5301';
const OUT = process.env.III251_OUT ?? '/tmp/iii251-out';
const MAP = process.env.III251_MAP ?? needInput(join(DOWNLOADS, 'map-Starter_World (30).json'));
const QUERY = process.env.III251_QUERY ?? '';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROG = '/tmp/iii251-progress.log';
const log = (...a) => {
  const line = `[iii251] ${a.join(' ')}`;
  console.log(line);
  try { fs.appendFileSync(PROG, line + '\n'); } catch { /* 忽略 */ }
};

const browser = await launchBrowser({ errors: [] });
log('browser launched');
const page = await openPage(browser, { errors: [] });
page.on('dialog', async (d) => { log('DIALOG:', d.message().slice(0, 300)); await d.dismiss().catch(() => {}); });
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 300)));
page.__probeOrigin = ORIGIN;
const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
log('map loaded from disk', saveJsonTxt.length);
// ★__swLoadJson 现役缺陷绕行:v6 重构后 worker saveParse 只认 IDB key(json/save 源
//   被丢)→ loadJson 桥必炸"存档数据缺失"。探针把整档 JSON 预置进 quicksave 键,
//   走 quickLoad→loadFromKey→worker kvGetIdb 主路径。
await page.evaluateOnNewDocument((json) => {
  globalThis.__swSeededPut = new Promise((res) => {
    try {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('kv', 'readwrite');
          tx.objectStore('kv').put(json, 'sandboxworld.quicksave');
          tx.oncomplete = () => { db.close(); res(); };
          tx.onerror = () => { db.close(); res(); };
          tx.onabort = () => { db.close(); res(); };
        } catch { db.close(); res(); }
      };
      req.onerror = () => res();
    } catch { res(); }
  });
}, saveJsonTxt);
await cleanStorage(page, {});
log('storage cleaned');
const okGoto = await gotoApp(page, ORIGIN, { extraQuery: QUERY, tries: 30 });
if (!okGoto) throw new Error('goto failed');
log('goto ok');
const bridge = await waitForBridge(page, { timeout: 120000 });
log('bridge', bridge);
if (!bridge) throw new Error('bridge-timeout');
await front(page);
// 等 IDB 预置完成(桥就绪前脚本已注入,这里同步等待种子事务)
await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
log('idb seeded');
void page.evaluate(() => window.__swFlow.quickLoad())
  .then(() => log('quickLoad resolved'))
  .catch((e) => log('quickLoad rejected:', String(e).slice(0, 200)));
log('quickLoad dispatched');
// 等游戏就绪(__swGame.player/world)
let ok = false;
for (let i = 0; i < 300; i++) {
  await sleep(1000);
  ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
  if (ok) { log('game ready after', i + 1, 's'); break; }
  if (i % 30 === 29) log('still waiting', i + 1, 's');
}
if (!ok) throw new Error('game-timeout');
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await sleep(800);

// 取证 1:标记格 store 真值
const cells = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const probe = (x, y) => {
    const i = st.idx(x, y);
    return { x, y, type: st.type[i], flags: st.flags[i], slope: st.slope[i], half: st.half[i],
      liquid: st.liquid[i], liquidType: st.liquidType[i], wall: st.wall[i] };
  };
  return {
    header: { groundLevel: g.world.groundLevel, rockLevel: g.world.rockLevel, w: st.w, h: st.h },
    mark1: [probe(3508, 394), probe(3507, 394), probe(3509, 394), probe(3508, 393), probe(3508, 395), probe(3509, 393)],
    mark2: [probe(3521, 394), probe(3520, 394), probe(3522, 394), probe(3521, 393), probe(3519, 394), probe(3518, 394), probe(3520, 393)],
  };
});
log('cells', JSON.stringify(cells));

// 取证 2:波场/扭曲管线状态
const waveState = await page.evaluate(async () => {
  const ww = await import('/src/render/WaterWaves.ts');
  const lr = await import('/src/render/VanillaLiquidRenderer.ts');
  return {
    query: location.search,
    quality: ww.waterWaves.quality,
    intensity: ww.waterWaves.intensity,
    texReady: ww.waveTexReady(),
    liquidDebug: JSON.parse(JSON.stringify(lr.liquidDebugState())),
    isCpuRender: window.__swGame.renderer.isCpuRender(),
  };
});
log('waveState', JSON.stringify(waveState));

// 机位:玩家站上岸(x3499,地面=394 行顶),zoom 2 近景;相机锚池塘中心防 follow 漂移
await page.evaluate(() => {
  const g = window.__swGame;
  g.camera.zoomTarget = 2; g.camera.zoom = 2;
});
await teleport(page, 3499 * 16, 390 * 16, { snapCamera: true, zeroVel: true });
await sleep(2000);
for (const [name, tx, ty] of [['mark1', 3510, 394], ['mark2', 3519, 394], ['pond', 3514, 394]]) {
  await camSnapToTile(page, tx, ty, { player: false });
  await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 2; g.camera.zoomTarget = 2; });
  await sleep(1500);
  const shot = join(OUT, `recon-${name}.png`);
  await saveCanvasShot(page, shot);
  const vr = await viewRectTiles(page);
  const sc = await worldToScreen(page, 3509 * 16, 394 * 16);
  log(name, 'shot', shot, 'view', JSON.stringify(vr), 'ws@screen', JSON.stringify(sc));
}
fs.writeFileSync(join(OUT, 'recon-state.json'), JSON.stringify({ cells, waveState }, null, 1));
log('RECON-DONE');
process.exit(0);
