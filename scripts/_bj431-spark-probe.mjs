// BJ431 火花魔棒（Wand of Sparking, item 3069 → proj 954）实报探针。
// 布景:地表平地 → 给 3069 放 0 号快捷栏 → 朝右发射 →
//   ① 出膛 ~0.25s / ~1.2s 两拍截图（观感:原版=纯火尘尾迹小火花,弹体不可见）
//   ② 弹体台账:projId 954 的 Arrow 存活 tick / alpha / 屏上可见性(drawGlobalAlpha)
//   ③ 尘台账:游戏内 1s 窗口的 d6(Fire) 产尘计数
// 用法: SW_ORIGIN=http://localhost:5761 node tools/run-diag.mjs scripts/_bj431-spark-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.BJ431_OUT ?? '/tmp/bj431';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('火花');
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
  await page.keyboard.type('431');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
for (const b of await page.$$('button')) { const t = await b.evaluate((el) => el.textContent || ''); if (/我知道了/.test(t)) { await b.click(); break; } }

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const internalOf = (vid) => window.__swItems[VANILLA_ITEM_KEY_BY_ID[vid]];
  // 地表平地站位
  const col = 400;
  let sy = 40;
  while (sy < st.h - 60 && !(st.flags[st.idx(col, sy)] && st.isSolid(col, sy))) sy++;
  g.player.x = col * 16 + 8 - g.player.w / 2;
  g.player.y = (sy - 4) * 16;
  g.player.vx = 0; g.player.vy = 0;
  // 清出射击走廊:弹心水平 ±460px、竖直 ±170px 全清(两拍弹道不被地形截断)
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  for (let tx = px - 6; tx <= px + 30; tx++) {
    for (let ty = py - 10; ty <= py + 10; ty++) {
      if (st.inBounds(tx, ty)) st.setTileSilent(tx, ty, 0, 0, 0);
    }
  }
  const iid = internalOf(3069);
  if (iid == null) return { fail: 'item 3069 not registered' };
  g.player.inv.add(iid, 1);
  const slots = g.player.inv.slots;
  const bi = slots.findIndex((it) => it && it.id === iid);
  if (bi > 0) { const t = slots[0]; slots[0] = slots[bi]; slots[bi] = t; }
  g.player.inv.selected = 0;
  g.player.useTime = 0;
  // 朝右瞄准发射(按住到 useTime 走完=一发,autoReuse=false)
  g.input.mouseX = (g.camera ? g.camera.worldToScreen(g.player.cx + 220, g.player.cy)[0] : g.player.cx + 220);
  g.input.mouseY = (g.camera ? g.camera.worldToScreen(g.player.cy === 0 ? 0 : g.player.cy, g.player.cy)[1] : g.player.cy);
  // 直接给屏幕坐标:玩家中心往右 220px
  try {
    const [sx, sy2] = g.camera.worldToScreen(g.player.cx + 220, g.player.cy);
    g.input.mouseX = sx; g.input.mouseY = sy2;
  } catch { g.input.mouseX = 640 + 220; g.input.mouseY = 400; }
  // 尘计数窗口
  window.__bj431dust = 0;
  const origDust = g.spawnDust?.bind(g);
  if (origDust) {
    g.spawnDust = (...args) => {
      if (args[4] === 6) window.__bj431dust++;
      return origDust(...args);
    };
  }
  g.input.mouseDown = true;
  await new Promise((r) => setTimeout(r, 220));
  g.input.mouseDown = false;
  // 弹体台账 @~0.35s
  const snap = () => {
    const out = [];
    for (const p of (g.entities?.projectiles ?? [])) {
      if (p?.projId === 954 && !p.dead) {
        let ga = null;
        try { ga = p.drawGlobalAlpha(); } catch { ga = 'err'; }
        out.push({ x: +p.cx.toFixed(1), y: +p.cy.toFixed(1), vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
          alpha: p.alpha, life: p.life, age: p.age, drawGlobalAlpha: ga,
          spriteVisible: ga === null ? true : ga > 0 });
      }
    }
    return out;
  };
  const early = snap();
  const dustEarly = window.__bj431dust;
  return { early, dustEarly, holder: (() => { const h = g.player.inv.heldItem?.(); return h ? { vid: window.__swDefs?.[h.id]?.vid ?? null } : null; })(), mana: g.player.mana, spawned: true, snapFn: !!snap };
}).catch((e) => ({ fail: String(e) }));

// 弹体不可从 evaluate 闭包带出 → 二次 evaluate 轮询台账
const ledger = await page.evaluate(async () => {
  const g = window.__swGame;
  const read = () => {
    const out = [];
    for (const p of (g.entities?.projectiles ?? [])) {
      if (p?.projId === 954 && !p.dead) {
        let ga = null;
        try { ga = p.drawGlobalAlpha(); } catch { ga = 'err'; }
        out.push({ vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2), alpha: p.alpha, life: p.life, age: p.age, drawGlobalAlpha: ga, spriteVisible: ga === null ? true : ga > 0 });
      }
    }
    return out;
  };
  const t350 = read();                       // ~出膛后
  const dust350 = window.__bj431dust;
  await new Promise((r) => setTimeout(r, 850));
  const t1200 = read();
  const dust1200 = window.__bj431dust;
  await new Promise((r) => setTimeout(r, 1800));
  const t3000 = read();
  return { t350, dust350, t1200, dust1200, t3000 };
});

// 截图两拍(重新发一发用于截图观感)
await page.evaluate(() => {
  const g = window.__swGame;
  try {
    const [sx, sy2] = g.camera.worldToScreen(g.player.cx + 220, g.player.cy);
    g.input.mouseX = sx; g.input.mouseY = sy2;
  } catch { /* ignore */ }
  g.input.mouseDown = true;
});
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/bj431-early.png` });
await new Promise((r) => setTimeout(r, 900));
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await page.screenshot({ path: `${OUT}/bj431-late.png` });

console.log('BJ431 result:', JSON.stringify({ res, ...ledger }, null, 1));
await browser.close();
