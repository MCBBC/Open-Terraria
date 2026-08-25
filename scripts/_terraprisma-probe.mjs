// _terraprisma-probe:泰拉棱镜(5005→946) AI_156 行为实测
// 原版(:52425-52760):待机=肩上一字排开(MountedCenter+dir×(−22,28..)+上方 15px
// 微摆)+1/20 起手;攻击=跃空段(80→41 升空扑越)+弧刀段(39→0 绕敌半圆)+链式换目标;
// 每轮每敌一次(localNPCHitCooldown=−1,StartAttack 复位)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const log = {};
  const key = Object.keys(window.__swItems).find((k) => /^vi_5005_/.test(k));
  if (!key) return { err: 'no vi_5005' };
  const p = g.player;
  p.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
  p.inv.selected = 0;
  p.useTime = 0;
  p.buffs.apply(57, 3600);   // Summoning +1 槽
  p.buffs.apply(26, 3600);   // Bewitched +1 槽 → maxMinions=3
  // 连续按 3 次召 3 只(每次 useTime 冷却间退)
  for (let i = 0; i < 3; i++) {
    g.input.mouseDown = true;
    await new Promise((r) => setTimeout(r, 80));
    g.input.mouseDown = false;
    p.useTime = 0;
    await new Promise((r) => setTimeout(r, 120));
  }
  await new Promise((r) => setTimeout(r, 1500));   // 待机收敛
  const sample = () => g.entities.projectiles
    .filter((q) => q.projId === 946)
    .map((m) => ({
      x: Math.round(m.cx - p.cx), y: Math.round(m.cy - p.cy),
      rot: Math.round((m.rot || 0) * 100) / 100, a0: m.tA0,
    }));
  log.idle = sample();
  log.idleCount = log.idle.length;
  // 放假人(召唤测试假人)打——用 spawnNpcByVanilla 或直接找现有敌
  // 简化:直接观察攻击状态机是否随敌出现启动(用 Game 测试钩子造敌)
  let spawned = false;
  try {
    const testDummy = Object.keys(window.__swItems).find((k) => /vi_5065_|testDummy/.test(k));
    void testDummy;
    // 用 Game 内部召唤(若有):否则跳过攻击观察
  } catch { /* ignore */ }
  void spawned;
  // 观察 3s:有无攻击状态(a0 变化)
  const a0set = new Set();
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    for (const m of g.entities.projectiles) {
      if (m.projId === 946) a0set.add(m.tA0);
    }
  }
  log.a0Seen = [...a0set].sort();
  return log;
});
console.log('实测:', JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const idle = out.idle ?? [];
check('召出 3 只泰拉棱镜', out.idleCount === 3, `实际 ${out.idleCount}`);
// 肩上一字排开:y 均在玩家上方(−15±摆动),x 依次 −22/−28/−34(右向)或镜像
const ysOk = idle.length > 0 && idle.every((s) => s.y < 0);
check('待机位:全部在玩家上方(y<0)', ysOk, JSON.stringify(idle));
const xs = idle.map((s) => s.x).sort((a, b) => a - b);
const xsOk = idle.length === 3 && Math.abs(xs[1] - xs[0]) >= 4 && Math.abs(xs[2] - xs[1]) >= 4;
check('待机位:一字排开(x 等距错列)', xsOk, `x=${xs.join(',')}`);
console.log(`\n${pass} pass / ${fail} fail`);
if (errors.length) console.log('[pageerror]', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
