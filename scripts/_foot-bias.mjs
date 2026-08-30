// 落脚深度实测:settled 人形,量「精灵最低不透明行」vs「F3 盒底线」,纯像素裁决
import puppeteer from 'puppeteer-core';
import { writeFileSync as fs0 } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const IDS = (process.env.FOOT_IDS || '3,21,22,20,17').split(',').map(Number);
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 140)));
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

const out = await page.evaluate(async ({ ids, cal }) => {
  const __args = { ids, cal };
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const mk = (name) => {
    const w = new World(240, 200, 777, name);
    for (let x = 0; x < 240; x++) for (let y = 120; y < 200; y++) w.store.setTile(x, y, 1);
    for (let x = 0; x < 240; x++) w.store.setTile(x, 119, 3);
    w.clock.time = 13500; w.spawnX = 120; w.spawnY = 116;
    return w;
  };
  const load = async (w) => { const p = sf.buildSaveParts(w); await window.__swFlow.loadJson(sf.serializeSave(p.view, p.meta, p.player, 0)); document.getElementById('sw-boot-prime')?.remove(); };
  await load(mk('warm')); await window.__swGame.whenFirstPaint(3);
  await load(mk('foot')); const g = window.__swGame; await g.whenFirstPaint(3);
  for (let t = 0; t < 60; t++) { let gone = true; for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; } if (gone) break; await new Promise((r) => setTimeout(r, 100)); }
  if (g.player.dead) g.respawnPlayer?.();
  g.renderer.debugMode = true;
  g.renderer.fullbright = false;
  const CAL = __args.cal;   // 校准模式:先关闭补偿测原埋深
  try { localStorage.setItem('sw_npc_foot_flush', CAL ? '0' : '1'); } catch {}
  delete localStorage.__noop;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const z = g.camera.zoom;
  const pScr = g.camera.worldToScreen(g.player.cx, g.player.cy);
  const placed = [];
  let col = -Math.floor(ids.length / 2);
  for (const id of ids) {
    const e = Enemy.fromVanilla(id, 0, 0);
    if (!e) continue;
    const wx = g.player.cx + (col * 150) / z;
    e.x = wx - e.w / 2; e.y = 119 * 16 - 300 - e.h / 2;
    e.vx = 0; e.vy = 0;
    g.entities.enemies.push(e);
    placed.push({ id, ref: e });
    col++;
    void pScr;
  }
  g.paused = false;
  for (let t = 0; t < 150; t++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // 像素量测(差分法):基线 = 实体全部传走后的同视角帧
  const cv = g.renderer.canvas;
  const grab = () => new Uint8Array(cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data);
  const A = grab();
  for (const { ref } of placed) ref.x += 1e6;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const B = grab();
  const res = [];
  for (const { id, ref } of placed) {
    const [sx] = g.camera.worldToScreen(ref.cx - 1e6, ref.cy);
    const bw = Math.max(4, Math.round(ref.w * z / 2)) + 6;
    const c0 = Math.max(0, Math.round(sx - bw)), c1 = Math.min(cv.width - 1, Math.round(sx + bw));
    let boxTop = 1e9, boxBot = -1, sprBot = -1;
    for (let y = 0; y < cv.height; y++) {
      let diffDark = 0, sawBox = false;
      for (let x = c0; x <= c1; x++) {
        const i = (y * cv.width + x) * 4;
        const dch = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
        if (dch < 40) continue;
        // F3 描边宽谱:红=怪物 橙=城镇 蓝=动物
        const R0 = A[i], G0 = A[i + 1], B0 = A[i + 2];
        const isStroke = (R0 > 170 && B0 < 150 && R0 - B0 > 60 && R0 - G0 > -10)
          || (B0 > 170 && B0 - R0 > 50 && R0 < 160);
        if (isStroke) { sawBox = true; continue; }
        diffDark++;
      }
      if (sawBox) { boxTop = Math.min(boxTop, y); boxBot = Math.max(boxBot, y); }
      if (diffDark >= 2) sprBot = Math.max(sprBot, y);
    }
    res.push({
      id,
      boxBotRow: boxBot === -1 ? null : boxBot,
      sprBotRow: sprBot === -1 ? null : sprBot,
      bury_px: (boxBot >= 0 && sprBot >= 0) ? sprBot - boxBot : null,
    });
  }
  return { res, dbg: { w: cv.width, h: cv.height, entsN: g.entities.enemies.length, debugMode: g.renderer.debugMode,
        running: g.running, painted: g._paintedFrames,
        errs: (window.__swErrors ?? []).slice(-2).map((e) => JSON.stringify(e).slice(0, 500)),
        stack: String(g.__lastFrameErr ?? '').slice(0, 300) } };
}, { ids: IDS, cal: !!process.env.FOOT_CAL });

console.log(JSON.stringify({ res: out.res, dbg: out.dbg }, null, 1));
// 裁一张对照图(第一实体周边)供肉眼复核
const shot = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  return cv.toDataURL('image/png').length;
});
void shot;
const du = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, 520);
  const oc = document.createElement('canvas'); oc.width = cv.width; oc.height = 520;
  oc.getContext('2d').putImageData(d, 0, 0);
  return oc.toDataURL('image/png');
});
writeFileSync('/tmp/npc-audit/foot-bias.png', Buffer.from(du.split(',')[1], 'base64'));
console.log('图已存 /tmp/npc-audit/foot-bias.png');
await browser.close();
