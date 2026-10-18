// remaster 坏包实证探针:runtime.apply 注入全透明 Projectile_50 → 荧光棒是否隐形。
// 用户症状:武器/弹幕/投掷物全隐形(dev+PROD 都坏,fresh 浏览器全绿)→ 唯一
// dev/PROD 通用且精准命中弹幕+物品图集的机制 = remaster 包启动注入(IndexedDB)。
// 本探针不动 IndexedDB(直调 runtime.apply),单会话内验证机制。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/rm-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.on('console', (m) => { const t = m.text(); if (/^(CTRL|BLANK|APPLIED|IDS)/.test(t)) console.log(t.slice(0, 200)); });
page.setDefaultTimeout(200000);
const B = process.env.T || 'http://localhost:4173';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow && !!window.__swRemaster, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, B);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

// 场景固定:开阔位+白天+荧光棒入手
await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.x = 383 * 16; g.player.y = 230 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
  let glow = null;
  for (const [k, v] of Object.entries(window.__swItems ?? {})) if (/glowstick/i.test(k)) { glow = v; break; }
  if (glow == null) glow = 4;   // 内部 id(vi_282_glowstick,此前探针实证)
  window.__ids = { glow };
  g.player.inv.slots[0] = { id: glow, stack: 99 };
  g.player.inv.selected = 0;
  console.log('IDS', JSON.stringify(window.__ids));
});

/** 掷一次荧光棒并采样投掷物区域不透明像素 */
async function throwAndSample(tag) {
  await page.evaluate(() => { window.__swGame.entities.projectiles.length = 0; });
  await page.mouse.move(760, 300);
  await page.mouse.down(); await new Promise((r) => setTimeout(r, 180)); await page.mouse.up();
  await new Promise((r) => setTimeout(r, 250));
  return await page.evaluate(async (tag) => {
    const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
    const cam = g.camera, z = cam.zoom;
    let best = null;
    for (let k = 0; k < 20 && !best; k++) {
      await new Promise((res) => requestAnimationFrame(() => res()));
      for (const q of g.entities.projectiles) {
        if (q.dead) continue;
        const s = Math.max(10, (q.w ?? 8) * z), sx = (q.cx - cam.x) * z, sy = (q.cy - cam.y) * z;
        best = { sx: Math.round(sx), sy: Math.round(sy), s: Math.round(s * 2), cls: q.constructor.name };
        break;
      }
    }
    if (!best) { console.log(tag, 'NO_PROJ'); return { tag, proj: null }; }
    const pad = 8, x0 = Math.max(0, best.sx - pad), y0 = Math.max(0, best.sy - pad);
    const w = Math.min(best.s + pad * 2, cv.width - x0), h = Math.min(best.s + pad * 2, cv.height - y0);
    if (w <= 0 || h <= 0) { console.log(tag, 'OFFSCREEN'); return { tag, proj: best, opaque: -1 }; }
    const d = ctx.getImageData(x0, y0, w, h).data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 16) opaque++;
    const out = { tag, proj: best, opaque };
    console.log(tag, JSON.stringify(out));
    return out;
  }, tag);
}

// ── 对照:原版贴图 ──
const ctrl = await throwAndSample('CTRL');
await new Promise((r) => setTimeout(r, 600));

// ── 注入全透明"坏包"(防线应拒绝注入) ──
const guard = await page.evaluate(async () => {
  const atlas = window.__swAtlas;
  const orig = atlas.vimages.get('vanilla/Projectile_50.png')
    ?? await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'sprites/vanilla/Projectile_50.png'; });
  const c = document.createElement('canvas');
  c.width = orig.width; c.height = orig.height;   // 同尺寸、零绘制 = 全透明
  const blob = await new Promise((r2) => c.toBlob(r2, 'image/png'));
  const pack = {
    id: 'pack-blank-test',
    manifest: { format: 'sw-remaster-pack/1', name: 'blank-test', createdAt: new Date().toISOString(), baseVersion: 'x', entries: {} },
    sheets: new Map([['vanilla/Projectile_50.png', blob]]),
  };
  const r3 = await window.__swRemaster.runtime.apply(pack);
  const now = atlas.vimages.get('vanilla/Projectile_50.png');
  const out = {
    failed: r3.failed,
    rejectedBlank: window.__swRemaster.runtime.rejectedBlank,
    applied: r3.applied,
    originalKept: now === orig,   // 身份比对:未替换
  };
  console.log('APPLIED', JSON.stringify(out));
  return out;
});
const blank = await throwAndSample('BLANK');

// ── 好包不误伤:原版字节回灌 → 应正常注入 ──
const good = await page.evaluate(async () => {
  const orig = await new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'sprites/vanilla/Projectile_50.png'; });
  const c = document.createElement('canvas');
  c.width = orig.width; c.height = orig.height;
  c.getContext('2d').drawImage(orig, 0, 0);
  const blob = await new Promise((r2) => c.toBlob(r2, 'image/png'));
  const pack = {
    id: 'pack-good-test',
    manifest: { format: 'sw-remaster-pack/1', name: 'good-test', createdAt: new Date().toISOString(), baseVersion: 'x', entries: {} },
    sheets: new Map([['vanilla/Projectile_50.png', blob]]),
  };
  return await window.__swRemaster.runtime.apply(pack);
});
console.log('GOOD', JSON.stringify(good));

console.log('RESULT', JSON.stringify({
  guardRejected: guard.failed.length === 1 && guard.originalKept && guard.applied.length === 0,
  blankProjAlive: blank.proj !== null,
  verdict: guard.failed.length === 1 && guard.originalKept
    ? '防线生效:全透明 sheet 被拒绝注入,原版贴图保留'
    : '防线未生效!',
}));
await browser.close();
