// 调试：冲刺配饰授予与双击冲刺触发链路
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&swperf=0&dbg1=' + Date.now();
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1200));

const r = await page.evaluate(() => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const GY = 300;
  for (let x = 120; x <= 680; x++) for (let y = GY - 100; y <= GY + 40; y++) { st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false); }
  for (let x = 130; x <= 670; x++) st.setTile(x, GY, 1);
  p.x = 200 * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = true; p.dead = false;
  p.dashDelay = 0; p.dashT = 0; p.ridingCart = false; p.ridingMount = false; p.pulley = false;
  p.sleeping = false; p.sitting = false;
  g.input.keys.clear(); g.input.uiBlocking = false;

  // 找盾（克苏鲁护盾 = 原版 vid 3097,accfx "3097":{"dashType":2}）
  const defs = window.__swITEMS;
  const hits = [];
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d && d.vid === 3097) hits.push({ id: i, key: d.key, vid: d.vid, name: d.name });
  }
  if (!hits.length) return { err: 'no vid 3097 def', sampleVids: [defs[0]?.vid, defs[100]?.vid] };
  p.inv.armor[3] = { id: hits[0].id, stack: 1 };
  // 跑 2 tick（无输入）让 equipStats 聚合
  p.inputX = 0; p.inputLeft = p.inputRight = false; p.inputJump = false; p.inputDown = false; p.inputUp = false;
  p.fixedUpdate(1, g); p.fixedUpdate(1, g);
  const eq = p.equipStats;
  const armorInfo = p.inv.armor[3];
  return {
    hits, armorSlot: armorInfo,
    dash: eq?.dash, accRunSpeed: eq?.accRunSpeed,
    dashDelay: p.dashDelay,
    // 也看 effArmor 通道
    hasEffArmor: typeof p.effArmor,
  };
});
console.log(JSON.stringify(r, null, 1));
console.log('errors', JSON.stringify(errors.slice(0, 3)));
await browser.close();
process.exit(0);
