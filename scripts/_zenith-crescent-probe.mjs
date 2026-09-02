// 天顶剑拖尾"月牙形态"量测探针（2026-09-02 细螺旋→宽月牙修复验证）：
// 单发 4956 天顶剑 → 逐 tick 手动步进 → counter≈82（轨道走完+环大半为弧）冻结帧
// → 主画布读回 → 节点侧与原版 GIF 同法量测：弧厚(radial p2-p98)/弧覆盖(角度bin)/
// 亮度剖面/暗带检查。原版参照（f170 暗砖底）：亮带 45-55px、4 次波纹、零暗带。
import { readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = '/Users/vinlic/Downloads/map-Starter_World (12).json';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/?traildbg=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
// SW cache-first 清扫（编辑后的模块/贴图必须换新）
{
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 8000 }); break; }
  catch { if (i === 9) throw new Error('sp failed'); }
}
const mapText = readFileSync(MAP, 'utf8');
const boot = await page.evaluate(async (t) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!window.__swLoadJson) return { fail: 'loader' };
  await window.__swLoadJson(t);
  for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
  return window.__swGame?.world ? { ok: true } : { fail: 'world' };
}, mapText);
if (!boot.ok) { console.log(JSON.stringify(boot)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// 发剑 + 步进 + 冻结帧读回
const shot = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.player.x = 3185 * 16 + 8 - g.player.w / 2;
  g.player.y = 381 * 16 + 8;
  g.player.vx = 0; g.player.vy = 0;
  await wait(700);
  g.paused = false;   // RAF 循环出帧（paused=true 会整循环停摆——探针实测 renders=2）
  const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const W = cv.width, H = cv.height;
  const r = g.renderer;
  // 渲染活性哨兵
  if (!r.__swRw) { const o = r.render.bind(r); window.__rc = { n: 0 }; r.render = (...a) => { window.__rc.n++; return o(...a); }; r.__swRw = true; }
  // 鼠标 = 玩家屏幕位 + (330,−60)（发射向右，|vel|≈165 → 轨道半径≈165..205）
  const pscr = { x: g.player.cx - r.glCamX + W / 2, y: g.player.cy - r.glCamY + H / 2 };
  const inp = g.input;
  inp.mouseX = Math.round(pscr.x + 330); inp.mouseY = Math.round(pscr.y - 60);
  g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, crit: 4, pen: 2 });
  const findSword = () => (g.entities?.projectiles ?? []).find((e) => e.ai1 === 4956 && e.counter !== undefined);
  let sw = findSword();
  if (!sw) return { fail: 'no-sword', projs: (g.entities?.projectiles ?? []).length };
  // 轮询到 counter≈82（轨道完成+冻结堆积尚少）即读回
  while (sw.counter < 82 && !sw.dead) await wait(8);
  const counter = +sw.counter.toFixed(1);
  // 读回玩家邻域（±460×±380 夹到画布）
  const rx = Math.max(0, Math.min(W, Math.round(pscr.x - 460)));
  const ry = Math.max(0, Math.min(H, Math.round(pscr.y - 380)));
  const rw = Math.min(920, W - rx), rh = Math.min(760, H - ry);
  const sc = document.createElement('canvas');
  sc.width = rw; sc.height = rh;
  const scc = sc.getContext('2d', { willReadFrequently: true });
  scc.drawImage(cv, rx, ry, rw, rh, 0, 0, rw, rh);
  const d = scc.getImageData(0, 0, rw, rh).data;
  let bin = '';
  const u8 = new Uint8Array(d.buffer.slice(0));
  // base64 分块避免 call stack 爆
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) bin += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  const b64 = btoa(bin);
  return {
    ok: true, counter, frames, renders: window.__rc.n,
    rw, rh, rx, ry, canvasW: W, canvasH: H,
    anchor: { px: g.player.cx, py: g.player.cy, pvx: sw.vx, pvy: sw.vy },
    sword: { cx: sw.cx, cy: sw.cy, rot: sw.rot, opacity: sw.opacity },
    cam: { x: r.glCamX, y: r.glCamY },
    pscr, b64,
  };
});
if (!shot.ok) { console.log(JSON.stringify(shot)); await browser.close(); process.exit(1); }
writeFileSync('/tmp/zc-frame.png', Buffer.from(shot.b64, 'base64'));
try { await page.screenshot({ path: '/tmp/zc-viewport.png' }); } catch {}
console.log(JSON.stringify({ counter: shot.counter, frames: shot.frames, renders: shot.renders, rw: shot.rw, rh: shot.rh, canvas: [shot.canvasW, shot.canvasH], sword: shot.sword, anchor: shot.anchor, cam: shot.cam, pscr: shot.pscr }, null, 1));
await browser.close();
