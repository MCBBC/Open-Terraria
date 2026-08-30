// 碰撞盒验收底稿 v2:真实落地 tick + debugMode 盒描边 + getImageData 落盘
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const IDS = (process.env.SHEET_IDS || '1,3,21,46,49,63,69,72').split(',').map(Number);
const TAG = process.env.TAG || 'a';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 140)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

await page.evaluate(async (ids) => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const mk = (name) => {
    const w = new World(240, 200, 777, name);
    for (let x = 0; x < 240; x++) for (let y = 100; y < 200; y++) w.store.setTile(x, y, 1);
    for (let x = 0; x < 240; x++) w.store.setTile(x, 99, 3);
    w.clock.time = 13500; w.spawnX = 120; w.spawnY = 94;
    return w;
  };
  const load = async (w) => {
    const p = sf.buildSaveParts(w);
    await window.__swFlow.loadJson(sf.serializeSave(p.view, p.meta, p.player, 0));
    document.getElementById('sw-boot-prime')?.remove();
  };
  await load(mk('warm'));
  const g0 = window.__swGame;
  await g0.whenFirstPaint(3);
  await load(mk('sheet'));
  const g = window.__swGame;
  await g.whenFirstPaint(3);
  for (let t = 0; t < 60; t++) {
    let gone = true;
    for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; }
    if (gone) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  if (g.player.dead) g.respawnPlayer?.();
  g.renderer.debugMode = true;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const surfY = 99 * 16;
  window.__placed = [];
  let col = 0;
  for (const id of ids) {
    const e = Enemy.fromVanilla(id, 0, 0);
    if (!e) continue;
    const px = g.player.cx + (col - 3.5) * 150 / g.camera.zoom;
    e.x = px - e.w / 2;
    e.y = surfY - 420 - e.h / 2 - Math.random() * 40;
    g.entities.enemies.push(e);
    window.__placed.push({ id, ref: e });
    col++;
  }
  // 真实落地:非暂停逐 tick 让物理+AI 跑 120 tick,再冻结
  g.paused = false;
  for (let t = 0; t < 120; t++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}, IDS);

const info = await page.evaluate(() => ({
  dead: !!window.__swGame.player.dead,
  placed: window.__placed.map(({ id, ref }) => ({ id, foot: Math.round(ref.y + ref.h), onGround: Math.round(ref.vy) === 0 })),
}));
console.log(JSON.stringify(info));

const dataUrl = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
  const oc = document.createElement('canvas'); oc.width = cv.width; oc.height = cv.height;
  oc.getContext('2d').putImageData(d, 0, 0);
  return oc.toDataURL('image/png');
});
writeFileSync(`/tmp/npc-audit/contact-${TAG}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`落盘 contact-${TAG}.png (${IDS.join(',')})`);
await browser.close();
