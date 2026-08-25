// 地底跳不上的定点诊断：骑 DCU 入地下封闭室，按 Space 逐 tick dump 输入/门状态
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[dbg]')) console.log(t); });
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));

await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const key = Object.keys(items).find(k => /^vi_2768_/.test(k));
  inv.add(items[key], 1);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[key]) { inv.selected = i; break; }
  // 开放平台落地
  for (let i = 0; i < 90 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
  const fx = Math.floor(p.cx / 16), fy = Math.floor((p.y + p.h) / 16);
  for (let dx = -8; dx <= 8; dx++) { st.setTile(fx + dx, fy, 1, 0, 0); for (let dy = 1; dy <= 6; dy++) st.setTile(fx + dx, fy - dy, 0); }
  await sleep(300);
  // 上坐
  g.input.mouseDown = true; await sleep(300); g.input.mouseDown = false; await sleep(200);
  console.log(`[dbg] mounted=${p.ridingMount} type=${p.mount.type}`);
  // 地表按跳对照
  g.input.keys.add('Space');
  const surf = [];
  for (let i = 0; i < 8; i++) { await sleep(50); surf.push(`fs=${p.mount.frameState},vy=${p.vy.toFixed(2)},jump=${p.inputJump},og=${p.onGround}`); }
  g.input.keys.delete('Space');
  await sleep(400);
  console.log('[dbg] SURFACE ' + surf.slice(0, 4).join(' | '));
  // 地下室
  const uy = Math.floor(g.world.groundLevel) + 40;
  const ux = fx;
  for (let dx = -6; dx <= 6; dx++) for (let dy = -4; dy <= 4; dy++) st.setTile(ux + dx, uy + dy, 0);
  for (let dx = -7; dx <= 7; dx++) { st.setTile(ux + dx, uy + 5, 1, 0, 0); st.setTile(ux + dx, uy - 5, 1, 0, 0); }
  for (let dy = -4; dy <= 4; dy++) { st.setTile(ux - 7, uy + dy, 1, 0, 0); st.setTile(ux + 7, uy + dy, 1, 0, 0); }
  p.x = ux * 16; p.y = uy * 16; p.vx = 0; p.vy = 0; p.fallStartY = null;
  await sleep(700);
  console.log(`[dbg] UNDER y=${p.y.toFixed(0)} onGround=${p.onGround} vy=${p.vy} fs=${p.mount.frameState} flyTime=${p.mount.flyTime} usesHover=${p.mount.data.usesHover} canHover=${p.mount.canHover(p)} autoJump=${p.mount.autoJump} jumpEdgePrev=${p.jumpEdgePrev} inputJump=${p.inputJump} uiBlocking=${g.input.uiBlocking} keysHasSpace=${g.input.keys.has('Space')}`);
  g.input.keys.add('Space');
  const und = [];
  for (let i = 0; i < 10; i++) {
    await sleep(50);
    und.push(`fs=${p.mount.frameState},vy=${p.vy.toFixed(2)},y=${p.y.toFixed(0)},jump=${p.inputJump},og=${p.onGround},edgePrev=${p.jumpEdgePrev},grace=${p.mount.walkingGraceTime}`);
  }
  g.input.keys.delete('Space');
  for (const s of und.slice(0, 6)) console.log('[dbg] UNDER-T ' + s);
  // W 键（inputUp）对照
  g.input.keys.add('KeyW');
  const wtest = [];
  for (let i = 0; i < 6; i++) { await sleep(50); wtest.push(`vy=${p.vy.toFixed(2)},up=${p.inputUp},jump=${p.inputJump}`); }
  g.input.keys.delete('KeyW');
  console.log('[dbg] UNDER-W ' + wtest.slice(0, 3).join(' | '));
});
await browser.close();
