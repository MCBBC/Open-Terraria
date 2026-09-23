// BJ313 探针2:永夜刃 273 真实游戏循环观测(rAF 驱动,验证 draw 层)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
let crashed = null;
page.on('pageerror', (e) => { crashed = crashed ?? e.message; console.error('PAGEERROR:', e.message.slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const arcMod = await import('/src/entities/SwingArc.ts');
  const { projSprite } = await import('/src/entities/Arrow.ts');
  window.__projSpriteMod = { projSprite };
  const res = {};
  const idx273 = items.ITEM_DEFS.findIndex((d) => d && d.vid === 273);
  // ---- 场地 ----
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  for (let dy = -14; dy <= 1; dy++) for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + dy, 0);
  for (let dx = -24; dx <= 24; dx++) st.setTile(px + dx, gy + 1, 2);
  g.player.x = px * 16; g.player.y = (gy - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp;
  // ---- 观测钩 ----
  const dustCounts = {};
  const origSpawnDust = g.spawnDust.bind(g);
  g.spawnDust = function (x, y, w, h, type, ...rest) {
    dustCounts[type] = (dustCounts[type] ?? 0) + 1;
    return origSpawnDust(x, y, w, h, type, ...rest);
  };
  let drawCalls = 0, drawImgNull = 0;
  const drawSamples = [];
  const origDraw = arcMod.SwingArc.prototype.draw;
  arcMod.SwingArc.prototype.draw = function (r) {
    drawCalls++;
    const img = window.__projSpriteMod.projSprite(this.projId);
    if (!img || !(img.width > 0)) drawImgNull++;
    if (drawSamples.length < 4) drawSamples.push({ projId: this.projId, num: +this.num.toFixed(3), op: +this.op.toFixed(3), imgOk: !!(img && img.width > 0), imgW: img?.width ?? 0, cx: Math.round(this.cx), cy: Math.round(this.cy) });
    return origDraw.call(this, r);
  };
  let flyDraw = 0;
  const origFlyDraw = arcMod.NightsEdgeFly.prototype.draw;
  arcMod.NightsEdgeFly.prototype.draw = function (r) { flyDraw++; return origFlyDraw.call(this, r); };
  // ---- 持住鼠标 1.6s 真实时长(autoReuse 连挥),游戏自身循环驱动 ----
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx273, stack: 1 };
  g.input.mouseX = g.renderer.canvas.width / 2 + 200;
  g.input.mouseY = g.renderer.canvas.height / 2;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await new Promise((r) => setTimeout(r, 1600));
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await new Promise((r) => setTimeout(r, 200));
  // 光照取样(弧已散,取玩家位置光照管线样本)
  const lightProbe = (typeof g.lightAt === 'function') ? g.lightAt(px * 16, (gy - 2) * 16) : (typeof g.sampleLight === 'function' ? g.sampleLight(px * 16, (gy - 2) * 16) : 'no-light-api');
  res.obs = { drawCalls, drawImgNull, drawSamples, flyDraw, dustCounts, lightProbe };
  res.noCrash = true;
  return res;
});
console.log(JSON.stringify({ ...out, pageCrashed: crashed }, null, 1));
await browser.close();
