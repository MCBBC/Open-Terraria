// 单 id 镜像直证 v2:以玩家屏坐标为锚摆 facing -1/+1 并排
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const IDS = (process.env.FLIP_IDS || '63,485').split(',').map(Number);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', String(m.text()).slice(0, 300)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(async (ids) => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const mk = (name) => {
    const w = new World(220, 200, 777, name);
    for (let x = 0; x < 220; x++) for (let y = 100; y < 200; y++) w.store.setTile(x, y, 1);
    for (let x = 0; x < 220; x++) w.store.setTile(x, 99, 3);
    w.clock.time = 13500; w.spawnX = 110; w.spawnY = 90;
    return w;
  };
  const load = async (w) => { const p = sf.buildSaveParts(w); await window.__swFlow.loadJson(sf.serializeSave(p.view, p.meta, p.player, 0)); document.getElementById('sw-boot-prime')?.remove(); };
  await load(mk('warm')); await window.__swGame.whenFirstPaint(3);
  await load(mk('flip')); const g = window.__swGame; await g.whenFirstPaint(3);
  for (let t = 0; t < 60; t++) { let gone = true; for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; } if (gone) break; await new Promise((r) => setTimeout(r, 100)); }
  if (g.player.dead) g.respawnPlayer?.();
  g.paused = true; g.renderer.fullbright = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const { Enemy } = await import('/src/entities/Enemy.ts');
  // 锚玩家当前屏幕位置,往上一排放
  const pScr = g.camera.worldToScreen(g.player.cx, g.player.cy);
  const z = g.camera.zoom;
  let sx = pScr[0] - 260;
  window.__ents = [];
  for (const id of ids) for (const f of [-1, 1]) {
    const e = Enemy.fromVanilla(id, 0, 0);
    if (!e) continue;
    e.x = g.player.cx + (sx - pScr[0]) / z - e.w / 2;
    e.y = g.player.cy - 80 / z * 1 - e.h / 2;
    e.vx = 0; e.vy = 0; e.visAngle = 0; e.spin = 0; e.facing = f; e.spawnAlpha = 0; e.alpha = 0;
    g.entities.enemies.push(e);
    window.__ents.push({ e, id, f });
    sx += Math.max(110, (e.w + 40));
  }
}, IDS);
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(async () => { await window.__swGame.whenFirstPaint(2); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
const info = await page.evaluate(() => ({
  n: window.__ents.length,
  running: window.__swGame.running,
  errs: (window.__swErrors ?? []).slice(-3).map((e) => String(e?.message ?? e).slice(0, 200)),
  centerPx: (() => { const cv = window.__swGame.renderer.canvas; const d = cv.getContext('2d').getImageData(cv.width >> 1, cv.height >> 1, 1, 1).data; return [d[0], d[1], d[2]]; })(),
  screens: window.__ents.map(({ e, id, f }) => { const [sx, sy] = window.__swGame.camera.worldToScreen(e.cx, e.cy); return `${id}${f < 0 ? 'L' : 'R'}@${Math.round(sx)},${Math.round(sy)}`; }),
  dead: !!window.__swGame.player.dead,
}));
console.log(JSON.stringify(info));
const dataUrl = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  const d = cv.getContext('2d').getImageData(260, 180, 760, 300);
  const oc = document.createElement('canvas'); oc.width = 760; oc.height = 300;
  oc.getContext('2d').putImageData(d, 0, 0);
  return oc.toDataURL('image/png');
});
writeFileSync('/tmp/npc-audit/flip-pair.png', Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('crop 已存 /tmp/npc-audit/flip-pair.png (' + IDS.flatMap((i) => [i + 'L', i + 'R']).join('|') + ')');
await browser.close();
