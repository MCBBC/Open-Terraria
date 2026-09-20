// ★SW-BJ175b 一次性探针：大宝箱怪拖影（TrailingMode=2）记录面实测 + 跳高过程逐帧截图
//  场景 T1 空中态记录面：ai0=4 飞天历史展开（histXAt 深度差>0）
//  场景 T2 落地清零面：ai0=2 整环=当前位置（vanilla :91935-91942 else 支同相）
//  场景 V  视觉面：清场→475 钉 ai0=4 飞天→每 150ms 截 6 帧存 /tmp/mimic-trail-*.png
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5255';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
await page.goto(ORIGIN + '/?play=small&mimictrail' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) throw new Error('未进游戏');
await new Promise((r) => setTimeout(r, 1200));
// 关欢迎弹窗（挡视口）——按钮文本匹配"我已知晓"
try {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.textContent ?? '').includes('我已知晓'));
    if (b) b.click();
  });
} catch { /* 无弹窗态 */ }
await new Promise((r) => setTimeout(r, 400));
await new Promise((r) => setTimeout(r, 8000));   // 出生清场 settle

const out = {};

// ================= T1+T2：记录面/清零面 =================
out.record = await page.evaluate(async () => {
  const g = window.__swGame;
  const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
  const e = spawnVanillaEnemy(g, 475, g.player.cx + 200, g.player.cy);
  if (!e) return { ok: false };
  e.y -= e.h / 2;
  // 空中态：ai0=4 飞天（AI 每 tick 上浮,历史应展开）
  e.ai0 = 4; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.vx = 0; e.vy = 0;
  await new Promise((r) => setTimeout(r, 40 * 16.6));
  const spreadAir = e.histXAt(2) !== e.histXAt(6) || e.histYAt(2) !== e.histYAt(6);
  const depth = e.historyDepth();
  // 落地：ai0=2 清零
  e.ai0 = 2; e.ai1 = 0; e.vx = 0; e.vy = 0;
  await new Promise((r) => setTimeout(r, 8 * 16.6));
  const allSame = [1, 2, 3, 5, 8].every((i) => e.histXAt(i) === e.x && e.histYAt(i) === e.y);
  g.entities.enemies = g.entities.enemies.filter((n) => n !== e);
  return { ok: true, spreadAir, depth, allSameAfterLand: allSame };
});

// ================= V：视觉面（逐帧截图） =================
{
  // 清杂怪防截图叠影，玩家移到开阔高空再布置
  await page.evaluate(async () => {
    const g = window.__swGame;
    g.entities.enemies.length = 0;
    const p = g.player;
    p.x = Math.round(p.cx / 16) * 16 - 10;   // 原地
    p.y = Math.max(80, p.y - 400);           // 上移到开阔带
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(async () => {
    const g = window.__swGame;
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const p = g.player;
    const e = spawnVanillaEnemy(g, 475, p.cx + 60, p.cy - 120);
    if (!e) return;
    e.y -= e.h / 2;
    e.ai0 = 4; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.vx = 0; e.vy = 0;
  });
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 120));
    try { await page.screenshot({ path: `/tmp/mimic-trail-${i}.png` }); } catch { /* 无头视口 */ }
  }
  out.visual = '6 帧存 /tmp/mimic-trail-0..5.png';
  out.mimicState = await page.evaluate(() => {
    const e = window.__swGame.entities.enemies.find((n) => !n.dead && n.vanillaId === 475);
    return e ? { ai0: e.ai0, depth: e.historyDepth(), spread: e.histXAt(2) !== e.histXAt(6) } : null;
  });
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
