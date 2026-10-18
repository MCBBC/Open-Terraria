// 二分取证：?nosparkle / ?nocomposite 两种隔离下，星区暗十字是否消失。
// 判据 = 亮星外围同一圈环带采样的【暗像素比例】。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const MAP = needInput(join(DOWNLOADS, 'map-Starter_World (12).json'));
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 120)));

async function runMode(mode) {
  const q = mode === 'base' ? '?traildbg=1' : `?traildbg=1&${mode}=1`;
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5216') + '/' + q, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // 清 SW 供新模块
  await page.evaluate(async () => {
    try {
      await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      await Promise.all((await navigator.serviceWorker?.getRegistrations?.() ?? []).map((r) => r.unregister()));
    } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  const mapText = readFileSync(MAP, 'utf8');
  const boot = await page.evaluate(async (t) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    if (!window.__swLoadJson) return { fail: 'loader' };
    await window.__swLoadJson(t);
    for (let i = 0; i < 300 && !window.__swGame?.world; i++) await wait(200);
    return window.__swGame?.world ? { ok: true } : { fail: 'world' };
  }, mapText);
  if (!boot.ok) return { dark: -1, samples: 0, strips: -1 };
  await new Promise((r) => setTimeout(r, 1200));

  const res = await page.evaluate(async () => {
    const g = window.__swGame;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    g.player.x = 3185 * 16 + 8 - g.player.w / 2;
    g.player.y = Math.max(60 * 16, 381 * 16 - 420 * 16 / 4);   // 拉到高空纯天空（无山体剪影）
    // 清出落脚平台防坠落干扰
    {
      const st = g.world.store;
      const tx = Math.floor(g.player.x / 16), ty = Math.floor(g.player.y / 16) + 3;
      for (let x = tx - 12; x <= tx + 12; x++) for (let y = ty - 6; y < ty; y++) st.setTile(x, y, 0);
      for (let x = tx - 12; x <= tx + 12; x++) st.setTile(x, ty, st.type[st.idx(tx, 400)] ?? 1, 0, 0);
    }
    g.paused = false;
    const inp = g.input;
    inp.mouseX = Math.round((g.renderer.canvas?.width ?? 1280) / 2) - 60;
    inp.mouseY = Math.round((g.renderer.canvas?.height ?? 800) / 2);
    await wait(500);
    let spawned = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 3500) {
      g.fireZenithSword(0, { useTime: 10, fired: 0, vid: 4956, dmg: 190, crit: 4, pen: 2 });
      for (let k = 0; k < 9; k++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
      if (spawned++ > 26) break;
      await wait(110);
    }
    await wait(400);
    // 星区环带采样：以屏中心为星近似位，环带 r∈[140..220] 采样暗蓝像素
    const cv = [...document.querySelectorAll('#game-root canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const sc = document.createElement('canvas');
    const R = 240;
    sc.width = R * 2; sc.height = R * 2;
    const scc = sc.getContext('2d', { willReadFrequently: true });
    scc.drawImage(cv, cv.width / 2 - R, cv.height / 2 - R, R * 2, R * 2, 0, 0, R * 2, R * 2);
    const d = scc.getImageData(0, 0, R * 2, R * 2).data;
    let dark = 0, samples = 0;
    for (let y = 0; y < R * 2; y += 2) for (let x = 0; x < R * 2; x += 2) {
      const dx = x - R, dy = y - R;
      const rr = Math.hypot(dx, dy);
      if (rr < 130 || rr > 230) continue;             // 环带：避开星心与远区
      const i = (y * R * 2 + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      samples++;
      if (b < 120 && r < 80) dark++;                    // 暗十字（纯天空背景下无此色域）
    }
    return { dark, samples, strips: window.__stripCount?.n ?? 0 };
  });
  return res;
}

const base = await runMode('base');
const noSpark = await runMode('nosparkle');
const noComp = await runMode('nocomposite');
console.log(JSON.stringify({ base, noSpark, noComp }, null, 1));
await browser.close();
const darkBase = base.dark / Math.max(1, base.samples);
console.log(!noSpark ? 'skip' : (noSpark.dark < base.dark * 0.3 ? '✅ 暗十字来自星芒(prettyStarSparkle)' : (noComp.dark < base.dark * 0.3 ? '✅ 暗十字来自 GL 合成' : '❌ 两者都不是——需第三 suspects')));
