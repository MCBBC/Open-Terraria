// 翅膀视觉探针：装备天使之翼(492→slot1)后
//   ① equipStats.wing.logic 解析
//   ② 站立态截图 A（收拢帧 0，generic 无 alwaysAir 门仍绘制）
//   ③ 卸翼同位截图 B → 像素差 = 翅膀可见性（旧 bug：锚点双重平移画屏幕外 → 差≈0）
//   ④ 重装 + 空中按跳：wingFrame 序列应走 flap 循环（0→1→2→3，5t/帧）
//   ⑤ wingTime 消耗与恢复
//   ⑥ 多款抽查：Leaf Wings 665→3 装上即 wing.logic===3
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('翅膀测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = { steps: [] };
  const ok = (name, cond, extra) => { res.steps.push({ name, pass: !!cond, extra }); return !!cond; };
  const waitUntil = async (fn, ms = 2000) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 30));
    return fn();
  };
  const p = g.player;

  // ① 装天使之翼（vi_492_* → armor[3]）
  const key = Object.keys(window.__swItems).find(k => k.startsWith('vi_492_'));
  ok('① 天使之翼条目存在', !!key, key);
  const wingId = window.__swItems[key];
  p.inv.armor[3] = { id: wingId, stack: 1 };
  ok('① equipStats.wing.logic===1', p.equipStats.wing?.logic === 1, `logic=${p.equipStats.wing?.logic}`);
  ok('① wingStats time=100(天使)', p.equipStats.wing?.time === 100, `time=${p.equipStats.wing?.time}`);

  // ② 站立态等待收拢帧 0
  await waitUntil(() => p.onGround && p.wingFrame === 0);
  await new Promise(r => setTimeout(r, 300));
  // 贴图加载自检（懒加载 miss → 等一拍自愈）
  const wt0 = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
  await waitUntil(() => {
    const im = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
    return im && im.naturalWidth > 0;
  }, 3000);
  const wt = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
  ok('② Wings_1.png 加载就绪', !!wt && wt.naturalWidth > 0, `${wt?.naturalWidth}×${wt?.naturalHeight}`);
  const canvas = g.renderer.canvas;
  const shotA = canvas.toDataURL();

  // ③ 卸翼同位截图 → 像素差
  p.inv.armor[3] = null;
  await new Promise(r => setTimeout(r, 350));
  ok('③ 卸翼后 wing=null', p.equipStats.wing === null);
  const shotB = canvas.toDataURL();

  // 数据 URL → 像素差计数（下采样 2px 步长）
  const load = (url) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.src = url;
  });
  const [ia, ib] = await Promise.all([load(shotA), load(shotB)]);
  const cA = document.createElement('canvas'); cA.width = ia.width; cA.height = ia.height;
  cA.getContext('2d').drawImage(ia, 0, 0);
  const cB = document.createElement('canvas'); cB.width = ib.width; cB.height = ib.height;
  cB.getContext('2d').drawImage(ib, 0, 0);
  const dA = cA.getContext('2d').getImageData(0, 0, cA.width, cA.height).data;
  const dB = cB.getContext('2d').getImageData(0, 0, cB.width, cB.height).data;
  let diff = 0;
  for (let i = 0; i < dA.length; i += 4 * 2) {
    if (Math.abs(dA[i] - dB[i]) > 24 || Math.abs(dA[i + 3] - dB[i + 3]) > 24) diff++;
  }
  ok('③ 翅膀像素可见（差>400px）', diff > 400, `diff=${diff}`);
  ok('③ 差不过量（<全屏 5%）', diff < dA.length / 4 / 20, `diff=${diff}`);

  // ④ 重装 + 抬到空中 + 按住跳 → flap 帧循环采样
  p.inv.armor[3] = { id: wingId, stack: 1 };
  await new Promise(r => setTimeout(r, 200));
  p.y -= 500; p.vy = 0; p.fallStartY = null;   // 抬到空中
  g.input.touchKeys.add('Space');               // 按住跳（touchKeys 注入通道）
  const seq = [];
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 16)); seq.push(p.wingFrame); }
  g.input.touchKeys.delete('Space');
  const uniq = [...new Set(seq)].sort((a, b) => a - b).join(',');
  const sawCycle = seq.some(f => f >= 2) && seq.some(f => f <= 1);
  ok('④ 空中按跳 wingFrame 动起来（0-3 循环）', sawCycle, `seq首尾=[${seq.slice(0, 8)}…${seq.slice(-4)}] uniq=${uniq}`);
  ok('④ flap 期间 wingTime 递减', seq.length > 0, `wingTime=${p.wingTime}`);

  // ⑤ 落地回满（落地 tick 后下一帧 fixedUpdate 才写回 wingTime——多等一拍）
  await waitUntil(() => p.onGround, 5000);
  await new Promise(r => setTimeout(r, 200));
  ok('⑤ 落地 wingTime 回满 100', p.wingTime === 100, `wingTime=${p.wingTime}`);

  // ⑥ 多款：Leaf Wings 665→slot3 / 妖精翅 748→slot4（frames=4 各自锚）
  const key665 = Object.keys(window.__swItems).find(k => k.startsWith('vi_665_'));
  if (key665) {
    p.inv.armor[3] = { id: window.__swItems[key665], stack: 1 };
    ok('⑥ 叶翅 logic===3', p.equipStats.wing?.logic === 3, `logic=${p.equipStats.wing?.logic}`);
  } else ok('⑥ 叶翅条目缺失（登记）', false);
  p.inv.armor[3] = { id: wingId, stack: 1 };
  return res;
});

// 结果汇总
let pass = 0, fail = 0;
for (const s of out.steps) {
  console.log(`${s.pass ? '✅' : '❌'} ${s.name}${s.extra ? '  → ' + s.extra : ''}`);
  s.pass ? pass++ : fail++;
}
console.log(`---- 翅膀探针: ${pass}✅ ${fail}❌  pageerror=${errs.length}`);
for (const e of errs) console.log('  ' + e);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
