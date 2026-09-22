// BJ279 实机探针：彩虹魔杖(495→79) 续发出生锚定谳——贴墙持按连发,取证每个 spawn 盒心。
// 定谳面（BJ279 出生侧）：首发+续发出生盒心都必须=玩家盒中心（原版 :49957 pointPosition,
//   :4209-4235 无旋转恒等中心;循环重用 :42143-42147 重入 ItemCheck_Shoot 同锚）。
// 用户实报复合链：旧 2026-08-26「杖头+aim×18」续发锚残留 → 贴墙续发弹落墙内
//   （玩家半宽 10px..墙远面 26px 段,×18 落 18px=墙内）+ 引导档免死(:19442-19456,
//   BJ277 面正确移植) = 隔墙生成射出。
// 取证：①逐 spawn 记录盒心 vs 玩家盒心（全等=修复相;behavior-log 实测续发=+18.4px 病相）
//       ②spawn 中心格是否落墙柱
//       ③观察面：引导星是否穿越墙远面（BJ277 域,仅记录不断言）
// ★教训（BJ247）：rAF 在 evaluate await 期间照跑——全部驱动走 g.fixedUpdate 显式步进,
//   且 g.paused 手动控制;onAdd 观察口在 entities.add 前已定稿 x/y（placeAtShootSpawn 先行）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ279探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj279probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // ---- 开阔平地走廊（清空+落地后冻结;BJ247 同式） ----
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -140; dx <= 140; dx++) {
    for (let dy = -40; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  // ---- 贴墙：玩家左邻两列实心石墙（1 列=贴脸 1 厚,再 +1 列=2 厚防侧漏） ----
  const wc1 = px0 - 1, wc2 = px0 - 2;
  for (let yy = gy - 14; yy <= gy + 2; yy++) { st.setTile(wc1, yy, 1); st.setTile(wc2, yy, 1); }
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  const P = g.player;
  P.inv.slots[0] = { id: ITEM_BY_KEY['vi_495_RainbowRod'], stack: 1 };
  P.inv.selected = 0;
  P.mana = P.maxMana;
  // ---- 瞄准：墙另一侧（左 -200px）——worldToScreen 与 screenToWorld 互逆,单位一致 ----
  const [sx, sy] = g.camera.worldToScreen(P.cx - 200, P.cy - 10);
  g.input.mouseX = sx; g.input.mouseY = sy;
  // ---- 出生观察口（onAdd 时 x/y 已定稿） ----
  const spawns = [];
  const old = g.entities.onAdd;
  g.entities.onAdd = (e, b) => {
    if (b === 'projectiles') spawns.push({ x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy });
    if (old) old(e, b);
  };
  // ---- 持按连发 150 拍（useTime 25 → 首发+~5 续发） ----
  g.input.mouseDown = true;
  g.input.mouseHeld = true;
  g.paused = false;
  const flight = [];
  for (let t = 1; t <= 150; t++) {
    g.fixedUpdate(1 / 60);
    if (t % 5 === 0) {
      for (const p of g.entities.projectiles) {
        if (p.projId === 79 && !p.dead) flight.push({ t, cx: Math.round(p.cx * 10) / 10 });
      }
    }
  }
  g.paused = true;
  g.input.mouseDown = false; g.input.mouseHeld = false;
  g.entities.onAdd = old;
  const pcx = P.cx, pcy = P.cy;
  const wallFarX = wc2 * 16;                       // 墙远面（左）
  const wallCols = [wc1, wc2];
  const rep = spawns.map((s) => {
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    const col = Math.floor(cx / 16);
    return {
      cx: Math.round(cx * 100) / 100, cy: Math.round(cy * 100) / 100,
      vx: Math.round(s.vx * 100) / 100, vy: Math.round(s.vy * 100) / 100,
      inWallCol: wallCols.includes(col),
      atPlayerCenter: Math.abs(cx - pcx) < 0.01 && Math.abs(cy - pcy) < 0.01,
    };
  });
  return {
    pcx: Math.round(pcx * 100) / 100, pcy: Math.round(pcy * 100) / 100,
    wc1, wc2, wallFarX,
    nSpawn: rep.length,
    spawns: rep,
    throughWallSamples: flight.filter((f) => f.cx < wallFarX).length,
    flightTail: flight.slice(-10),
  };
});
console.log('BJ279', JSON.stringify(out, null, 1));
await browser.close();
process.exit(0);
