// 全量落脚校准:关补偿→批量实测原始埋深→/tmp/npc-audit/calib.json
import { REPO_ROOT, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { writeFileSync, readFileSync } from 'node:fs';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
// 排除集与生成器同步(旋转/独占/风格族)
const EXCL_ROT = new Set([35,68,113,114,115,116,125,126,127,128,129,130,131,134,135,136,246,247,248,249,261,262,263,264,265,370,372,373,396,397,477,478,479,657]);
const EXCL_STYLE = new Set([5,6,9,19,21,23,40,56,76]);
const EXCL_SPECIAL = new Set([594,690,657,576,577,564,565,668,396,397,398,400,636,402,266,491,551,677,488,393]);
const V = JSON.parse(readFileSync(join(REPO_ROOT, 'public/sprites/vanilla-npcs.json'), 'utf8'));
const ALL_IDS = Object.keys(V).map(Number).filter((id) =>
  id > 0 && V[id].frames && !EXCL_ROT.has(id) && !EXCL_SPECIAL.has(id) && !EXCL_STYLE.has(V[id].aiStyle ?? 0));
console.log(`待校准 ${ALL_IDS.length} 型`);

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 900000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });

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
  await load(mk('calib')); const g = window.__swGame; await g.whenFirstPaint(3);
  for (let t = 0; t < 60; t++) { let gone = true; for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); gone = false; break; } if (gone) break; await new Promise((r) => setTimeout(r, 100)); }
  if (g.player.dead) g.respawnPlayer?.();
  g.renderer.debugMode = true;
  g.renderer.fullbright = true;
  try { localStorage.setItem('sw_npc_foot_flush', process.env.FOOT_FLUSH_ON ? '1' : '0'); } catch {}
  g.paused = true;
  window.__calIds = [];
});
// 等一帧确认落地
await new Promise((r) => setTimeout(r, 400));

const BATCH = 8;
const outAll = {};
for (let from = 0; from < ALL_IDS.length; from += BATCH) {
  const ids = ALL_IDS.slice(from, from + BATCH);
  try {
    const res = await page.evaluate(async (ids) => {
      const { Enemy } = await import('/src/entities/Enemy.ts');
      const g = window.__swGame;
      const z = g.camera.zoom;
      const surfY = 99 * 16;
      const placed = [];
      let col = 0;
      for (const id of ids) {
        const e = Enemy.fromVanilla(id, 0, 0);
        if (!e) continue;
        const px = g.player.cx + ((col - Math.floor(ids.length / 2)) * 150) / z;
        e.x = px - e.w / 2; e.y = surfY - e.h / 2;   // 盒底正好压线,站立姿态冻结
        e.vx = 0; e.vy = 0; e.visAngle = 0; e.spin = 0; e.facing = -1;
        if ('spawnAlpha' in e) e.spawnAlpha = 0;
        if ('alpha' in e) e.alpha = 0;
        g.entities.enemies.push(e);
        placed.push({ id, ref: e });
        col++;
      }
      if (!placed.length) return [];
      // 保持 paused,不跑物理——测的是渲染对齐而非落地姿态
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const cv = g.renderer.canvas;
      const grab = () => new Uint8Array(cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, cv.width, cv.height).data);
      const A = grab();
      for (const { ref } of placed) ref.x += 1e6;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const B = grab();
      const out = [];
      for (const { id, ref } of placed) {
        const [sx] = g.camera.worldToScreen(ref.cx - 1e6, ref.cy);
        const bw = Math.max(4, Math.round(ref.w * z / 2)) + 6;
        const c0 = Math.max(0, Math.round(sx - bw)), c1 = Math.min(cv.width - 1, Math.round(sx + bw));
        let boxBot = -1, sprBot = -1;
        for (let y = 0; y < cv.height; y++) {
          let diffDark = 0, sawBox = false;
          for (let x = c0; x <= c1; x++) {
            const i = (y * cv.width + x) * 4;
            const dch = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
            if (dch < 40) continue;
            if (A[i] > 200 && A[i + 1] < 115 && A[i + 2] < 115) { sawBox = true; continue; }
            diffDark++;
          }
          if (sawBox) boxBot = Math.max(boxBot, y);
          if (diffDark >= 2) sprBot = Math.max(sprBot, y);
        }
        const buryWorld = (boxBot >= 0 && sprBot >= 0) ? (sprBot - boxBot) / z : null;
        out.push({ id, buryWorld: buryWorld === null ? null : Math.round(buryWorld * 100) / 100 });
        // 清场本批在此迭代内不清理——park 已足够离屏
      }
      for (const { ref } of placed) {
        const arr = g.entities.enemies;
        const idx = arr.indexOf(ref);
        if (idx >= 0) arr.splice(idx, 1);
      }
      // 相机下移一带,规避后续批与背景残留差异(世界纵深充足)
      g.player.y += (cv.height - 80) / z / 1;
      let last = [1e9, 1e9], stable = 0;
      for (let t = 0; t < 120; t++) {
        await new Promise((r) => requestAnimationFrame(r));
        const cur = g.camera.worldToScreen(g.player.cx, g.player.cy);
        if (Math.abs(cur[0] - last[0]) < 0.05 && Math.abs(cur[1] - last[1]) < 0.05) { if (++stable >= 4) break; } else stable = 0;
        last = cur;
      }
      return out;
    }, ids);
    for (const r of res) outAll[r.id] = r.buryWorld;
    console.log(`批次 ${from}-${from + ids.length}:完成 ${res.length}`);
  } catch (e) { console.log('[批次异常跳过]', String(e).slice(0, 90)); }
}
const OUTP = process.env.CAL_OUT || '/tmp/npc-audit/calib.json';
writeFileSync(OUTP, JSON.stringify(outAll));
console.log('落盘', OUTP);
console.log(`校准完成 ${Object.keys(outAll).length} 型 → /tmp/npc-audit/calib.json`);
await browser.close();
