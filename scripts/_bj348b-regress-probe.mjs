// ★BJ348b 回归探针（数据面,零截图读取）——用户实报"星云奥秘使用后物块/NPC 消失,
// 球体消失才回来"复现 + 二分。
// 度量：主画布三个固定窗口 getImageData 非透明像素计数（纯数字输出）：
//   GROUND=屏幕中心偏下（地表物块带）/ SKY=右上（背景天空带）/ PLAYER=中心（玩家+球体带）
// 流程：基线 60 帧 → 装备 3476 持续按住 240 帧（球体在场）→ 松手 120 帧。
// 运行：SW_ORIGIN=http://localhost:5176 node tools/run-diag.mjs scripts/_bj348b-regress-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5176', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('bj348b', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;

  // ---- 落位：干净地表（探针先例同款）----
  let groundY = -1;
  const pcol0 = Math.trunc(4200 * 8);
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(pcol0, y)) { groundY = y; break; } }
  const c0 = groundY >= 0 ? pcol0 : Math.trunc(p.x / 16);
  if (groundY < 0) {
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  }
  p.x = c0 * 16; p.y = groundY * 16 - p.h;
  p.vx = 0; p.vy = 0;
  p.baseMaxMana = 400; p.mana = 400;
  // 相机跟手（render 用 cam——内部位移即可）

  const renderFrame = () => { try { g.render(); } catch (e) { return String(e).slice(0, 120); } return null; };
  const step = (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); g.render(); } };

  // ---- 像素窗口统计（主画布,纯数字;颜色分类度量）----
  const cv = g.renderer.canvas;
  const W = cv.width, H = cv.height;
  const ctx2 = cv.getContext('2d', { willReadFrequently: true });
  const statWin = (x0f, y0f, wf, hf) => {
    const x0 = Math.floor(W * x0f), y0 = Math.floor(H * y0f);
    const ww = Math.floor(W * wf), hh = Math.floor(H * hf);
    const d = ctx2.getImageData(x0, y0, ww, hh).data;
    let sky = 0, green = 0, brown = 0, purple = 0, other = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (b > 150 && b > r + 30 && gg > 100) sky++;                 // 天空蓝
      else if (gg > r + 15 && gg > b + 25) green++;                 // 草绿
      else if (r > 90 && r > b + 25 && gg > b && gg < r) brown++;   // 土棕
      else if (b > 90 && r > 70 && gg < Math.min(r, b)) purple++;   // 紫系（球体/星云尘）
      else other++;
    }
    return { sky, green, brown, purple, other };
  };
  const snap = () => ({
    ground: statWin(0.35, 0.62, 0.30, 0.18),   // 中心偏下=地表物块带
    sky: statWin(0.60, 0.08, 0.25, 0.15),      // 右上=天空带
    mid: statWin(0.40, 0.42, 0.20, 0.20),      // 中心=玩家/球体带
  });

  const log = [];
  // ---- 基线 60 帧 ----
  step(60);
  const base = snap();
  log.push({ phase: 'baseline', ...base });

  // ---- 装备 3476 持续使用 240 帧（每 30 帧采样）----
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  if (!key3476) return { fail: 'item-key-3476-missing', log };
  const itemId = items[key3476];
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  // 鼠标指向玩家右侧
  const aimX = p.cx + 200, aimY = p.cy - 6;
  const scr = g.camera.worldToScreen ? g.camera.worldToScreen(aimX, aimY) : [0, 0];
  g.input.mouseX = scr[0] ?? 0; g.input.mouseY = scr[1] ?? 0;
  for (let f = 0; f < 240; f++) {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60); g.render();
    g.input.mouseDown = false;
    if (f % 30 === 29) {
      const projs = g.entities.projectiles.filter((q) => q.projId === 617 && !q.dead).length;
      log.push({ phase: `use f${f + 1}`, projs617: projs, ...snap() });
    }
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  // ---- 松手后 120 帧（球体仍悬停在场 600t——观察泄漏是否持续）----
  for (let f = 0; f < 120; f++) { g.fixedUpdate(1 / 60); g.render(); }
  log.push({ phase: 'released 120f', projs617: g.entities.projectiles.filter((q) => q.projId === 617 && !q.dead).length, ...snap() });
  return { W, H, log };
});

console.log(JSON.stringify(out, null, 1));
await browser.close();
