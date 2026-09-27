// ★BJ368 强制模式实验——逐模式跑 404 飞行+像素扫描:
//  A: B1 bridge(b2b=off)  B: acc+逐帧 fillText 毒化(强制降级)  C: 基线 acc
//  判据:球飞行盒内 白/亮块/teal 计数 + 落图
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-angle=metal'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
  const O = { modes: {} };
  const { options } = await import('/src/core/Options.ts');
  const { Renderer } = await import('/src/render/Renderer.ts');
  if ((g.renderer.usingCpu ?? false) || options.data.renderMode === 'cpu') {
    options.set('renderMode', 'gpu');
    await new Promise((r) => setTimeout(r, 500));
  }
  await g.newWorld('bj368fm', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.0;   // 夜
  const c0 = Math.trunc(p.x / 16);
  let groundY = -1;
  for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c0, y)) { groundY = y; break; } }
  if (groundY > 0) { p.x = c0 * 16; p.y = groundY * 16 - p.h; }
  p.vx = 0; p.vy = 0;
  for (const n of (g.entities.npcs ?? [])) { if (n && n.hostile) { n.dead = true; n.life = 0; } }
  const key2611 = Object.keys(items).find((k) => k.includes('2611'));
  if (!key2611) return { fail: 'item-key-2611-missing' };
  p.inv.slots[0] = { id: items[key2611], stack: 1 };
  p.inv.selected = 0;
  await new Promise((r) => setTimeout(r, 400));

  const canvas = g.renderer.canvas;
  const scale = canvas.width / canvas.getBoundingClientRect().width;
  const shotCv = document.createElement('canvas');
  shotCv.width = canvas.width; shotCv.height = canvas.height;
  const sctx = shotCv.getContext('2d', { willReadFrequently: true });

  const scanBox = (cx, cy, half = 110) => {
    const [sx, sy] = g.camera.worldToScreen(cx, cy);
    const bx = Math.max(0, Math.round(sx * scale) - half), by = Math.max(0, Math.round(sy * scale) - half);
    sctx.drawImage(canvas, 0, 0);
    const d = sctx.getImageData(bx, by, half * 2, half * 2).data;
    let white = 0, pale = 0, teal = 0, bright = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (r >= 240 && gg >= 240 && b >= 240) white++;
      if (r >= 190 && gg >= 190 && b >= 190) pale++;
      if (Math.max(r, gg, b) > 120) bright++;
      if (Math.abs(r - 48) < 90 && Math.abs(gg - 248) < 90 && Math.abs(b - 171) < 90) teal++;
    }
    return { white, pale, bright, teal, bx, by };
  };
  const shot = (tag) => {
    sctx.drawImage(canvas, 0, 0);
    return { tag, dataURL: shotCv.toDataURL('image/png') };
  };

  const aim = (wx, wy) => {
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  };

  // 毒化钩:每帧渲染期对 shim 发 fillText(acc 长尾→强制降级)
  let poisonOn = false;
  let poisonErase = false;
  let poisonFired = false;   // 每帧只发一次(runFlight 循环头复位)
  const armPoison = () => {
    const live = g.renderer.bglEntShim;
    if (!live || !live.bound || live.bound.__bj368poison) return;
    const origDraw = live.bound.drawImage;
    live.bound.drawImage = function (img, ...rest) {
      if (poisonOn && !poisonFired) {
        poisonFired = true;
        try {
          if (poisonErase) {
            this.globalCompositeOperation = 'destination-out';
            this.drawImage(img, 0, 0, 4, 4);
            this.globalCompositeOperation = 'source-over';
          } else {
            this.fillText('P', 10, 10);   // acc 长尾 → ensureBridged 降级
          }
        } catch { /* ignore */ }
      }
      return origDraw.call(this, img, ...rest);
    };
    live.bound.__bj368poison = true;
  };

  const runFlight = async (tag, nFrames = 220) => {
    const samples = [];
    const shots = [];
    for (const q of g.entities.projectiles) q.dead = true;
    g.fixedUpdate(1 / 60);
    let head = null;
    g.input.mouseHeld = true;
    const t0 = performance.now();
    let frame = 0;
    while (frame < nFrames && performance.now() - t0 < nFrames * 20) {
      await new Promise((r) => requestAnimationFrame(r));
      frame++;
      poisonFired = false;
      const cyc = frame % 45;
      if (cyc === 1) { aim(p.cx + (Math.random() * 380 - 190), p.cy - 50 - Math.random() * 150); g.input.mouseDown = true; }
      if (cyc === 30) g.input.mouseDown = false;
      if (frame % 3 === 0) {
        head = g.entities.projectiles.find((q) => q.projId === 404 && !q.dead);
        if (!head) continue;
        const s = scanBox(head.cx, head.cy);
        s.dead = false;
        samples.push({ ...s, path: g.renderer.bglPathUsed });
        if (samples.length === 20) shots.push(shot(tag + '-f' + frame));
        if (samples.length === 60) shots.push(shot(tag + '-f' + frame));
      }
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
    const agg = {
      n: samples.length,
      maxWhite: Math.max(...samples.map((s) => s.white)),
      maxPale: Math.max(...samples.map((s) => s.pale)),
      maxBright: Math.max(...samples.map((s) => s.bright)),
      maxTeal: Math.max(...samples.map((s) => s.teal)),
      paths: [...new Set(samples.map((s) => s.path))],
    };
    O.modes[tag] = { agg, _shots: shots };
  };

  armPoison();

  // C 基线 acc
  await runFlight('C_acc_base', 120);
  // A B1 bridge(b2b 关)
  Renderer.b2bSetForTest(false);
  await new Promise((r) => setTimeout(r, 300));
  await runFlight('A_b1_bridge', 120);
  Renderer.b2bSetForTest(true);
  await new Promise((r) => setTimeout(r, 300));
  // B acc+毒化降级
  poisonOn = true;
  await runFlight('B_acc_degrade', 150);
  // D acc+destination-out 毒化
  poisonErase = true;
  await runFlight('D_acc_erase', 120);
  poisonOn = false; poisonErase = false;

  O.pathStats = { ...g.renderer.bglPathStats };
  const slim = {};
  for (const [k, v] of Object.entries(O.modes)) slim[k] = v.agg;
  slim.pathStats = O.pathStats;
  slim._shots = {};
  for (const [k, v] of Object.entries(O.modes)) if (v._shots?.length) slim._shots[k] = v._shots;
  return slim;
});

if (out && out._shots) {
  const fs = await import('node:fs');
  for (const [mode, shots] of Object.entries(out._shots)) {
    for (const s of shots) fs.writeFileSync(`/tmp/bj368-fm-${s.tag}.png`, Buffer.from(s.dataURL.split(',')[1], 'base64'));
  }
}
const { _shots, ...slim2 } = out ?? {};
console.log('BJ368_FM=' + JSON.stringify(slim2, null, 1));
if (pageErrors.length) console.log('PAGE_ERRORS=' + JSON.stringify(pageErrors.slice(0, 8)));
await browser.close();
