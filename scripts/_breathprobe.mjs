// 呼吸计 1:1 冒烟：水下 breath 递减 + 头顶 10 气泡 UI（DrawInterface_Resources_Breath）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 初始态：breath=200（breathMax 200）
const init = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { breath: p.breath, breathMax: p.breathMax, hp: p.hp };
});
check('初始 breath=breathMax=200', init.breath === 200 && init.breathMax === 200, JSON.stringify(init));

// 注水没顶：密封水箱（石壳包裹，防液体 sim 排走；地板=脚下实心地面）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const cx = Math.floor(p.cx / 16);
  const feet = Math.floor((p.y + p.h) / 16); // 脚下地面行
  const top = feet - 7;                       // 内腔顶（top..feet-1 共 7 行内腔）
  for (let j = top - 1; j <= feet; j++) {
    for (let i = cx - 4; i <= cx + 4; i++) {
      const shell = j === top - 1 || i === cx - 4 || i === cx + 4;
      st.setTile(i, j, shell ? 3 /* stone */ : 0);
      st.setLiquid(i, j, 0, 0);
    }
  }
  for (let j = top; j <= feet - 1; j++) {
    for (let i = cx - 3; i <= cx + 3; i++) st.setLiquid(i, j, 255, 1);
  }
});
await new Promise((r) => setTimeout(r, 3000));
const mid = await page.evaluate(() => {
  const p = window.__swGame.player;
  return { breath: p.breath, hp: p.hp, headUnder: p.headUnderwater };
});
// 3s≈180tick → 期望 ≈200-25=175（首帧结算浮动），落在 150..195
check('密封水箱 3s breath 递减（150<breath<195）', mid.breath < 195 && mid.breath > 150, JSON.stringify(mid));

// 截图（头顶 UI 区）
const shot = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(p.cx, p.y);
  return { sx, sy, zoom: cam.zoom, viewW: cam.viewW, breath: p.breath };
});
const canvas = await page.$('canvas');
const box = await canvas.boundingBox();
const clip = {
  x: Math.max(0, box.x + shot.sx - 220),
  y: Math.max(0, box.y + shot.sy - 160),
  width: 440, height: 220,
};
await page.screenshot({ path: '/tmp/breath-bubbles.png', clip });
check('截图已存 /tmp/breath-bubbles.png（breath=' + shot.breath + '）', true, JSON.stringify(shot));

// 出水回补：拆箱清液，1.3s 后应回满（+3/tick → 缺口 ≤50 需 ≤17tick）
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const st = g.world.store;
  const cx = Math.floor(p.cx / 16);
  const feet = Math.floor((p.y + p.h) / 16);
  for (let j = feet - 9; j <= feet; j++) {
    for (let i = cx - 5; i <= cx + 5; i++) {
      st.setTile(i, j, 0);
      st.setLiquid(i, j, 0, 0);
    }
  }
  p.y -= 4; // 拆地板后抬一点防掉落卡顿
});
await new Promise((r) => setTimeout(r, 1300));
const regen = await page.evaluate(() => window.__swGame.player.breath);
check('出水 ~1.2s 回满（breath+=3/tick）', regen === 200, `breath=${regen}`);

check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 300));

console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
