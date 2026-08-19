// 假设:首发吞掉整叠弹药 → 后续无弹。读 stack 前后 + entities 桶全貌。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/ammo-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.setDefaultTimeout(200000);
await page.goto((process.env.T || 'http://localhost:5201') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
const B = process.env.T || 'http://localhost:5201';
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const IBK = window.__swItems ?? {};
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: IBK['vi_1553_SDMG'], stack: 1 };
  g.player.inv.slots[53] = { id: IBK['vi_546_CursedBullet'], stack: 999 };
  g.player.inv.selected = 0;
  g.player.x = 383 * 16; g.player.y = 230 * 16;   // 湖面上空开阔处
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => {
  const g = window.__swGame;
  window.__spawnLog = [];
  const em = g.entities;
  const orig = em.add.bind(em);
  em.add = (e, bucket) => {
    const log = window.__spawnLog;
    if (bucket === 'projectiles' && log.length < 20) {
      log.push({ cls: e.constructor.name, x: Math.round(e.x), y: Math.round(e.y), pid: e.projId ?? null, vx: Math.round(e.vx ?? 0), dead: !!e.dead });
    }
    const r2 = orig(e, bucket);
    if (bucket === 'projectiles' && e.constructor.name === 'Arrow' && (e.projId ?? 0) === 104 && !window.__tracked) {
      window.__tracked = e;
      const ofu = e.fixedUpdate?.bind(e);
      if (ofu) e.fixedUpdate = function (...a) {
        const before = { x: Math.round(this.x), y: Math.round(this.y), dead: this.dead, life: this.life };
        const r3 = ofu.apply(this, a);
        if (!window.__fLog) window.__fLog = [];
        if (window.__fLog.length < 10) window.__fLog.push({ before, after: { x: Math.round(this.x), y: Math.round(this.y), dead: this.dead, life: this.life } });
        return r3;
      };
    }
    return r2;
  };
});
await page.mouse.move(640, 400);
await page.mouse.down();
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const r2 = g.renderer, ctx = r2.ctx, cv = r2.canvas;
  const cam = g.camera, z = cam.zoom;
  let checked = 0, rendered = 0, max = 0;
  const projIds = new Set();
  for (let k = 0; k < 60; k++) {
    await new Promise((r) => requestAnimationFrame(() => r()));
    g.player.x = 383 * 16; g.player.y = 230 * 16;
    const list = g.entities.projectiles;
    if (list.length > max) max = list.length;
    for (const q of list.slice(0, 8)) {
      projIds.add(q.projId ?? q.id ?? '?');
      if (k < 20 && !(window.__posDump)) window.__posDump = [];
      if (k < 20 && window.__posDump.length < 8) window.__posDump.push([Math.round(q.x ?? -9e9), Math.round(q.y ?? -9e9), Math.round(cam.x), Math.round(cam.y), q.w ?? -1, q.h ?? -1, q.dead]);
      const sx = Math.round(cv.width / 2 + (q.x - cam.x) * z);
      const sy = Math.round(cv.height / 2 + (q.y - cam.y) * z);
      if (sx < 8 || sy < 8 || sx > cv.width - 8 || sy > cv.height - 8) continue;
      checked++;
      const d = ctx.getImageData(sx - 8, sy - 8, 16, 16).data;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 200) { rendered++; break; }
      }
    }
  }
  const st = g.world.store;
  const around = [];
  for (let dy = -1; dy <= 2; dy++) {
    const row = [];
    for (let dx = -1; dx <= 3; dx++) row.push(st.isSolid(383 + dx, 254 + dy) ? 1 : 0);
    around.push(row.join(''));
  }
  return { tileMap: around, px: Math.round(g.player.x / 16), py: Math.round(g.player.y / 16), maxProjs: max, checked, renderedPct: checked ? Math.round(rendered / checked * 100) : -1,
    projIds: [...projIds].slice(0, 6), posDump: window.__posDump, spawnLog: window.__spawnLog?.slice(0, 10),
    fLog: window.__fLog, trackedDead: window.__tracked ? { dead: window.__tracked.dead, life: window.__tracked.life, x: Math.round(window.__tracked.x) } : null };
});
await page.mouse.up();
// 荧光棒:vi_282_glowstick 掷出→逐帧在其位置采像素
const glow = await page.evaluate(async () => {
  const IBK = window.__swItems ?? {};
  const g = window.__swGame;
  const gid = IBK['vi_282_glowstick'] ?? IBK['vi_282_Glowstick'];
  if (gid == null) return { err: 'glowstick 键缺失' };
  g.player.inv.slots[0] = { id: gid, stack: 99 };
  g.player.inv.selected = 0;
  return { gid: true };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
for (let t = 0; t < 5; t++) {
  await page.mouse.move(700, 300);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 150));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 300));
}
const glowVis = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  let checked = 0, rendered = 0, cls = '';
  for (let k = 0; k < 24; k++) {
    await new Promise((res) => requestAnimationFrame(() => res()));
    g.player.x = 383 * 16; g.player.y = 230 * 16;
    for (const q of g.entities.projectiles) {
      cls = q.constructor.name;
      const sx = Math.round(cv.width / 2 + (q.x - cam.x) * z);
      const sy = Math.round(cv.height / 2 + (q.y - cam.y) * z);
      if (sx < 8 || sy < 8 || sx > cv.width - 8 || sy > cv.height - 8) continue;
      checked++;
      const d = ctx.getImageData(sx - 8, sy - 8, 16, 16).data;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 200) { rendered++; break; }
      }
    }
  }
  return { cls, checked, renderedPct: checked ? Math.round(rendered / checked * 100) : -1 };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log(JSON.stringify({ bullet: out, glow: { ...glow, ...glowVis } }));
await browser.close();
