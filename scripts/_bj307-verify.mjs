// ★BJ307 实机逐像素验证探针:用户同款 Starter World(map 33)载入 → 两处物证格
// (6155,314)=273 slope3 / (6170,314)=272 slope4 → store 真值复核 + zoom2 截图 +
// 格内像素扫描。判据:修复后海面线坡面格【切角区】不得出现 LiquidSlope_0 主色
// (9,61,191)=#093DBF(±3)——修复前增强把整格斜面水画在此处(用户实报色块)。
// 用法(game/ 下):SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj307-verify.mjs
import fs from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launchBrowser, openPage, front } from '../tools/probe/lib/browser.mjs';
import { cleanStorage, gotoApp, waitForBridge, dismissWelcome } from '../tools/probe/lib/boot.mjs';
import { godMode, teleport } from '../tools/probe/lib/game.mjs';
import { camSnapToTile, worldToScreen } from '../tools/probe/lib/camera.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const OUT = process.env.BJ307_OUT ?? '/tmp/bj307-out';
const MAP = process.env.BJ307_MAP ?? '/Users/vinlic/Downloads/map-Starter_World (33).json';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[bj307]', ...a);

const MARKS = [
  { name: 'mark1', x: 6155, y: 314, sheet: 273, slope: 3 },
  { name: 'mark2', x: 6170, y: 314, sheet: 272, slope: 4 },
];

const browser = await launchBrowser({ errors: [] });
const page = await openPage(browser, { errors: [] });
page.on('dialog', async (d) => { log('DIALOG:', d.message().slice(0, 200)); await d.dismiss().catch(() => {}); });
page.on('pageerror', (e) => log('PAGEERROR:', String(e).slice(0, 300)));
page.__probeOrigin = ORIGIN;
const saveJsonTxt = fs.readFileSync(MAP, 'utf8');
log('map json loaded', saveJsonTxt.length);
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
const okGoto = await gotoApp(page, ORIGIN, { tries: 30 });
if (!okGoto) throw new Error('goto failed');
const bridge = await waitForBridge(page, { timeout: 120000 });
if (!bridge) throw new Error('bridge-timeout');
await front(page);
await page.evaluate(() => globalThis.__swSeededPut ?? Promise.resolve());
void page.evaluate(() => window.__swFlow.quickLoad())
  .then(() => log('quickLoad resolved'))
  .catch((e) => log('quickLoad rejected:', String(e).slice(0, 200)));
let ok = false;
for (let i = 0; i < 300; i++) {
  await sleep(1000);
  ok = await page.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player && window.__swGame?.world?.store));
  if (ok) { log('game ready after', i + 1, 's'); break; }
}
if (!ok) throw new Error('game-timeout');
await dismissWelcome(page).catch(() => {});
await godMode(page, true);
await sleep(800);

// 取证 1:物证格 store 真值(对照 debug-report enc 解码)
const cells = await page.evaluate((marks) => {
  const st = window.__swGame.world.store;
  const probe = (x, y) => {
    const i = st.idx(x, y);
    return { x, y, type: st.type[i], slope: st.slope[i], half: st.half[i], liquid: st.liquid[i], liquidType: st.liquidType[i], wall: st.wall[i] };
  };
  const out = {};
  for (const m of marks) {
    out[m.name] = { self: probe(m.x, m.y), down: probe(m.x, m.y + 1), left: probe(m.x - 1, m.y), right: probe(m.x + 1, m.y), up: probe(m.x, m.y - 1) };
  }
  return out;
}, MARKS);
log('cells', JSON.stringify(cells));

// 机位:zoom2 近景逐格截图。★坑(探针框架头注):camera.follow(player) 每帧自缓,
// player:false 直写位会被拉走;玩家在水里会上漂。→ 玩家 teleport 到【用户岸位】
// (y=309,物证 player.x/y 同款,落地稳定),cam 收敛后标注格在玩家下方 5 格=屏内。
await page.evaluate(() => { const g = window.__swGame; g.camera.zoomTarget = 2; g.camera.zoom = 2; });
for (const m of MARKS) {
  await teleport(page, m.x * 16 + 8, 309 * 16, { snapCamera: true, zeroVel: true });
  await sleep(3000);   // follow 0.15/frame 收敛 + 玩家落地
  const st2 = await page.evaluate(({ tx, ty }) => {
    const g = window.__swGame;
    const cam = g.camera;
    return { camX: cam.x, camY: cam.y, zoom: cam.zoom, px: g.player.x, py: g.player.y };
  }, { tx: m.x, ty: m.y });
  log(m.name, 'state', JSON.stringify(st2));
  const shot = join(OUT, `verify-${m.name}.png`);
  await saveCanvasShot(page, shot);
  const ws = await worldToScreen(page, m.x * 16, m.y * 16);
  log(m.name, 'shot', shot, 'tileTopleft@screen', JSON.stringify(ws));
}
fs.writeFileSync(join(OUT, 'verify-cells.json'), JSON.stringify(cells, null, 1));
log('VERIFY-DONE');
process.exit(0);
