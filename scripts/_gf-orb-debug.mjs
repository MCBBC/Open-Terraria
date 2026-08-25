// 一次性:蓄力冰矛卡死诊断——orb 的 charge/released/dead 状态随时间 + channel() 读数
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)));
await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
await sleep(1000);
await p.evaluate(() => {
  const g = window.__swGame;
  const idx = window.__swItems['vi_6153_GlacierFang'];
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  g.player.inv.selected = 0;
  g.player.mana = 200; g.player.baseMaxMana = 200;
  const [sx, sy] = g.camera.worldToScreen(g.player.cx, g.player.cy);
  g.input.mouseX = sx + 60; g.input.mouseY = sy - 60;
  g.input.mouseDown = true; g.input.mouseHeld = true;
});
await sleep(600);
await p.evaluate(() => { const g = window.__swGame; g.input.mouseHeld = false; g.input.mouseDown = false; });
const s1 = await p.evaluate(() => {
  const g = window.__swGame;
  const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115);
  return orbs.map((o) => ({ charge: +o.charge?.toFixed?.(1) ?? o.charge, released: o.released, dead: o.dead, x: Math.round(o.x), y: Math.round(o.y), vx: +o.vx?.toFixed?.(2), vy: +o.vy?.toFixed?.(2) }));
});
console.log('松手后 0ms:', JSON.stringify(s1));
await sleep(1500);
const s2 = await p.evaluate(() => {
  const g = window.__swGame;
  const orbs = (g.entities?.all?.() ?? []).filter((e) => e && e.projId === 1115);
  return { n: orbs.length, states: orbs.map((o) => ({ released: o.released, dead: o.dead, vx: +o.vx?.toFixed?.(2), vy: +o.vy?.toFixed?.(2), x: Math.round(o.x), y: Math.round(o.y) })) };
});
console.log('松手后 1500ms:', JSON.stringify(s2));
await b.close();
