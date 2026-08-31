// 荆棘旋刃(item 191 → proj 33)贴地发射失败复现探针。
// 复查三症状:①平地站立发射弹体秒消失(跳起才可飞出)②连点多发在场③按住应回手后再掷。
// 记录逐 tick {x,y,vx,vy,ai0} + 出生时与玩家盒几何关系,佐证"出生=盒左上压玩家中心,底缘陷入地面"假设。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

console.log('chakram item keys:', await page.evaluate(() => Object.keys(window.__swItems ?? {}).filter((k) => /thorn|chakram/i.test(k))));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  let gy = 0; while (gy < st.h - 10 && !st.isSolid(px0, gy)) gy++;
  const py = gy;
  // 平整平台:±40 宽 × 上方 -1..-14 清空,py 行铺实心
  for (let dx = -40; dx <= 40; dx++) {
    for (let dy = -14; dy <= -1; dy++) st.setTile(px0 + dx, py + dy, 0);
    st.setTile(px0 + dx, py, 2);
    for (let dy = -1; dy >= -14; dy--) st.setTile(px0 + dx, py + dy, 0);
  }
  const standFlush = () => {
    g.player.x = px0 * 16 + 8 - g.player.w / 2;
    g.player.y = py * 16 - g.player.h;
    if ('vx' in g.player) g.player.vx = 0;
    if ('vy' in g.player) g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  };
  const equip = () => {
    const key = Object.keys(window.__swItems).find((k) => /thorn.*chakram/i.test(k));
    const id = window.__swItems[key];
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.add(id, 5);
    const bi = g.player.inv.slots.findIndex((it) => it && it.id === id);
    if (bi > 0) { const t = g.player.inv.slots[0]; g.player.inv.slots[0] = g.player.inv.slots[bi]; g.player.inv.slots[bi] = t; }
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.entities.projectiles.length = 0;
    return key;
  };
  // 触发一次点击发射(mouseDown 单帧电平)
  const click = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };
  const chaks = () => g.entities.projectiles.filter((p) => p.projId === 33 && !p.dead);

  const runAngle = (label, sx, sy) => {
    equip(); standFlush();
    g.input.mouseX = 640 + sx; g.input.mouseY = 400 + sy;
    click();
    const p0 = g.entities.projectiles.find((p) => p.projId === 33 && !p.dead);
    const geo = p0 ? {
      bornDeltaLeftTop: [+(p0.x - g.player.cx).toFixed(2), +(p0.y - g.player.cy).toFixed(2)],
      playerBox: [g.player.x, g.player.y, g.player.w, g.player.h],
      feetLineY: +(g.player.y + g.player.h).toFixed(2),
      bomBottom: +(p0.y + p0.h).toFixed(2),
    } : null;
    const trace = [];
    let deadAt = -1;
    for (let i = 0; i < 45; i++) {
      for (const p of chaks()) trace.push({ t: i, x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), ai0: p.ai0 });
      g.fixedUpdate(1 / 60);
      const alive = chaks();
      if (!alive.length) { if (trace.length && deadAt < 0) deadAt = i; break; }
    }
    return { label, spawned: !!p0, geo, deadAt, nChaks: chaks().length, trace: trace.slice(0, 24) };
  };

  const res = {};
  res.standingFlat = {
    horizRight: runAngle('horizRight', 300, 0),
    diagUpRight: runAngle('diagUpRight', 200, -200),
    straightUp: runAngle('straightUp', 0, -350),
    diagDownRight: runAngle('diagDownRight', 200, 200),
    straightDown: runAngle('straightDown', 0, 300),
  };
  // 空中对照(抬高 8 格)
  for (const k of ['horizRight', 'straightUp']) {
    const r = (() => {
      equip();
      g.player.x = px0 * 16 + 8 - g.player.w / 2;
      g.player.y = (py - 8) * 16 - g.player.h;
      g.input.mouseX = 640 + (k === 'horizRight' ? 300 : 0); g.input.mouseY = 400 + (k === 'horizRight' ? 0 : -350);
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false; g.input.mouseHeld = false;
      const p0 = g.entities.projectiles.find((p) => p.projId === 33 && !p.dead);
      const trace = [];
      for (let i = 0; i < 30 && p0; i++) {
        trace.push({ t: i, x: +p0.x.toFixed(1), y: +p0.y.toFixed(1), vx: +p0.vx.toFixed(2), vy: +p0.vy.toFixed(2), ai0: p0.ai0 });
        g.fixedUpdate(1 / 60);
        if (p0.dead || !chaks().includes(p0)) break;
      }
      return { label: k + '@air', spawned: !!p0, trace: trace.slice(0, 10) };
    })();
    res[k + '_air'] = r;
  }
  // 多发现象:两次发射间隔 12t(第一发仍在场)
  {
    equip(); standFlush();
    g.input.mouseX = 940; g.input.mouseY = 400;
    click();
    const first = chaks().length;
    for (let i = 0; i < 12; i++) g.fixedUpdate(1 / 60);
    click();
    res.multiClickTwoShots = { firstAliveCount: first, totalAfterSecond: chaks().length };
  }
  return res;
});

console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('[pageerrors]', errors.slice(0, 3));
await browser.close();
