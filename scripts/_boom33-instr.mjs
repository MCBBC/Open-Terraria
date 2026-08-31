// 使用链插桩:hook player.useTime setter + entities.add,重放 S_C 持握,观察是否/何时有使用尝试
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (/DBG/.test(t)) console.log('[pg]', t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

const res = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy;
  for (let dx = -40; dx <= 40; dx++) { for (let dy = -14; dy <= -1; dy++) st.setTile(px0 + dx, py + dy, 0); st.setTile(px0 + dx, py, 2); }
  // ---- hook ----
  const pt = g.player;
  let ut = pt.useTime;
  Object.defineProperty(pt, 'useTime', {
    get() { return ut; },
    set(v) { if (v > 0) console.log(`DBG useTime<- ${v}`); ut = v; },
    configurable: true,
  });
  const addOrig = g.entities.add.bind(g.entities);
  g.entities.add = (e, b) => { try { console.log(`DBG add b=${b} ctor=${e?.constructor?.name} projId=${e?.projId}`); } catch (_){} return addOrig(e, b); };
  // ---- 复刻 S_A(单点击,应掷) → 消亡等待 → S_C(持握) ----
  const out = {};
  const equipChak = () => {
    const id = window.__swItems['vi_191_ThornChakram'];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.entities.projectiles.length = 0;
    g.player.useTime = 0;
  };
  equipChak();
  g.player.x = px0 * 16 + 8 - g.player.w / 2; g.player.y = py * 16 - g.player.h;
  console.log('DBG --single click--');
  g.input.mouseX = 960; g.input.mouseY = 400;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  let w = 0; while (g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length && w < 200) { g.fixedUpdate(1 / 60); w++; }
  out.retTicks = w;
  // ---- S_C: hold ----
  equipChak();
  g.player.x = px0 * 16 + 8 - g.player.w / 2; g.player.y = py * 16 - g.player.h;
  console.log('DBG --hold start--');
  g.input.mouseX = 960; g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  const samples = [];
  for (let i = 0; i < 100; i++) {
    samples.push({ i, useTime: g.player.useTime, uiBlocking: !!g.input.uiBlocking,
      swingT: g.swing ? g.swing.t : -1, itemAnim: g.player.itemAnimTicks ?? -1,
      recall: !!g.recallChannel, nProj: g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length,
      inWater: !!g.player.inWater, deadPlayer: !!g.player.dead });
    g.fixedUpdate(1 / 60);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.samples = samples.slice(0, 6).concat(samples.slice(-3));
  out.holdSpawns = samples[samples.length - 1].nProj;
  // 重放裸点击 sanity
  equipChak();
  console.log('DBG --post bare click--');
  g.input.mouseY = 380;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.fixedUpdate(1 / 60);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  out.bareClickSpawned = g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length;
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
