// ★BJ209 一次性探针 v2：NPC 残影族实机抽样——每步重钉状态（AI 每 tick 覆写，程序化
//  位移+状态保持同步进行），截图时残影沿旧位展开。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.goto(ORIGIN + '/?play=small&bj209probe' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) throw new Error('未进游戏');
await new Promise((r) => setTimeout(r, 1200));
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').includes('我已知晓'));
    if (b) b.click();
  });
} catch { /* 无弹窗 */ }
await new Promise((r) => setTimeout(r, 8000));

const out = {};
const TARGETS = [
  { id: 140, tag: 'mech140',     setup: `e.noGravity=true; e.noTileCollide=true; e.vx=6; e.vy=-0.1;`, per: `e.vx=6; e.vy=-0.1;` },
  { id: 477, tag: 'mothron',     setup: `e.noGravity=true; e.noTileCollide=true; e.vx=12; e.vy=0;`,  per: `e.vx=12; e.vy=0;` },
  { id: 542, tag: 'sandshark',   setup: `e.noGravity=true; e.noTileCollide=true; e.vx=7; e.vy=0;`,   per: `e.vx=7; e.vy=0;` },
  { id: 439, tag: 'cultist',     setup: `e.noGravity=true; e.noTileCollide=true; e.ai0=-1; e.ai1=400; e.vx=5; e.vy=0;`, per: `e.ai0=-1; e.ai1=400; e.vx=5; e.vy=0;` },
  { id: 4,   tag: 'eoc',         setup: `e.noGravity=true; e.noTileCollide=true; e.ai0=3; e.state=4; e.vx=10; e.vy=0;`, per: `e.ai0=3; e.state=4; e.vx=10; e.vy=0;` },
];

for (const t of TARGETS) {
  const r = await page.evaluate(async (t) => {
    const g = window.__swGame;
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    g.entities.enemies.length = 0;
    const p = g.player;
    p.x = Math.round(p.cx / 16) * 16 - 10;
    const e = spawnVanillaEnemy(g, t.id, p.cx + 30, p.cy - 80);
    if (!e) return { ok: false, id: t.id };
    e.y -= e.h / 2;
    try { e.damage = 0; } catch { /* 只读 */ }
    const s = t.setup; { const e2 = e; eval(s); }
    const x0 = e.x, y0 = e.y;
    for (let k = 0; k < 12; k++) {
      e.x += 14;
      const per = t.per; { const e2 = e; eval(per); }   // 每步重钉状态（AI 每 tick 覆写）
      await new Promise((r2) => setTimeout(r2, 34));
    }
    await new Promise((r2) => setTimeout(r2, 50));
    window.__bj209subject = e;
    return { ok: true, id: t.id, depth: e.historyDepth(),
      spread: Math.abs(e.histXAt(1) - e.histXAt(6)), x0, y0, xEnd: e.x, yEnd: e.y };
  }, t);
  out[t.tag] = r;
  if (r.ok) {
    await page.screenshot({ path: `/tmp/bj209v2-${t.tag}.png` });
    await page.evaluate(() => {
      const g = window.__swGame;
      const s = window.__bj209subject;
      g.entities.enemies = g.entities.enemies.filter((n) => n !== s);
    });
    await new Promise((r2) => setTimeout(r2, 200));
  }
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
