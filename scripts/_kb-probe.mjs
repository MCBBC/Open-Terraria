// 玩家受击击退回归探针:直接 damagePlayer → 采样 vx/vy 演化。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const out = {};
  // 站定不按键,直接受击(敌人从右侧打 → 击退应向左 vx=-4.5 / vy=-3.5)
  p.inv.slots[0] = null;
  g.input.mouseX = 0; g.input.mouseY = 0;
  const hp0 = p.hp;
  const r = g.damagePlayer(20, p.cx + 40, p.cy, undefined, true);
  out.hit = { dmg: r, hp0, hp1: p.hp, vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
    iframes: p.iframes, dead: p.dead };
  // 后续 10 tick 速度演化(不按方向键 → 摩擦衰减,但首 tick 应保留击退值)
  out.evo = [];
  for (let i = 0; i < 10; i++) {
    await new Promise((res) => setTimeout(res, 16));
    out.evo.push([+p.vx.toFixed(2), +p.vy.toFixed(2)]);
  }
  // 场景2:真实敌怪接触(绿史莱姆放身旁)
  p.iframes = 0;
  const e = g.spawnEnemy('slime_green', p.x + 24, p.y);
  if (e) {
    const hpA = p.hp;
    await new Promise((res) => setTimeout(res, 200));
    out.contact = { hpA, hpB: p.hp, vx: +p.vx.toFixed(2), vy: +p.vy.toFixed(2),
      overlap: !!(e.x < p.x + p.w && e.x + e.w > p.x && e.y < p.y + p.h && e.y + e.h > p.y) };
    e.dead = true;
  }
  // 场景3:按住方向键时受击(击退 vs 移动输入竞争)
  p.iframes = 0;
  g.input.keys = g.input.keys || {};
  const setKey = (code, down) => { if (down) g.input.keydown?.({ code, preventDefault(){} }); else g.input.keyup?.({ code, preventDefault(){} }); };
  // 用内部 input 状态直接置(绕过事件系统):查 input 结构
  out.inputApi = Object.keys(g.input).filter((k) => k.toLowerCase().includes('key') || k.toLowerCase().includes('down')).slice(0, 8);
  return out;
});
console.log(JSON.stringify(res, null, 1));
const h = res.hit;
check('受击成功扣血', h.hp1 < h.hp0, JSON.stringify(h));
check('击退 vx 弹开(向远侧 ±4.5)', Math.abs(h.vx) >= 4, `vx=${h.vx}`);
check('击退 vy 弹起(-3.5)', Math.abs(h.vy + 3.5) < 0.3, `vy=${h.vy}`);
const e1 = res.evo[0];
check('次 tick 击退速度仍可见(非瞬归零)', Math.abs(e1[0]) >= 2 || Math.abs(e1[1]) >= 1, `evo[0]=${e1}`);
if (res.contact) {
  check('敌怪接触也扣血+击退', res.contact.hpB < res.contact.hpA && (Math.abs(res.contact.vx) >= 2 || Math.abs(res.contact.vy) >= 1),
    JSON.stringify(res.contact));
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 150));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
