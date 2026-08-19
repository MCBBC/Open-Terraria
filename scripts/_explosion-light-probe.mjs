// 爆炸火光探针:黑暗地下引爆炸弹 →
// ① VanillaDust 生成 type 6 火尘(全亮绘制+逐尘 AddLight = 火光双机制)
// ② 爆心光照尖峰(环境被照亮) ③ gore 61-64 烟块。
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
  // 1) 挪到黑暗地下(地表下 60 格,挖个空腔防爆心撞墙吞尘)
  const st = g.world.store;
  const ty = Math.floor(g.world.groundLevel) + 60;
  let tx = Math.floor(p.cx / 16);
  // 找一列软土区并掏 7×5 空腔
  for (let x = tx; x < tx + 40; x++) {
    let solid = 0;
    for (let y = ty - 2; y < ty + 3; y++) if (st.isSolid(x, y)) solid++;
    if (solid >= 4) { tx = x; break; }
  }
  for (let dx = -3; dx <= 3; dx++) for (let dy = -2; dy <= 2; dy++) {
    if (st.inBounds(tx + dx, ty + dy)) st.setTile(tx + dx, ty + dy, 0);
  }
  p.x = (tx - 1) * 16; p.y = (ty - 1) * 16;
  await new Promise((r) => setTimeout(r, 400));
  const lit = (x, y) => {
    const [r2, g2, b2] = g.lighting.lightAt(x, y);
    return (r2 + g2 + b2) / 3;
  };
  const base = lit(tx, ty);
  // 2) 基线光照应为黑暗(<10);随后丢炸弹(引信 1t 即爆)
  const key = Object.keys(window.__swItems).find((k) => /^vi_166_/.test(k));
  p.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
  p.inv.selected = 0; p.useTime = 0;
  g.input.mouseDown = true;
  g.input.mouseX = g.renderer.canvas.width / 2 + 60;
  g.input.mouseY = g.renderer.canvas.height / 2;
  await new Promise((r) => setTimeout(r, 120));
  g.input.mouseDown = false;
  const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
  if (!proj) return { err: 'no bomb thrown' };
  proj.fuse = 2;                                  // 立即爆
  proj.vx = 0; proj.vy = 0;
  const goreBefore = (window.__swGore ? window.__swGore().length : -1);
  // 3) 爆后 1.2s 内采样:光照峰值 + 火尘计数
  let peak = 0, fireDust = 0, goreAfter = goreBefore;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 20));
    const l = lit(tx, ty);
    if (l > peak) peak = l;
    const vd = g.renderer.vanillaDust;
    if (vd) {
      // 池非导出——经 lights 长度与渲染存在性近似;直接读池:
      const pool = vd.pool;
      if (pool) {
        let n6 = 0;
        for (const d of pool) if (d.active && d.type === 6) n6++;
        if (n6 > fireDust) fireDust = n6;
      }
    }
    if (window.__swGore) goreAfter = Math.max(goreAfter, window.__swGore().length);
  }
  return { err: null, base, peak, fireDust, goreBefore, goreAfter };
});

if (res.err) { check('投掷炸弹', false, res.err); }
else {
  check('黑暗基线(光照<10)', res.base < 10, `base=${res.base.toFixed(1)}`);
  check('爆炸光照尖峰(火尘 AddLight 照亮环境,peak>base+15)', res.peak > res.base + 15, `peak=${res.peak.toFixed(1)}`);
  check('火尘 type 6 生成(全亮自发光)', res.fireDust > 0, `fireDust=${res.fireDust}`);
  check('烟块 gore 61-64 生成', res.goreAfter > res.goreBefore, `${res.goreBefore}→${res.goreAfter}`);
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
