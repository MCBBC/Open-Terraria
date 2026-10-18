// ★BJ647-B 副案取证 v2：hover 城镇 NPC「微透明黑长方形」——旗面快照+截图。
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, '十周年纪念种子(2).wld'));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&beh=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1500));
const buf = readFileSync(WLD);
const b64 = buf.toString('base64');
const imported = await page.evaluate(async (b64) => {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  try { await window.__swFlow.importWld(u8); return { ok: true }; } catch (e) { return { ok: false, err: String(e) }; }
}, b64);
console.log('importWld:', JSON.stringify(imported));
for (let i = 0; i < 150; i++) {
  const ready = await page.evaluate(() => {
    const g = window.__swGame;
    return !!(g?.world?.store?.type?.length > 1000000 && g.world.name === '十周年纪念种子'
      && g.entities?.npcs?.some((n) => n.npcKey === 'witch_doctor'));
  }).catch(() => false);
  if (ready) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 4000));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
// 白天化 + 钉住巫医 + 相机对准
const pos = await page.evaluate(() => {
  const g = window.__swGame;
  const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
  g.world.clock.timeOfDay = 0.5;
  if (n) {
    window.__bjAnchor = { x: n.cx, y: n.cy };
    g.camera.x = n.cx - 60; g.camera.y = n.cy - 200;
    g.player.x = n.cx - 60; g.player.y = n.y; g.player.vx = 0; g.player.vy = 0;
  }
  if (!window.__bjPin) window.__bjPin = setInterval(() => {
    const n2 = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    if (n2 && window.__bjAnchor) { n2.x = window.__bjAnchor.x - n2.w / 2; n2.y = window.__bjAnchor.y - n2.h; n2.vx = 0; n2.vy = 0; }
  }, 200);
  const cam = g.camera, z = cam.zoom ?? 1;
  return { sx: (n.cx - cam.x) * z + 640, sy: (n.cy - cam.y) * z + 400 };
});
console.log('npc screen:', JSON.stringify(pos));
const mx = Math.round(pos.sx), my = Math.round(pos.sy);
const flags = async (tag) => {
  const f = await page.evaluate(() => {
    const g = window.__swGame;
    const r = g.renderer;
    const n = g.entities.npcs.find((x) => x.npcKey === 'witch_doctor');
    return {
      cursorIconCtx: JSON.parse(JSON.stringify(r.cursorIconCtx ?? {})),
      signBubble: !!r.signBubbleScreen,
      buildingGridAlpha: +(r._buildingGridAlpha ?? -1).toFixed(3),
      npcFrame: (() => { try { const fr = r.atlas?.vnpc(n.vanillaId, 0); return fr ? { sw: fr.sw, sh: fr.sh } : null; } catch { return null; } })(),
      smartFrame: (() => {
        try {
          const m = g.smartInteractTileFrame ?? window.__swSmartFrame;
          if (!m) return 'no-obj';
          return { won: !!m.tileWon, n: (m.coords ?? []).length, coords: (m.coords ?? []).slice(0, 8), sel: [...(m.selected ?? [])].slice(0, 8) };
        } catch (e) { return 'ERR:' + e; }
      })(),
      npcDist: g.smartInteractNpcDist ?? null,
      npcId: g.smartInteractNpcId ?? null,
      smartWanted: g.smartCursor?.wanted,
      optionsSmart: (() => { const d = g.options?.data ?? {}; return { sc: d.smartCursor ?? d.smartCurser ?? d.useSmartCursor, keys: Object.keys(d).filter((k) => /smart/i.test(k)) }; })(),
    };
  });
  console.log(`flags(${tag}):`, JSON.stringify(f));
};
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 600));
await flags('hover-off');
const shot0 = await page.screenshot({ clip: { x: Math.max(0, mx - 100), y: Math.max(0, my - 70), width: 200, height: 130 } });
await page.mouse.move(mx, my);
await new Promise((r) => setTimeout(r, 700));
await flags('hover-on');
const shot1 = await page.screenshot({ clip: { x: Math.max(0, mx - 100), y: Math.max(0, my - 70), width: 200, height: 130 } });
const fs = await import('node:fs');
fs.writeFileSync('/tmp/bj647-hover-before.png', shot0);
fs.writeFileSync('/tmp/bj647-hover-after.png', shot1);
// canvas 像素 diff（clip 区,CDP 鼠标驱动）
const grabRegion = () => page.evaluate(({ X0, Y0, W, H }) => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const o = document.createElement('canvas');
  o.width = W; o.height = H;
  o.getContext('2d').drawImage(cv, X0, Y0, W, H, 0, 0, W, H);
  return Array.from(o.getContext('2d').getImageData(0, 0, W, H).data);
}, { X0: Math.max(0, mx - 110), Y0: Math.max(0, my - 80), W: 220, H: 160 });
await page.mouse.move(10, 10);
await new Promise((r) => setTimeout(r, 400));
const d0 = await grabRegion();
await page.mouse.move(mx, my);
await new Promise((r) => setTimeout(r, 400));
const d1 = await grabRegion();
const W = 220, H = 160;
let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, count = 0;
const colHits = new Array(W).fill(0);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const d = Math.abs(d1[i] - d0[i]) + Math.abs(d1[i + 1] - d0[i + 1]) + Math.abs(d1[i + 2] - d0[i + 2]);
    if (d > 30) { count++; colHits[x]++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
}
const colRuns = [];
for (let x = 1; x < W; x++) if (colHits[x] > H * 0.15 && colHits[x - 1] <= H * 0.15) colRuns.push(x + (mx - 110));
console.log('pixel diff:', JSON.stringify({ bbox: count ? { minX: minX + mx - 110, minY: minY + my - 80, maxX: maxX + mx - 110, maxY: maxY + my - 80, count } : { count }, colRuns: colRuns.slice(0, 16) }));
console.log('errors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
