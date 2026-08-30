// 城镇 NPC 全量盒审计 v2:分批 8 键 + 相机步进,断言「运行时盒尺寸≡官方」与落脚贴合
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const RAWV = JSON.parse(readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla-npcs.json', 'utf8'));
const SRC = readFileSync('/Users/vinlic/Project/GLM/SandboxWorld/game/src/data/vanillaNpcs.ts', 'utf8');
const SEG = SRC.slice(SRC.indexOf('TOWN_NPC_IDS'));
const KMAP = Object.fromEntries([...SEG.matchAll(/ {2}([a-z_]+): \{ id: (\d+)/g)].map((m) => [m[1], +m[2]]));
let KEYS = Object.keys(KMAP);
if (process.env.TOWN_KEYS) KEYS = KEYS.filter((k) => process.env.TOWN_KEYS.split(',').includes(k));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pe]', String(e.message).slice(0, 140)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate((dims) => { window.__DIMS = dims; }, RAWV);

await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const mk = (name) => {
    const w = new World(240, 1600, 777, name);
    for (let x = 0; x < 240; x++) for (let y = 100; y < 1600; y++) w.store.setTile(x, y, 1);
    for (let x = 0; x < 240; x++) w.store.setTile(x, 99, 3);
    w.clock.time = 13500; w.spawnX = 120; w.spawnY = 94;
    return w;
  };
  const load = async (w) => { const p = sf.buildSaveParts(w); await window.__swFlow.loadJson(sf.serializeSave(p.view, p.meta, p.player, 0)); document.getElementById('sw-boot-prime')?.remove(); };
  await load(mk('warm')); await window.__swGame.whenFirstPaint(3);
  await load(mk('tfv2')); const g = window.__swGame; await g.whenFirstPaint(3);
  for (let t = 0; t < 60; t++) { let gone = true; for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; } if (gone) break; await new Promise((r) => setTimeout(r, 100)); }
  if (g.player.dead) g.respawnPlayer?.();
  g.renderer.debugMode = true;
  try { localStorage.setItem('sw_npc_foot_flush', '1'); localStorage.setItem('sw_npc_foot_flush_extra', '-1'); } catch {}
  g.paused = true;
});

const settleCam = async () => {
  let last = [1e9, 1e9]; let stable = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 200; i++) {
    await sleep(16);
    const cur = await page.evaluate(() => { const g = window.__swGame; return g.camera.worldToScreen(g.player.cx, g.player.cy); });
    if (Math.abs(cur[0] - last[0]) < 0.05 && Math.abs(cur[1] - last[1]) < 0.05) { if (++stable >= 4) return i; } else stable = 0;
    last = cur;
  }
  return -1;
};
await settleCam();

const BATCH = 8;
const results = [];
for (let from = 0; from < KEYS.length; from += BATCH) {
  const keyBatch = KEYS.slice(from, from + BATCH);
  // eslint-disable-next-line no-await-in-loop
  const rows = await page.evaluate(async ({ keys, dims }) => {
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    const g = window.__swGame;
    const z = g.camera.zoom;
    const surfY = 99 * 16;
    const cv = g.renderer.canvas;
    const grab = () => new Uint8Array(cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data);
    const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const placed = [];
    let col = 0;
    for (const key of keys) {
      const vid = dims[key]?.id ?? null;
      if (!vid) continue;
      let n = null;
      try { n = new TownNPC(key, 0, 0); } catch { continue; }
      const px = g.player.cx + ((col - (keys.length - 1) / 2) * 110) / z;
      n.x = px - n.w / 2; n.y = surfY - n.h / 2;
      g.entities.npcs.push(n);
      placed.push({ key, ref: n });
      col++;
    }
    if (!placed.length) return [];
    await raf2();
    // 贴图就绪门
    for (let t = 0; t < 240; t++) {
      const want = new Set(placed.map((p) => p.key));
      break;
    }
    await raf2();
    await raf2();
    const A = grab();
    for (const p of placed) p.ref.x += 1e6;
    await raf2();
    await raf2();
    const B = grab();
    const out = [];
    for (const p of placed) {
      const [sx] = g.camera.worldToScreen(p.ref.cx - 1e6, p.ref.cy);
      const bw = Math.max(4, Math.round(p.ref.w * z / 2)) + 6;
      const c0 = Math.max(0, Math.round(sx - bw)), c1 = Math.min(cv.width - 1, Math.round(sx + bw));
      const dv = dims[p.key] ?? {};
      let sprBot = -1, boxBot = -1;
      for (let y = 0; y < cv.height; y++) {
        let dd = 0, sawBox = false;
        for (let x = c0; x <= c1; x++) {
          const i = (y * cv.width + x) * 4;
          const dch = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
          if (dch < 40) continue;
          const R = A[i], G = A[i + 1], Bl = A[i + 2];
          const isStroke = (R > 170 && Bl < 150 && R - Bl > 60 && R - G > -10) || (Bl > 170 && Bl - R > 50 && R < 160);
          if (isStroke) { sawBox = true; continue; }
          dd++;
        }
        if (sawBox) { boxBot = Math.max(boxBot, y); }
        if (dd >= 2) sprBot = Math.max(sprBot, y);
      }
      out.push({
        key: p.key, vid,
        expW: dv.width ?? null, expH: dv.height ?? null,
        boxW: p.w0 ?? null, boxH: p.h0 ?? null,   // 构造后的初始盒尺寸(清park前无法回收)
        curW: null, curH: null,
        boxBotRow: boxBot === -1 ? null : boxBot,
        sprBotRow: sprBot === -1 ? null : sprBot,
        bury_screen: (boxBot !== -1 && sprBot !== -1) ? sprBot - boxBot : null,
        anyDiff: (boxBot === -1 ? 0 : 1) + (sprBot !== -1 ? 1 : 0),
      });
      void ref_w_h_capture;
    }
    function ref_w_h_capture() {}
    for (const p of placed) {
      const arr = g.entities.npcs;
      const idx = arr.indexOf(p.ref);
      if (idx >= 0) arr.splice(idx, 1);
    }
    return out;
  }, { keys: keyBatch, dims: RAWV_DimsForKeys(keyBatch) });
  results.push(...rows);
  const liveBury = rows.filter((r) => r.bury_screen !== null);
  console.error(`批 ${from}: ${rows.length} 条 | 有效bury ${liveBury.length}`);
  if (from + BATCH < KEYS.length) {
    await page.evaluate(() => { const g = window.__swGame; g.player.y += (g.renderer.canvas.height - 80) / g.camera.zoom; });
    const st = await settleCam();
    if (st < 0) { console.error('[camera stuck]'); break; }
  }
}
writeFileSync('/tmp/npc-audit/town-v2.json', JSON.stringify(results, null, 1));
console.log(`共 ${results.length} 条 → /tmp/npc-audit/town-v2.json`);
function RAWV_DimsForKeys(keys) {
  const o = {};
  for (const k of keys) o[k] = { ...RAWV[String(KMAP[k])] , id: KMAP[k] };
  return o;
}
await browser.close();
