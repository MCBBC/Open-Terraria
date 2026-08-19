// 荧光棒投掷 + 短剑 938 弹专项:实体构成/落点/像素。裸页+开阔位。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/ts-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (/^(IDS|HITS|POISONED)/.test(t)) console.log(t.slice(0, 180)); });
page.setDefaultTimeout(200000);
const B = process.env.T || 'http://localhost:5201';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 230 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  // 投毒:向当前 sw-assets-v* 缓存写入垃圾条目(模拟截断/坏 warm)
  const POISON = ['sprites/vanilla/Projectile_50.png', 'sprites/vanilla/Projectile_938.png', 'sprites/vanilla/Item_Atlas_0.png'];
  const names = (await caches.keys()).filter((n) => n.startsWith('sw-assets-v'));
  for (const n of names) {
    const cache = await caches.open(n);
    for (const f of POISON) {
      await cache.put('/' + f, new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'Content-Type': 'image/png' } }));
    }
  }
  window.__poisoned = { names, POISON };
});
await page.reload({ waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 230 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  let glow = null, sword = null;
  try {
    const m = await import('/src/data/items.ts');
    for (const [k, v] of Object.entries(m.ITEM_BY_KEY)) {
      if (/glowstick/i.test(k) && glow == null) glow = v;
      if (/CopperShortsword$/.test(k) && sword == null) sword = v;
    }
  } catch { /* dist 无源码 */ }
  if (glow == null || sword == null) {
    for (const [k, v] of Object.entries(window.__swItems ?? {})) {
      if (/glowstick/i.test(k) && glow == null) glow = v;
      if (/CopperShortsword$/.test(k) && sword == null) sword = v;
    }
  }
  window.__ids = { glow, sword };
  console.log('IDS', JSON.stringify(window.__ids));
  console.log('POISONED', JSON.stringify(window.__poisoned ?? null));
});
await new Promise((r) => setTimeout(r, 1200));
// ── 荧光棒:连点 3 次 ──
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: window.__ids.glow, stack: 99 };
  g.player.inv.selected = 0;
});
for (let i = 0; i < 3; i++) {
  await page.mouse.move(760, 300);
  await page.mouse.down(); await new Promise((r) => setTimeout(r, 180)); await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400));
}
const glowOut = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  let checked = 0, rendered = 0, lastPos = null;
  for (let k = 0; k < 30; k++) {
    await new Promise((res) => requestAnimationFrame(() => res()));
    for (const q of g.entities.projectiles) {
      if (q.constructor.name !== 'GlowstickProj') continue;
      lastPos = [Math.round(q.x), Math.round(q.y)];
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
  return { glowChecked: checked, glowRenderedPct: checked ? Math.round(rendered / checked * 100) : -1, lastPos,
    stack0: g.player.inv.slots[0]?.stack };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
console.log('[荧光棒]', JSON.stringify(glowOut));
// ── 短剑:点 1 次,看 938 弹 ──
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: window.__ids.sword, stack: 1 };
  g.player.inv.selected = 0;
});
await new Promise((r) => setTimeout(r, 300));
await page.mouse.move(760, 300);
await page.mouse.down();
const swordOut = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  let sawSwing = 0, saw938 = 0, projChecked = 0, projRendered = 0;
  window.addEventListener('mousedown', () => {}, { once: true });
  for (let k = 0; k < 40; k++) {
    await new Promise((res) => requestAnimationFrame(() => res()));
    if (g.swing) sawSwing++;
    for (const q of g.entities.projectiles) {
      if ((q.projId ?? 0) !== 938) continue;
      saw938++;
      const sx = Math.round(cv.width / 2 + (q.x - cam.x) * z);
      const sy = Math.round(cv.height / 2 + (q.y - cam.y) * z);
      if (sx < 8 || sy < 8 || sx > cv.width - 8 || sy > cv.height - 8) continue;
      projChecked++;
      const d = ctx.getImageData(sx - 8, sy - 8, 16, 16).data;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 200) { projRendered++; break; }
      }
    }
  }
  return { sawSwingFrames: sawSwing, saw938Frames: saw938, proj938RenderedPct: projChecked ? Math.round(projRendered / projChecked * 100) : -1 };
}).catch((e) => ({ err: String(e).slice(0, 200) }));
await page.mouse.up();
console.log('[短剑]', JSON.stringify(swordOut));
await browser.close();
