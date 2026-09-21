// ★BJ243 实机探针：熔岩史莱姆（NPC 59）环境火尘面 1:1 复核。
// 断言：①real-time ~2s 内 spawnDust 尘 6 持续发射（原版 :62072 每 tick 1 粒≈60/s）
//      ②受击爆发 ceil(dmg'/lifeMax×80) 簇（:86545）
//      ③截图可见火尘（像素判读 橙/红 火色占比）。
// 运行：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bj243-lavadust.mjs
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
await page.evaluate(async () => { await window.__swGame.newWorld('bj243', 4200, 1200, () => {}); });
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
  // 找玩家脚下地表：把玩家钉在出生点，史莱姆放旁边 3 格
  const sx = p.x, sy = p.y;
  const e = Enemy.fromVanilla(59, sx + 3 * 16, sy - 2 * 16);
  if (!e) return { fail: 'fromVanilla(59)' };
  g.entities.add(e, 'enemies');
  // 环境尘计数（real-time 2s，rAF 自跑）
  let dust6 = 0, dustAll = 0;
  const orig = g.spawnDust.bind(g);
  g.spawnDust = (...a) => { const d = orig(...a); dustAll++; if (d && d.type === 6) dust6++; return d; };
  e.hurt(5, 1, 0, g);                    // 轻伤激愤（贴身站定不跑丢）
  const t0 = performance.now();
  while (performance.now() - t0 < 2000) {
    g.camera.x = e.cx; g.camera.y = e.cy;
    await new Promise((r) => setTimeout(r, 50));
  }
  const ambient = { dust6, dustAll, secs: 2 };
  // 受击爆发：尘面计数单拍
  dust6 = 0; dustAll = 0;
  const hp0 = e.hp;
  e.hurt(20, 1, 0, g);
  const burst6 = dust6, dealt = hp0 - e.hp;
  g.spawnDust = orig;
  return {
    ambient, burst6, burstExpect: Math.ceil((dealt / e.maxHp) * 80), dealt,
    alive: !e.dead, slimeXY: [e.x, e.y],
  };
});
console.log('BJ243=' + JSON.stringify(boot));
if (!boot.ambient) { console.log('boot fail'); await browser.close(); process.exit(1); }

// 截图（相机钉在史莱姆上，火尘 additive 橙红可见）
await page.evaluate(() => {
  const g = window.__swGame;
  const es = g.enemies().filter((o) => o.vanillaId === 59 && !o.dead);
  if (es.length) { g.camera.x = es[0].cx; g.camera.y = es[0].cy; }
});
await new Promise((r) => setTimeout(r, 700));
await page.screenshot({ path: '/tmp/bj243-lava-slime.png' });

// 火色像素判读（相机中心 1/3 区：橙红占比）
const fire = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx = cv.getContext('2d');
  const x0 = Math.floor(cv.width / 3), y0 = Math.floor(cv.height / 3);
  const wd = Math.floor(cv.width / 3), ht = Math.floor(cv.height / 3);
  const img = ctx.getImageData(x0, y0, wd, ht).data;
  let fireN = 0, tot = 0;
  for (let i = 0; i < img.length; i += 4) {
    const r = img[i], gg = img[i + 1], b = img[i + 2];
    tot++;
    if (r > 170 && gg > 40 && gg < 210 && b < 120 && r > b + 90) fireN++;   // 火橙/火红
  }
  return { firePct: +(100 * fireN / tot).toFixed(2) };
});
console.log('FIREPIX=' + JSON.stringify(fire));
console.log('pageerrors:', errors.length ? errors.slice(0, 3) : 'none');
const ok = boot.ambient.dust6 > 60 && boot.burst6 === boot.burstExpect && boot.alive && fire.firePct >= 0.5;
console.log(ok ? 'PROBE=PASS' : 'PROBE=CHECK');
await browser.close().catch(() => {});
process.exit(ok && errors.length === 0 ? 0 : 2);
