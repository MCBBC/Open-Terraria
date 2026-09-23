// ★BJ303 用户实报复现探针：装备反重力钩（vid 2800 / 弹 446）→ KeyE 发射 → 帧循环崩停机。
// 用户报错：TypeError: Cannot read properties of undefined (reading 'world')（跨域序列化丢栈）。
// 行为链（F5 report behaviorTail）：KeyE ×3 → projectiles 21189/21190/21191 连发 → 停机。
// 复现路径：装备槽 miscEquips[4] 置反重力钩 → useEquippedGrapple（KeyE 真实入口）×3 →
// 步进帧循环观察 __swErrors/running。
// 对照组：普通钩 84（无 lineLight）同路径 → 期望不炸。
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + String(e.stack ?? e.message).slice(0, 600)));

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));

await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world && window.__swTiles));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}

const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const IK = window.__swItems;
  const agKey = Object.keys(IK).find((k) => /^vi_2800_/.test(k));
  const hookKey = Object.keys(IK).find((k) => /^vi_84_/.test(k));
  if (!agKey || !hookKey) return { fail: 'items', agKey, hookKey };
  // 装备反重力钩（miscEquips[4] = 钩爪槽）
  p.inv.miscEquips[4] = { id: IK[agKey], stack: 1 };
  // 平地：防发射期意外撞地（悬空场景近似用户空岛位）
  return { ok: true, agKey, hookKey, misc4: p.inv.miscEquips[4]?.id ?? null };
});
console.log('[setup]', JSON.stringify(setup));
if (!setup.ok) { await browser.close(); process.exit(1); }

// A 组：反重力钩 —— KeyE 真实入口连发 3 发（复刻 behaviorTail 三连发）
const ag = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  const errBefore = (window.__swErrors ?? []).length;
  for (let i = 0; i < 3; i++) { g.useEquippedGrapple(0, -1); await wait(50); }
  // 步进 120 帧（真 rAF 已停则手动步进也难——读 running 与错误环）
  await wait(1200);
  const errs = (window.__swErrors ?? []).slice(errBefore).map((e) => ({
    msg: String(e.msg ?? e.message ?? '').slice(0, 300),
    stack: String(e.stack ?? '').slice(0, 1200),
  }));
  return {
    running: g.running,
    hookCount: g.player.grappleProjs.length,
    ai0s: g.player.grappleProjs.map((x) => x.ai0),
    errs,
  };
});
console.log('[A-antigrav]', JSON.stringify(ag, null, 2));

// B 组（若 A 组炸停机则重启世界再测）：普通钩 84 对照
const ctl = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  if (!g.running) return { skip: 'game-stopped' };
  const errBefore = (window.__swErrors ?? []).length;
  g.fireGrapple(84, 0, -1);
  await wait(800);
  const errs = (window.__swErrors ?? []).slice(errBefore).map((e) => String(e.msg ?? e.message ?? '').slice(0, 200));
  return { running: g.running, hookCount: g.player.grappleProjs.length, errs };
});
console.log('[B-normal-hook]', JSON.stringify(ctl));
console.log('[pageerrors]', JSON.stringify(errs, null, 2));
await browser.close();
