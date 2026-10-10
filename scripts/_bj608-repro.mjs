// ★BJ608 真机复现探针（用户物证两件套:十周年纪念种子(1).wld + behavior-log-2026-10-10）。
// 用户实报:「平台好像又有 bug,下落到下一格平台时被强制抬升到上面平台?」
// 场景（行为日志 34665-34875 段):玩家站十周年派对区行 272 长平台 (中心 x=62889,脚=4352),
//   正下方 x=3930 竖列平台 行273/274/275 (16px 间距)。短按 S (~10 tick) → 下沉 ~22px
//   被抬回 4352(日志 34755/34785/34815: y中心 4331→4345→4335→4331 循环)。
// 复现面:导入用户 .wld → 传送玩家到日志站位 → 逐拍记录 y/vy/onGround/dropThrough →
//   ①10-tick 短按 S(失败案) ②18-tick 长按 S(日志 34886 成功落棕榈木 feet=4416) ③短按后梯爬观察。
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0' });

const buf = readFileSync('/tmp/bj608/user.wld');
const b64 = buf.toString('base64');
const boot = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const flow = window.__swFlow;
  if (!flow) return { ok: false, why: 'no __swFlow' };
  await flow.importWld(arr);
  return { ok: true };
}, b64);
console.log('IMPORT:', JSON.stringify(boot));
if (!boot.ok) { await browser.close(); process.exit(1); }
await page.waitForFunction(() => window.__swGame?.player && window.__swGame?.world, { timeout: 120000 });
await page.evaluate(() => {
  const btns = document.querySelectorAll('.sw-panel button');
  if (btns.length) btns[btns.length - 1].click();
});
await page.waitForFunction(() => window.__swGame?.player && window.__swGame?.world?.store, { timeout: 60000 });

// ── 站位 + 逐拍记录器 ──
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  // 日志站位:中心 (62889, 4331) → 左上 (62879, 4310),脚=4352=行272平台顶
  p.x = 62879; p.y = 4310; p.vx = 0; p.vy = 0;
  // 逐拍记录:包一层 fixedUpdate
  const rec = [];
  const orig = g.fixedUpdate.bind(g);
  g.__bj608Rec = rec;
  g.fixedUpdate = (dt) => {
    const pre = { y: p.y, vy: p.vy, g: p.onGround, dt: !!p.dropThrough };
    orig(dt);
    rec.push({ ...pre, postY: p.y, postVy: p.vy, postG: p.onGround });
  };
  // 平台布局取证
  const st = g.world.store;
  const col = [];
  for (let y = 268; y <= 280; y++) {
    const i = st.idx(3930, y);
    col.push(st.flags[i] ? `T${st.type[i]}${st.isPlatform(3930, y) ? 'P' : ''}` : '.');
  }
  return { col: col.join(''), feet0: p.y + p.h };
});
console.log('SETUP:', JSON.stringify(setup));

const kev = (type, code) => page.evaluate((type, code) => {
  window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true, keyCode: 83, which: 83 }));
}, type, code);
const ticks = (n) => page.evaluate((n) => new Promise((res) => {
  const g = window.__swGame;
  const mark = g.__bj608Rec.length;
  const iv = setInterval(() => { if (g.__bj608Rec.length - mark >= n) { clearInterval(iv); res(g.__bj608Rec.length - mark); } }, 4);
}), n);
const dump = async (label, n0, n1) => {
  const lines = await page.evaluate((label, n0, n1) => {
    const rec = window.__swGame.__bj608Rec;
    const out = [];
    for (let i = n0; i < Math.min(n1, rec.length); i++) {
      const r = rec[i];
      const dy = i > 0 ? (r.postY - rec[i - 1].postY).toFixed(1) : '0';
      out.push(`#${i} top=${r.postY.toFixed(1)} feet=${(r.postY + 42).toFixed(1)} vy=${r.postVy.toFixed(2)} g=${r.postG ? 1 : 0} S=${r.dt ? 1 : 0} dy=${dy}`);
    }
    return out;
  }, label, n0, n1);
  console.log(`== ${label} ==\n` + lines.join('\n'));
};

// ── ① 短按 S 10 tick（日志失败案）──
console.log('--- case1: tap S 10 ticks ---');
await kev('keydown', 'KeyS');
await ticks(10);
await kev('keyup', 'KeyS');
await ticks(30);
await dump('case1 tap10', 0, 42);

// ── 复位再测:长按 S 18 tick（日志 34886 成功案）──
await page.evaluate(() => { const p = window.__swGame.player; p.x = 62879; p.y = 4310; p.vx = 0; p.vy = 0; window.__swGame.__bj608Rec.length = 0; });
console.log('--- case2: hold S 18 ticks ---');
await kev('keydown', 'KeyS');
await ticks(18);
await kev('keyup', 'KeyS');
await ticks(20);
await dump('case2 hold18', 0, 40);

// ── 复位再测:连续短按 3 次（日志 34747-34850 三连失败案）──
await page.evaluate(() => { const p = window.__swGame.player; p.x = 62879; p.y = 4310; p.vx = 0; p.vy = 0; window.__swGame.__bj608Rec.length = 0; });
console.log('--- case3: 3x tap S ---');
for (let k = 0; k < 3; k++) {
  await kev('keydown', 'KeyS');
  await ticks(9);
  await kev('keyup', 'KeyS');
  await ticks(25);
}
await dump('case3 3taps', 0, 110);

await browser.close();
process.exit(0);
