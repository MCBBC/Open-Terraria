const BASE = process.env.TARGET || 'http://localhost:5201';
// 弹幕可见性诊断:SDMG 连射 + 逐帧扫描弹道带像素;抓 pageerror(冻结 TypeError vs 并行会话)。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: join(HOME, '.claude/jobs/8405c930/tmp/projvis-profile'),
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => { errs.push(String(e.stack || e.message).slice(0, 400)); });
page.setDefaultTimeout(200000);
await page.goto(BASE + '/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(async (b) => { await window.__swFlow.loadJson(await (await fetch(b + '/debug-save.sbw.json')).text()); }, BASE);
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const m = await import('/src/data/items.ts');
  const gun = m.ITEM_BY_KEY['vi_1553_SDMG'], ammo = m.ITEM_BY_KEY['vi_546_CursedBullet'];
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: gun, stack: 1 };
  g.player.inv.slots[53] = { id: ammo, stack: 999 };
  g.player.inv.selected = 0;
  window.__swordId = m.ITEM_BY_KEY['vi_3507_CopperShortsword'];
  g.player.x = 383 * 16; g.player.y = 254 * 16;
  g.player.debugGod = true;
  const c = g.world.clock; if (c) c.timeOfDay = 0.4;
});
await new Promise((r) => setTimeout(r, 2000));
// 朝右平射,连续 60 帧:统计弹幕实体数 + 弹道带(玩家右侧 60-300px)亮度变化帧数
// updateUse 门状态探针
await page.evaluate(() => {
  const g = window.__swGame;
  const proto = Object.getPrototypeOf(g);
  const orig = proto.updateUse;
  window.__useSt = { calls: 0, uiBlock: 0, fullMap: 0, heldId: -1, useTime: -1, mineNull: 0 };
  proto.updateUse = function (dt) {
    const st = window.__useSt;
    st.calls++;
    if (this.input.uiBlocking) st.uiBlock++;
    if (this.renderer.fullMap.open) st.fullMap++;
    const h = this.player.inv.heldItem();
    st.heldId = h ? h.id : -1;
    st.useTime = this.player.useTime;
    if (this.mining === null) st.mineNull++;
    return orig.call(this, dt);
  };
});
// 同时钉一眼 useTimer 域:连采 30 帧玩家 useTimer/useAnimation 字段
await page.evaluate(() => { window.__useWatch = []; });
await page.mouse.move(640, 400);
await page.mouse.down();
const res = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  let frames = 0, maxProjs = 0, projsChecked = 0, projsRendered = 0;
  for (let k = 0; k < 90; k++) {
    await new Promise((res) => requestAnimationFrame(() => res()));
    frames++;
    const list = g.entities.projectiles;
    if (list.length > maxProjs) maxProjs = list.length;
    if (k < 30) {
      const sw = g.swing;
      window.__useWatch.push([k, sw ? sw.t : -1, sw ? sw.dur : -1, g.player.useTime, list.length]);
    }
    // 逐弹幕定点采样:投影位 ±12px 内有不透明像素 = 渲染中
    for (const q of list.slice(0, 12)) {
      const sx = Math.round(cv.width / 2 + (q.x - cam.x) * z);
      const sy = Math.round(cv.height / 2 + (q.y - cam.y) * z);
      if (sx < 12 || sy < 12 || sx > cv.width - 12 || sy > cv.height - 12) continue;
      projsChecked++;
      const d = ctx.getImageData(sx - 12, sy - 12, 24, 24).data;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] > 200) { projsRendered++; break; }
      }
    }
  }
  return { frames, maxProjs, projsChecked, projsRenderedPct: projsChecked ? Math.round(projsRendered / projsChecked * 100) : -1 };
}).catch((e) => ({ err: String(e).slice(0, 400) }));
await page.mouse.up();
console.log('[弹道]', JSON.stringify(res));
console.log('[pageerror]', errs.length, errs.slice(0, 2));
// 手动注入一枚 Arrow(绕开开火链,单测绘制层)
const vis = await page.evaluate(async () => {
  const m = await import('/src/entities/Arrow.ts');
  const g = window.__swGame;
  const a = new m.Arrow(g.player.x + 40, g.player.y, 4, 0, 10, 0, 600, null, {});
  g.entities.add(a, 'projectiles');
  await new Promise((r) => setTimeout(r, 300));
  const r2 = g.renderer, ctx = r2.ctx, cv = r2.canvas, cam = g.camera, z = cam.zoom;
  const ax = cv.width / 2 + 30 * z, ay = cv.height / 2 - 20 * z;
  const d = ctx.getImageData(Math.round(ax), Math.round(ay), Math.round(50 * z), Math.round(40 * z)).data;
  let opaque = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
  return { projAlive: g.entities.projectiles.length, opaquePx: opaque };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
console.log('[注入Arrow]', JSON.stringify(vis));
// 幕三:持械铜短剑挥击——玩家周身 ±48px 在挥击帧的"非玩家"新增像素(武器贴图)
const sword = await page.evaluate(async () => {
  const g = window.__swGame;
  g.player.inv.slots[0] = { id: window.__swordId, stack: 1 };
  g.player.inv.selected = 0;
  return { id: window.__swordId };
});
await page.mouse.move(700, 380);
const swing = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const cam = g.camera, z = cam.zoom;
  const px = Math.round(cv.width / 2), py = Math.round(cv.height / 2);
  const sample = () => {
    const d = ctx.getImageData(px - 56, py - 56, 112, 112).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 8) if (d[i + 3] > 200) n++;
    return n;   // 玩家+周围不透明像素量
  };
  await new Promise((r2) => setTimeout(r2, 300));
  const idle = sample();
  let maxDuringSwing = idle;
  for (let k = 0; k < 40; k++) {
    await new Promise((r2) => requestAnimationFrame(() => r2()));
    const v = sample();
    if (v > maxDuringSwing) maxDuringSwing = v;
  }
  return { idlePx: idle, maxDuringSwing, gain: maxDuringSwing - idle };
}).catch((e) => ({ err: String(e).slice(0, 300) }));
await page.mouse.down();
await new Promise((r) => setTimeout(r, 900));
await page.mouse.up();
const swingDuring = await page.evaluate(async () => {
  const g = window.__swGame, r = g.renderer, ctx = r.ctx, cv = r.canvas;
  const px = Math.round(cv.width / 2), py = Math.round(cv.height / 2);
  let maxN = 0;
  for (let k = 0; k < 50; k++) {
    await new Promise((r2) => requestAnimationFrame(() => r2()));
    const d = ctx.getImageData(px - 56, py - 56, 112, 112).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 8) if (d[i + 3] > 200) n++;
    if (n > maxN) maxN = n;
  }
  return maxN;
}).catch((e) => -1);
console.log('[持械挥击]', JSON.stringify({ ...swing, swingDuring }));
console.log('[swing态]', JSON.stringify(await page.evaluate(() => window.__useWatch?.slice(0, 12))));
console.log('[updateUse门]', JSON.stringify(await page.evaluate(() => window.__useSt)));
await browser.close();
