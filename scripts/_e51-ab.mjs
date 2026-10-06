// ★E51 A/B 呈现层验证:同场景冻结截图差分。
//  臂A1(新链=钩子注入精确失效) vs 臂A2(钩子置 null=页级 bump 兜底,旧语义)
//   → 期望【逐位同】(缓存失效策略不影响呈现字节);
//  臂B1(缺省=empG cut+uTint) vs 臂B2(?empslice=0=烘焙原链)
//   → 期望 ±1LSB 有界(逐页 diff census;uTint 顶点色 vs 2D 字节乘=舍入域差)。
// 运行:SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs --timeout=280000 scripts/_e51-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep } from '../tools/probe/lib/index.mjs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5207';
const WARM = 90;

/** 场景构建+冻结:活体 atk8 EoL(xray4 pin 模式)+暂停。 */
async function buildScene(page) {
  await page.evaluate(async () => {
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const g = window.__swGame;
    globalThis.__e51pin = setInterval(() => {
      const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
      if (!e) {
        const ne = Enemy.fromVanilla(636, g.player.cx + 260, g.player.cy - 250);
        if (ne) g.entities.add(ne, 'enemies');
        return;
      }
      e.dead = false; e.spawnAlpha = 0;
      if (e.hp > 1) e.hp = 1;
      e.ai3 = 1; e.ai2 = 2;
      e.cx = g.player.cx + 260; e.cy = g.player.cy - 250;
      e.despawnTimer = 750;
      const p2 = g.player;
      if (p2) { p2.hp = p2.maxHp; p2.dead = false; }
    }, 8);
  });
  await sleep(2200);   // 键集预热+渐显窗
  await page.evaluate(() => { window.__swGame.paused = true; });
  await sleep(300);
}

async function arm(label, preFreeze, extra) {
  const browser = await launchBrowser({ headless: true });
  const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
  const boot = await bootstrap(page, ORIGIN, { log: () => {} });
  if (!boot?.ok) throw new Error('boot fail ' + label + ' ' + JSON.stringify(boot));
  const made = await createGame(page, { mode: 'direct', seed: 'e51ab', size: 'small', pinRandom: 20261006, log: () => {} });
  if (!made?.ok) throw new Error('createGame fail ' + label);
  await sleep(1000);
  await buildScene(page);
  if (preFreeze) await page.evaluate(preFreeze);
  await sleep(400);
  if (extra) await page.evaluate(extra);
  await sleep(400);
  const shot = await page.screenshot({ type: 'png' });
  const info = await page.evaluate(() => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    return { alive: !!e && !e.dead, ai0: e?.ai0, path: g.renderer.bglPathUsed };
  });
  await browser.close();
  return { shot, info };
}

const diff = (a, b, win) => {
  const A = PNG.sync.read(a), B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) return { fatal: 'size' };
  // win={x,y,w,h} 可选:只统计该屏幕窗(HUD/全屏时变面排除)
  const x0 = Math.max(0, win?.x ?? 0), y0 = Math.max(0, win?.y ?? 0);
  const x1 = Math.min(A.width, win ? win.x + win.w : A.width);
  const y1 = Math.min(A.height, win ? win.y + win.h : A.height);
  let n = 0, maxCh = 0, maxAt = null, total = 0;
  const pts = [];
  const d = A.data, e = B.data;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      total++;
      const i = (y * A.width + x) * 4;
      let px = 0, dvAbs = 0;
      for (let c = 0; c < 3; c++) {
        const dv = Math.abs(d[i + c] - e[i + c]);
        if (dv > px) { px = dv; dvAbs = dv; }
      }
      if (px > 0) {
        n++;
        if (pts.length < 8) pts.push([x, y, dvAbs]);
        if (px > maxCh) { maxCh = px; maxAt = i / 4; }
      }
    }
  }
  return { diffPx: n, total, pct: total ? +(100 * n / total).toFixed(4) : 0, maxCh, maxAt, pts, win: win ? { x: x0, y: y0 } : null };
};

/** 同页两拍:先拍新链,页内切旗后拍回退链,像素差分。 */
// ★底噪自检:sleep 控制在 pause + screenshot 循环内——先同页连拍两张不切旗,
//  diff≠0 ⇒ 存在两拍间时变源(动画/相位),切旗差分需扣底噪。
async function abPair(label, switchFlag) {
  const browser = await launchBrowser({ headless: true });
  const page = await openPage(browser, ORIGIN, { width: 1280, height: 800 });
  const boot = await bootstrap(page, ORIGIN, { log: () => {} });
  if (!boot?.ok) throw new Error('boot fail ' + label + ' ' + JSON.stringify(boot));
  const made = await createGame(page, { mode: 'direct', seed: 'e51ab', size: 'small', pinRandom: 20261006, log: () => {} });
  if (!made?.ok) throw new Error('createGame fail ' + label);
  await sleep(1000);
  await buildScene(page);
  await sleep(400);
  const win = await page.evaluate(() => {
    const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    if (!e) return null;
    const zoom = cam.zoom ?? 1;
    const sx = Math.round((e.cx - cam.x) * zoom + cv.width / 2);
    const sy = Math.round((e.cy - cam.y) * zoom + cv.height / 2);
    return { x: Math.max(0, sx - 360), y: Math.max(120, sy - 360), w: 720, h: Math.min(720, sy - 360 + 720 > 800 ? 800 - Math.max(70, sy - 360) : 720) };
  });
  const s1 = await page.screenshot({ type: 'png' });
  // ★底噪自检:不切旗连拍
  const sN = await page.screenshot({ type: 'png' });
  const noise = diff(s1, sN, win);
  console.log(`[${label}] 底噪(同链连拍):`, JSON.stringify(noise));
  const info1 = await page.evaluate(() => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    return { alive: !!e && !e.dead, ai0: e?.ai0, path: g.renderer.bglPathUsed };
  });
  await page.evaluate(switchFlag);
  await sleep(1500);   // 切旗后数帧(缓存稳态+瞬态排化)
  const s2 = await page.screenshot({ type: 'png' });
  const info2 = await page.evaluate(() => {
    const g = window.__swGame;
    const e = (g.entities.enemies ?? []).find((en) => en.vanillaId === 636);
    return { alive: !!e && !e.dead, ai0: e?.ai0, path: g.renderer.bglPathUsed };
  });
  await browser.close();
  return { info1, info2, win, d: diff(s1, s2, win) };
}

console.log('== 臂A:刀A 精确失效(缺省) vs 页级 bump 兜底(null)——期望逐位同 ==');
const A = await abPair('A', () => import('/src/render/TintAtlas.ts').then((m) => m.setTintAtlasInvalidateRect(null)));
console.log('A1(新链):', JSON.stringify(A.info1));
console.log('A2(兜底):', JSON.stringify(A.info2));
console.log('刀A 像素差分:', JSON.stringify(A.d));

console.log('== 臂B:刀B empG uTint(缺省) vs 烘焙原链(empslice off)——期望 ±1LSB 有界 ==');
const B = await abPair('B', () => import('/src/render/Renderer.ts').then((m) => { m.Renderer.empGhostSliceOff = true; }));
console.log('B1(uTint):', JSON.stringify(B.info1));
console.log('B2(烘焙):', JSON.stringify(B.info2));
console.log('刀B 像素差分:', JSON.stringify(B.d));
process.exit(0);
