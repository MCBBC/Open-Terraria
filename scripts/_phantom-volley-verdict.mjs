// 幻影弓影子箭方向定谳探针:直构 630 载体(真实 ph630Ctl 契约),瞄准左下方,
// 跑 40 拍采样载体速度/齐射箭速度方向 vs 瞄准方向 —— 判"速度反/同向"
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const r = { aim: { dx: -300, dy: 100 } };   // 瞄准:玩家左下(与截图同向)
  const p = g.player;
  // 清场
  for (const e of g.entities.projectiles) e.dead = true;
  const carrier = new Arrow(p.cx, p.cy, 0, 0, 50, 2, 630, null, { grav: 0 });
  carrier.ph630Ctl = {
    channel: () => true,
    aim: () => ({ x: p.cx + r.aim.dx, y: p.cy + r.aim.dy }),
    volley: () => ({ pid: 1, dmg: 10, kb: 0, speed: 14 }),
  };
  g.entities.add(carrier, 'projectiles');
  const snap = [];
  for (let t = 0; t < 40; t++) {
    g.fixedUpdate(1 / 60);
    if (t === 3 || t === 8 || t === 20) {
      const volleys = [];
      for (const e of g.entities.projectiles) {
        if (e.dead || e === carrier) continue;
        volleys.push({ pid: e.projId, x: +e.x.toFixed(1), y: +e.y.toFixed(1), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), age: e.age });
      }
      snap.push({ t, carrier: { vx: +carrier.vx.toFixed(2), vy: +carrier.vy.toFixed(2) }, volleys });
    }
  }
  r.snaps = snap;
  // 判决:首拍齐射箭位移方向(取样窗内 position 差)与瞄准向量点积
  const v0 = snap[0]?.volleys[0];
  if (v0) {
    const dot = (r.aim.dx * v0.vx + r.aim.dy * v0.vy);
    r.verdict = dot < 0 ? 'REVERSED(速度背向瞄准)' : 'SAME_DIR(速度朝瞄准)';
    r.dot = +dot.toFixed(2);
  }
  return r;
});
console.log('PHANTOM=' + JSON.stringify(out, null, 1));
await browser.close();
