// BJ247 实机探针：彩虹魔杖(495→79) 拖尾 1:1 移植取证（旧 stroke 粗椭圆团串退役）。
// ① 巡航相：直飞 40 拍 → 截图（细彩虹光线带,SM2 obj55 侵蚀=1:1 RainbowRodDrawer）
// ② 环绕相：channel 追绕圈光标 90 拍 → 截图（Catmull-Rom 补间平滑彩带）
// ③ 悬停相：白团本体+六团彩虹光环（Main.cs:33231+33498）
// ④ 厚度直方图：路径横切面饱和彩像素行数——粗椭圆旧实现≈40-64px,1:1 细光线≤~20px
// ★教训（本刀首跑）：rAF 循环在 evaluate await 期间照跑——弹体多飞 ~36 拍撞墙死亡、
//   截图拍到的是已出链实体=全零。所有 wait 必须 paused=true 冻结。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
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
  await page.keyboard.type('BJ247探针');
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
  await page.keyboard.type('bj247probe');
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

// 开阔平地走廊（飞行道清空+落地后冻结；y 基准=玩家【落稳后】的 cy）
const prep = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -420; dx <= 420; dx++) {
    for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);      // 让玩家落稳
  g.paused = true;
  return { px0, gy, pcy: Math.round(g.player.cy) };
});
console.log('prep', JSON.stringify(prep));

// ---------- ① 巡航相（细彩虹光线） ----------
const cruise = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const y0 = g.player.cy - 56;
  const m = new MagicMissileProj(g.player.cx - 160, y0, 20, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => false, aimCb: () => ({ x: g.player.cx + 8000, y: y0 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 40; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));            // Extra 贴图懒加载落地（冻结态）
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);       // 2 拍=SM2 真值面入画
  g.paused = true;
  g.camera.x = m.cx; g.camera.y = m.cy;                    // 头居中：带在中心左侧 ~95px 世界
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('cruise', JSON.stringify(cruise));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bj247-79-cruise.png', clip: { x: 320, y: 200, width: 640, height: 400 } });

// 厚度直方图：头居中,沿带取 3 个横切面（中心左侧 30/60/90 屏幕px）统计饱和彩像素行。
// ★画布有两个 1280×800（世界/主链）——逐个采样,取含饱和带的那个。
const thick = await page.evaluate(() => {
  const cvs = [...document.querySelectorAll('#game-root canvas')]
    .filter((c) => c.width >= 1280 && c.height >= 800);
  const cx = 640, cyMid = 400;
  let best = null;
  for (const cv of cvs) {
    const sc = document.createElement('canvas');
    sc.width = cv.width; sc.height = cv.height;
    const c2 = sc.getContext('2d', { willReadFrequently: true });
    c2.drawImage(cv, 0, 0);
    // 中心行 ±40 全宽扫描：每行饱和像素数与 x 范围
    const bandScan = [];
    for (let dy = -40; dy <= 40; dy += 8) {
      const d = c2.getImageData(0, cyMid + dy, sc.width, 1).data;
      let n = 0, x0 = -1, x1 = -1;
      for (let x = 0; x < sc.width; x++) {
        const i = x * 4, r = d[i], gg = d[i + 1], b = d[i + 2];
        if (Math.max(r, gg, b) - Math.min(r, gg, b) > 60) { n++; if (x0 < 0) x0 = x; x1 = x; }
      }
      if (n > 0) bandScan.push({ dy, n, x0, x1 });
    }
    if (!best || bandScan.reduce((s, q) => s + q.n, 0) > best.bandScan.reduce((s, q) => s + q.n, 0)) {
      const samples = [];
      for (const off of [-30, -60, -90, -200]) {
        const d = c2.getImageData(cx + off, cyMid - 16, 1, 33).data;
        let rows = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          if (Math.max(r, gg, b) - Math.min(r, gg, b) > 60) rows++;
        }
        samples.push({ off, colorfulRows: rows });
      }
      best = { bandScan, samples };
    }
  }
  return { nCanvas: cvs.length, ...best };
});
console.log('trail-thickness', JSON.stringify(thick));

// ---------- ② 环绕相（Catmull-Rom 平滑彩带） ----------
const orbit = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx + 60, cy0 = g.player.cy - 110;
  let t = 0;
  const m = new MagicMissileProj(cx0, cy0, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: cx0 + Math.cos(t * 0.09) * 120, y: cy0 + Math.sin(t * 0.09) * 70 }),
    payMana: () => true,
  });
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.input.mouseDown = true; g.input.mouseHeld = true;
  g.paused = false;
  for (t = 0; t < 90; t++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 700));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  g.camera.x = m.cx; g.camera.y = m.cy;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead, strip: m.strip.length };
});
console.log('orbit', JSON.stringify(orbit));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bj247-79-orbit.png', clip: { x: 320, y: 200, width: 640, height: 400 } });

// ---------- ③ 悬停相（白团本体+光环） ----------
const hover = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const m = new MagicMissileProj(g.player.cx - 80, g.player.cy - 60, 0.01, 0, {
    projId: 79, damage: 50, knockback: 5, useTime: 20,
    channelCb: () => true,
    aimCb: () => ({ x: m0.cx, y: m0.cy }),
    payMana: () => true,
  });
  const m0 = m;
  m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
  g.entities.add(m, 'projectiles');
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  await new Promise((r) => setTimeout(r, 500));
  g.paused = false;
  for (let k = 0; k < 2; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
  g.camera.x = m.cx; g.camera.y = m.cy;
  return { x: Math.round(m.cx), y: Math.round(m.cy), dead: m.dead };
});
console.log('hover', JSON.stringify(hover));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bj247-79-hover.png', clip: { x: 480, y: 240, width: 320, height: 320 } });

console.log('shots: /tmp/bj247-79-cruise.png /tmp/bj247-79-orbit.png /tmp/bj247-79-hover.png');
await browser.close();
process.exit(0);
