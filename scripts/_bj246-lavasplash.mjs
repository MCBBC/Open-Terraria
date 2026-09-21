// ★BJ246 实机探针：熔岩史莱姆（NPC 59）专家模式死亡泼岩浆（NPC.cs:86561-86601）1:1 复核。
// 断言：①专家世界（difficulty:1）59 致死 → 死亡中心格 liquid∈[50,149] 且 liquidType=2（LAVA）
//      ②非岩浆族对照（绿史莱姆 1）死亡 → 落点零液
//      ③沉降 1.5s 后死亡点 7×7 窗内仍有岩浆格（LiquidSim 承接）+ 岩浆可见（像素判读橙红）
// 运行：SW_ORIGIN=http://localhost:5246 node tools/run-diag.mjs scripts/_bj246-lavasplash.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1024, height: 720 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
// ★探针坑（BJ144 判例）：WelcomeAnnounce z-60 拦截画面——预种 ack 键
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
// 专家世界（Main.expertMode=世界难度轴——泼岩浆门1 :86561 第一臂）
await page.evaluate(async () => { await window.__swGame.newWorld('bj246', 4200, 1200, () => {}, { difficulty: 1 }); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未就绪'); process.exit(1); }

const boot = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const p = g.player;
  const st = g.world.store;
  const readTile = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= st.w || ty >= st.h) return null;
    const i = st.idx(tx, ty);
    return { liquid: st.liquid[i], type: st.liquidType[i], tile: st.type[i], active: st.flags[i] !== 0 };
  };
  const trunc16 = (px) => Math.trunc(px / 16);
  // 选位：玩家附近找一根地表柱，其上方 ≥2 行空气（tile==0 ∧ 非实心 ∧ 无液）——
  // 熔岩史莱姆底面锚贴地表（fromVanilla 中心锚：e.y = 地表行顶 − h/2）
  const pcol = Math.trunc(p.x / 16);
  let spot = null;
  for (let col = pcol + 2; col <= pcol + 10 && !spot; col++) {
    let sy = -1;
    for (let y = 20; y < st.h - 20; y++) {
      if (st.isSolid(col, y)) { sy = y; break; }
    }
    if (sy < 0) continue;
    let free = true;
    for (let k = 1; k <= 2 && free; k++) {
      const t = readTile(col, sy - k);
      // 原版泼岩浆门只查 !SolidTile ∧ liquid==0（树上格=非实心可泼）——同谓词选位
      if (!t || t.liquid !== 0 || st.isSolid(col, sy - k)) free = false;
    }
    if (free) spot = { col, sy };
  }
  if (!spot) return { fail: 'no-free-surface-column' };
  const e = Enemy.fromVanilla(59, 0, 0);
  if (!e) return { fail: 'fromVanilla(59)' };
  e.x = spot.col * 16 + 8 - e.w / 2;
  e.y = spot.sy * 16 - e.h / 2;
  g.entities.add(e, 'enemies');
  const t0 = performance.now();
  while (performance.now() - t0 < 800) await new Promise((r) => setTimeout(r, 50));
  const ctx = { x: e.x, y: e.y, w: e.w, h: e.h, expert: g.world.difficulty };
  const [tx, ty] = [trunc16(e.x + e.w / 2), trunc16(e.y + e.h / 2)];
  const pre = readTile(tx, ty);
  if (st.isSolid(tx, ty) || pre.liquid !== 0) return { fail: '中心格非空', pre, ctx, tx, ty };
  // 致死（首击无敌帧零）→ HitEffect life<=0 支泼岩浆
  e.hurt(e.hp + 9999, 1, 0, g);
  const post = readTile(tx, ty);
  // 对照弹：绿史莱姆 1 非岩浆族——死亡落点零泼（同款地表锚选位,玩家另一侧）
  let ctrl = null;
  let spot1 = null;
  for (let col = pcol - 2; col >= pcol - 10 && !spot1; col--) {
    let sy = -1;
    for (let y = 20; y < st.h - 20; y++) {
      if (st.isSolid(col, y)) { sy = y; break; }
    }
    if (sy < 0) continue;
    let free = true;
    for (let k = 1; k <= 2 && free; k++) {
      const t = readTile(col, sy - k);
      if (!t || t.liquid !== 0 || st.isSolid(col, sy - k)) free = false;
    }
    if (free) spot1 = { col, sy };
  }
  const e1 = spot1 ? Enemy.fromVanilla(1, 0, 0) : null;
  if (e1 && spot1) {
    e1.x = spot1.col * 16 + 8 - e1.w / 2;
    e1.y = spot1.sy * 16 - e1.h / 2;
    g.entities.add(e1, 'enemies');
    await new Promise((r) => setTimeout(r, 300));
    const [cx1, cy1] = [trunc16(e1.x + e1.w / 2), trunc16(e1.y + e1.h / 2)];
    e1.hurt(e1.hp + 9999, 1, 0, g);
    ctrl = { tx: cx1, ty: cy1, ...readTile(cx1, cy1) };
  }
  g.camera.x = tx * 16 + 8; g.camera.y = ty * 16 + 8;
  return { ctx, tx, ty, pre, post, ctrl };
});
console.log('BJ246=' + JSON.stringify(boot));
if (boot.fail) { console.log('boot fail'); await browser.close(); process.exit(1); }

// 沉降 1.5s：死亡点 7×7 窗内岩浆格计数（LiquidSim 承接面）
const settle2 = await new Promise((resolve) => {
  setTimeout(async () => {
    const r = await page.evaluate((tx0, ty0) => {
      const g = window.__swGame;
      const st = g.world.store;
      let lavaCells = 0, lavaAmt = 0;
      for (let dx = -3; dx <= 3; dx++) {
        for (let dy = -3; dy <= 3; dy++) {
          const tx = tx0 + dx, ty = ty0 + dy;
          if (tx < 0 || ty < 0 || tx >= st.w || ty >= st.h) continue;
          const i = st.idx(tx, ty);
          if (st.liquidType[i] === 2 && st.liquid[i] > 0) { lavaCells++; lavaAmt += st.liquid[i]; }
        }
      }
      return { lavaCells, lavaAmt };
    }, boot.tx, boot.ty);
    resolve(r);
  }, 1500);
});
console.log('SETTLE=' + JSON.stringify(settle2));

await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/bj246-lava-splash.png' });
// 岩浆像素判读（画面中心 1/3 区：橙红岩浆色占比）
const lava = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const x0 = Math.floor(cv.width / 3), y0 = Math.floor(cv.height / 3);
  const wd = Math.floor(cv.width / 3), ht = Math.floor(cv.height / 3);
  const img = ctx.getImageData(x0, y0, wd, ht).data;
  let n = 0, tot = 0;
  for (let i = 0; i < img.length; i += 4) {
    const r = img[i], gg = img[i + 1], b = img[i + 2];
    tot++;
    if (r > 170 && b < 120 && r > b + 90) n++;   // 岩浆橙红
  }
  return { lavaPct: +(100 * n / tot).toFixed(2) };
});
console.log('LAVAPIX=' + JSON.stringify(lava));
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
const amt = boot.post?.liquid ?? -1;
const ok = amt >= 50 && amt < 150 && boot.post?.type === 2
  && (!boot.ctrl || (boot.ctrl.liquid === 0 && boot.ctrl.type === 0))
  && settle2.lavaCells >= 1 && lava.lavaPct >= 0.3 && errors.length === 0;
console.log(ok ? 'PROBE=PASS' : 'PROBE=CHECK');
await browser.close().catch(() => {});
process.exit(ok ? 0 : 2);
