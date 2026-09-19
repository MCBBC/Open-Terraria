// 远景背景过渡实机探针（2026-09-19 用户实报"群系切换远景背景瞬切"）：
// ①走动面：扫出出生群系→最近群系边界 → 玩家逐帧步进跨界 → 采样
//   biomeBg.bgStyle/bgDelay/alphaFront 每拍值（过渡 = 旧槽 1→0 新槽 0→1 各 0.05/帧
//   交叉淡化 + 黑闪遮罩）→ 过渡中帧截图（目视：新旧背景叠加半透明,非瞬切露天空）。
// ②传送面：startCameraTransitionForPlayerTeleport 远距黑幕（BJ103-A1b/BJ108）→
//   黑幕拍截图（背景应已瞬切:新槽 α=1 旧槽=0,无半透明中间帧）+ 落地拍截图。
// 本脚本只出数据+截图不断言;判读由报告层做。GPU 页禁 trace。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/bgx-probe';
mkdirSync(OUT, { recursive: true });
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log('SHOT', name);
};

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
// 关掉首生欢迎弹窗（盖住画面）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find((x) => /我已知晓/.test(x.textContent ?? ''));
  if (b) b.click();
});
await new Promise((r) => setTimeout(r, 1500));

const bgState = () => page.evaluate(() => {
  const bg = window.__swGame.renderer.biomeBg;
  const want = bg.preferredStyle
    ? undefined : undefined;
  return {
    bgStyle: bg.bgStyle, bgDelay: +bg.bgDelay.toFixed(2), instantBG: bg.instantBG,
    alphaFront: bg.alphaFront.map((v) => +v.toFixed(3)),
    alphaFar: bg.alphaFar.map((v) => +v.toFixed(3)),
    blackFadeIn: window.__swGame.renderer.blackFadeIn,
  };
});

// ---- ①找群系边界：出生点群系旗标 vs 逐步远移采样（每步落表面安全点,等场景重扫）----
const surfY = (x) => page.evaluate((xx) => {
  const g = window.__swGame;
  const st = g.world.store;
  for (let y = 20; y < g.world.groundLevel + 80; y++) {
    if (st.isSolid(xx, y)) return y;
  }
  return Math.floor(g.world.groundLevel);
}, x);

const zoneAt = async (x) => {
  const y = await surfY(x);
  await page.evaluate(({ xx, yy }) => {
    const g = window.__swGame;
    g.player.x = xx * 16 - g.player.w / 2;
    g.player.y = (yy - 3) * 16 - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    g.player.hp = g.player.maxHp; g.player.dead = false; g.player.deadTime = 0;   // 探针不死
  }, { xx: x, yy: y });
  await new Promise((r) => setTimeout(r, 220));
  return page.evaluate(() => {
    const s = window.__swGame.renderer.scene ?? window.__swGame.scene;
    return {
      corrupt: !!s.zoneCorrupt, crimson: !!s.zoneCrimson, jungle: !!s.zoneJungle,
      snow: !!s.zoneSnow, desert: !!s.zoneDesert, hallow: !!s.zoneHallow,
      beach: !!s.zoneBeach, mushroom: !!s.zoneGlowshroom,
    };
  });
};

const spawnX = await page.evaluate(() => Math.floor(window.__swGame.player.cx / 16));
const home = await zoneAt(spawnX);
const key = (z) => JSON.stringify(z);
console.log('HOME', spawnX, key(home));
let boundary = null;
const w = await page.evaluate(() => window.__swGame.world.store.w);
for (let x = spawnX + 120; x < w - 200; x += 100) {
  const z = await zoneAt(x);
  if (key(z) !== key(home)) {
    // 二分细化到 ±25 tile
    let lo = x - 100, hi = x;
    while (hi - lo > 25) {
      const mid = (lo + hi) >> 1;
      if (key(await zoneAt(mid)) === key(home)) lo = mid; else hi = mid;
    }
    boundary = hi;
    console.log('BOUNDARY', boundary, 'FROM', key(home), 'TO', key(await zoneAt(boundary + 30)));
    break;
  }
}
if (!boundary) { console.log('NO_BOUNDARY_FOUND'); await browser.close(); process.exit(2); }

// ---- ②走动跨界：从界前 500 tile 步进到界后 120 tile（5px/拍 ≈ 60Hz）----
const dir = 1;
const startX = boundary - 500 * dir;
const endX = boundary + 500 * dir;   // 跨界后须再走 ~150+ tile:翻转有 30 帧延迟钟
let y0 = await surfY(startX);
await page.evaluate(({ xx, yy }) => {
  const g = window.__swGame;
  g.player.x = xx * 16 - g.player.w / 2;
  g.player.y = (yy - 3) * 16 - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp; g.player.dead = false; g.player.deadTime = 0;
}, { xx: startX, yy: y0 });
await new Promise((r) => setTimeout(r, 1200));   // 稳态
console.log('WALK_START', JSON.stringify(await bgState()));
await shot(page, 'walk-0-before');

let captured = 0, prevStyle = null;
const log = [];
for (let x = startX; x <= endX && captured < 3; x += 3 * dir) {
  await page.evaluate((xx) => {
    const g = window.__swGame;
    g.player.x = xx * 16 - g.player.w / 2;
    g.player.vx = 0;
    g.player.hp = g.player.maxHp; g.player.dead = false; g.player.deadTime = 0;   // 探针不死
    const st = g.world.store;
    // 贴地:防止跨断崖悬空掉落拖慢镜头（只调 y,每 8 拍一次）
    if ((xx & 7) === 0) {
      for (let y = 20; y < g.world.groundLevel + 120; y++) {
        if (st.isSolid(Math.floor(xx), y)) { g.player.y = (y - 3) * 16 - g.player.h; break; }
      }
    }
  }, x);
  await new Promise((r) => setTimeout(r, 16));
  const s = await bgState();
  const act = s.alphaFront.map((v, i) => ({ i, v })).filter((e) => e.v > 0.01);
  log.push({ x, style: s.bgStyle, delay: s.bgDelay, act: act.filter((e) => e.i < 16) });
  const oldSlot = act.find((e) => e.v > 0.5);
  const newSlot = act.find((e) => e.v > 0.05 && e.v < 0.9 && (!oldSlot || e.i !== oldSlot.i));
  if (s.bgStyle !== prevStyle) console.log('FLIP_AT', x, JSON.stringify(s.alphaFront));
  prevStyle = s.bgStyle;
  // 中段抓帧:双槽同时显著（0.25..0.8）= 交叉淡化进行中
  const two = act.filter((e) => e.v > 0.2 && e.v < 0.85);
  if (two.length >= 2 && captured === 0) {
    await shot(page, 'walk-1-mid-crossfade');
    captured++;
  } else if (two.length >= 1 && captured === 1) {
    await shot(page, 'walk-2-late-crossfade');
    captured++;
  }
}
console.log('WALK_END', JSON.stringify(await bgState()));
await shot(page, 'walk-3-after');
console.log('WALK_LOG', JSON.stringify(log.filter((_, i) => i % 12 === 0)));

// ---- ③传送黑幕面：远距 startCameraTransitionForPlayerTeleport（BJ103-A1b/BJ108）----
const tp = await page.evaluate(() => {
  const g = window.__swGame;
  const oldX = g.player.x, oldY = g.player.y;
  // 目标:回出生点方向 4000 tile 外（必异群系+必超黑幕阈）
  const tx = Math.max(200, spawnX0());
  function spawnX0() { return Math.floor(g.player.cx / 16) - 4000; }
  const st = g.world.store;
  let ty = Math.floor(g.world.groundLevel);
  const px = Math.floor(tx);
  for (let y = 20; y < g.world.groundLevel + 120; y++) {
    if (st.isSolid(px, y)) { ty = y; break; }
  }
  g.player.x = tx * 16 - g.player.w / 2;
  g.player.y = (ty - 3) * 16 - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp; g.player.dead = false; g.player.deadTime = 0;
  g.startCameraTransitionForPlayerTeleport(oldX, oldY);
  return { oldX, oldY, tx, ty };
});
console.log('TELEPORT', JSON.stringify(tp));
await new Promise((r) => setTimeout(r, 80));       // 黑幕最浓拍
console.log('TP_FADE_STATE', JSON.stringify(await bgState()));
await shot(page, 'tp-1-blackfade');
await new Promise((r) => setTimeout(r, 1500));
console.log('TP_SETTLED_STATE', JSON.stringify(await bgState()));
await shot(page, 'tp-2-after');
await browser.close();
console.log('DONE');
process.exit(0);
