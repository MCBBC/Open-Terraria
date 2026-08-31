// C 段哑火定位探针:逐帧 dump 状态,找出持械不掷的原因
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (/THROW|ERR/.test(t)) console.log('[pg]', t); });
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
  const out = {};
  const log = [];
  // 直接连做两段:先模拟探针 A 段一次点击成功流,再进入 C 段完全复刻
  const stages = [];
  const snapshotStage = (name) => {
    const s = {
      name,
      selectedItem: g.player.inv.selected,
      heldKey: (window.__swGame.player.inv.slots[window.__swGame.player.inv.selected] ?? {}).key ?? null,
      useTime: g.player.useTime,
      nProj: g.entities.projectiles.length,
      mobHeld: !!g.input.mouseHeld,
    };
    return s;
  };
  for (const stageName of ['S_A_click', 'S_B_gate_end', 'S_C_setup', 'S_C_after_hold', 'S_D_setup']) {
    if (stageName === 'S_A_click') {
      const id = window.__swItems['vi_191_ThornChakram'];
      for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
      g.player.inv.add(id, 5);
      const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
      if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
      g.player.inv.selected = 0;
      g.player.useTime = 0; g.entities.projectiles.length = 0;
      g.player.x = px0 * 16 + 8 - g.player.w / 2; g.player.y = py * 16 - g.player.h;
      g.input.mouseX = 960; g.input.mouseY = 400;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      stages.push(snapshotStage(stageName));
    } else if (stageName === 'S_B_gate_end') {
      // 复刻 B:30t 后拦截点击、等待消亡、再点击重生
      for (let i = 0; i < 30; i++) g.fixedUpdate(1 / 60);
      g.input.mouseY = 200;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      g.fixedUpdate(1 / 60);
      let waited = 0; while (g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length && waited < 200) { g.fixedUpdate(1 / 60); waited++; }
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      stages.push({ ...snapshotStage(stageName), respAlive: g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length });
    } else if (stageName === 'S_C_setup') {
      const id = window.__swItems['vi_191_ThornChakram'];
      for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
      g.player.inv.add(id, 5);
      const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
      if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
      g.player.inv.selected = 0;
      g.entities.projectiles.length = 0;
      g.player.useTime = 0;
      stages.push(snapshotStage(stageName));
      // C:按住 160t,记录前 12 帧明细
      g.input.mouseX = 960; g.input.mouseY = 380;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      for (let i = 0; i < 160; i++) {
        if (i < 12) log.push({ i, useTime: g.player.useTime, nProj: g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length, mobDown: g.input.mouseDown });
        g.fixedUpdate(1 / 60);
        if (i >= 6 && g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length) break;
      }
      g.input.mouseDown = false; g.input.mouseHeld = false;
      stages.push({ ...snapshotStage('S_C_after_hold'), nChaks: g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead).length });
    } else {
      const key = stageName.endsWith('_D_setup') ? 'vi_284_WoodenBoomerang' : null;
      const id = window.__swItems[key];
      for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
      g.player.inv.add(id, 5);
      const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
      if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
      g.player.inv.selected = 0;
      g.entities.projectiles.length = 0;
      g.player.useTime = 0;
      g.player.x = px0 * 16 + 8 - g.player.w / 2; g.player.y = py * 16 - g.player.h;
      g.input.mouseX = 960; g.input.mouseY = 400;
      g.input.mouseDown = true; g.input.mouseHeld = true;
      for (let i = 0; i < 3; i++) g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      stages.push({ ...snapshotStage(stageName), nWood: g.entities.projectiles.filter((p) => p.projId === 52 && !p.dead).length });
    }
  }
  out.stages = stages;
  out.cTrace = log;
  out.keysInSwItems = Object.keys(window.__swItems ?? {}).filter((k) => /284|boomerang|chakram/i.test(k));
  return out;
});
console.log(JSON.stringify(res, null, 1));
if (errors.length) console.log('[pageerrors]', errors.slice(0, 4));
await browser.close();
