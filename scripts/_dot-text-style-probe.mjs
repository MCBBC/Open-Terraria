// 一次性探针:扣血飘字样式对齐原版 CombatText 验证
//  1) Burning buff 端到端:apply → tick 分块 → dot 飘字(hp 按 5 扣/数字 dot=true)
//  2) 三种飘字轨迹断言:普通 vy-7/life60、暴击 vy-14/life120+vx+rot、dot vy-4/life40
//  3) 截图人工核对视觉(scale 生长/alpha 闪烁/dot 偏小)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&dotprobe=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// ---- 1. Burning 端到端(站地狱石场景用 buff 直授,跳过地形摆放)----
const burn = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.hp = g.player.maxHp;                      // 回满(maxHp 计算属性勿硬写)
  g.player.buffs.apply(8, 12);                       // BuffType.Burning
  g.dmgNumbers.length = 0;
  return { hp: g.player.hp, max: g.player.maxHp };
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1200);
const burnMid = await page.evaluate(() => {
  const g = window.__swGame;
  const dots = g.dmgNumbers.map((d) => ({ v: d.value, dot: !!d.dot, life: d.life, vy: Math.round(d.vy * 100) / 100, scale: Math.round((d.scale ?? 1) * 100) / 100, alpha: Math.round((d.alpha ?? 1) * 100) / 100 }));
  return { hp: g.player.hp, hasBuff: g.player.buffs.has(8), dots };
});
await sleep(400);
await page.screenshot({ path: '/tmp/sw-dot-text.png' });
const burnEnd = await page.evaluate(() => ({ hp: window.__swGame.player.hp, alive: window.__swGame.player.hp > 0 }));
// 停火(移除 buff)防止后续采样干扰
await page.evaluate(() => { window.__swGame.player.buffs.remove(8); });

// ---- 2. 三种飘字轨迹 ----
const spawn = await page.evaluate(() => {
  const g = window.__swGame;
  g.dmgNumbers.length = 0;
  const p = g.player;
  g.addDamageNumber(p.cx, p.y - 20, 37, false, '#FF7060');       // 普通
  g.addDamageNumber(p.cx + 40, p.y - 20, 88, true, '#FF8040');   // 暴击
  g.addDamageNumber(p.cx - 40, p.y - 20, 5, false, '#FF3C46', true); // dot
  const s = g.dmgNumbers.map((d) => ({
    v: d.value, crit: d.crit, dot: !!d.dot, life: d.life,
    vy: d.vy, vx: d.vx ?? 0, rot: d.rotation ?? 0, scale: d.scale ?? 1, alpha: d.alpha ?? 1,
  }));
  return s;
});
await sleep(60);   // ≈3-4 fixed tick:生长期早期
const early = await page.evaluate(() => window.__swGame.dmgNumbers.map((d) => ({
  v: d.value, life: d.life, vy: Math.round(d.vy * 1000) / 1000, scale: Math.round((d.scale ?? 1) * 100) / 100, alpha: Math.round((d.alpha ?? 1) * 100) / 100,
})));
await sleep(500);
await page.screenshot({ path: '/tmp/sw-text-styles.png' });
const mid = await page.evaluate(() => window.__swGame.dmgNumbers.map((d) => ({
  v: d.value, life: d.life, vy: Math.round(d.vy * 1000) / 1000, scale: Math.round((d.scale ?? 1) * 100) / 100, alpha: Math.round((d.alpha ?? 1) * 100) / 100,
})));
// 消亡时点:dot ~48t(0.8s)、普通 ~70t(1.17s)、暴击 ~150t(2.5s)
await sleep(1100);
const afterDot = await page.evaluate(() => window.__swGame.dmgNumbers.map((d) => ({ v: d.value, dot: !!d.dot, crit: d.crit })));
await sleep(1500);
const afterNormal = await page.evaluate(() => window.__swGame.dmgNumbers.map((d) => ({ v: d.value })));

// ---- 断言汇总 ----
const A = [];
const ok = (name, cond, extra) => A.push({ name, pass: !!cond, ...extra });
// Burning:1.6s ≈ 48 HP(30HP/s 整块 5);maxHp 可能被满血钳制,按实际 hp0 算差值
const dropped = burn.hp - burnEnd.hp;
ok('burning-hp-drop', dropped >= 40 && dropped <= 56, { dropped, hp0: burn.hp, hp: burnEnd.hp });
ok('burning-dot-entry', burnMid.dots.some((d) => d.dot && d.v === 5), { dots: burnMid.dots.slice(0, 3) });
ok('dot-life40', spawn.find((d) => d.dot)?.life === 40);
ok('dot-vy-neg4', spawn.find((d) => d.dot)?.vy === -4);
ok('dot-scale-0-start', spawn.find((d) => d.dot)?.scale === 0);
ok('normal-life60-vy7', (() => { const n = spawn.find((d) => !d.crit && !d.dot); return n && n.life === 60 && n.vy === -7; })());
ok('crit-life120-vy14', (() => { const c = spawn.find((d) => d.crit); return c && c.life === 120 && c.vy === -14; })());
ok('crit-vx-rot', (() => { const c = spawn.find((d) => d.crit); return c && c.vx !== 0 && Math.abs(c.rot) === 0.12; })());
// 早期:dot scale 应已冲到 0.8 封顶、普通在 0.3-0.5 生长中
const ed = early.find((d) => d.v === 5), en = early.find((d) => d.v === 37);
ok('dot-scale-cap08', ed && ed.scale >= 0.7 && ed.scale <= 0.8, { ed });
ok('normal-scale-growing', en && en.scale > 0 && en.scale < 1, { en });
ok('normal-vy-decay', en && en.vy > -7 && en.vy < -5, { vy: en && en.vy });
// 中期:dot vy 因重力已回升(>-2 甚至转正)
const md = mid.find((d) => d.v === 5);
ok('dot-gravity-rise', md && md.vy > -2, { md });
// 消亡时序
ok('dot-gone-1s', !afterDot.some((d) => d.dot));
ok('normal-gone-2s', !afterNormal.some((d) => d.v === 37));
ok('crit-gone-3s', !afterNormal.some((d) => d.v === 88));
const failed = A.filter((a) => !a.pass);
console.log(JSON.stringify({
  spawn, early, mid, afterDot, afterNormal,
  burn: { hp0: burn.hp, mid: burnMid, end: burnEnd },
  asserts: A, failed: failed.length, errors: errors.slice(0, 3),
}, null, 1));
await browser.close();
process.exit(failed.length ? 1 : 0);
