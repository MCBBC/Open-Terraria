// 录一帧 biomeBg.img 的真实调用参数,看 248/249/250 的实际 dw/dh(dx/dy)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.evaluate(async () => { try { localStorage.clear(); const dbs = indexedDB.databases ? await indexedDB.databases() : []; for (const d of dbs) indexedDB.deleteDatabase(d.name); } catch {} });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.mouse.click(8, 8);
for (let i = 0; i < 6 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-char-row input[type=text]'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('bgprobe');
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]').catch(()=>{});
await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
await page.click('[data-f=seed]');
await page.keyboard.type('1247539775');
await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 420000, polling: 1000 });
// 关欢迎弹窗
for (let i = 0; i < 10; i++) {
  const gone = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /我已知晓/.test(x.textContent ?? '')); if (b) { b.click(); return true; } return false; }).catch(() => false);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 500));
}
for (let t = 0; t < 400; t++) {
  await page.evaluate(() => { const g = window.__swGame; if (g?.world) for (let i = 0; i < 120; i++) { try { g.fixedUpdate(1/60); } catch { break; } } }).catch(()=>{});
  const ok = await page.evaluate(() => {
    const g = window.__swGame; if (!g?.world?.store) return false;
    const st = g.world.store, w = st.w, h = st.h, ty = st.type;
    const keys = window.__swTiles ?? {}; const SAND = keys['v_53_sand_block'] ?? 53;
    let bestN = 0;
    for (let x = 60; x < w - 60; x += 4) { let n = 0; for (let y = 60; y < (g.world.groundLevel|0)+80 && y < h; y++) if (ty[x+y*w] === SAND) n++; if (n > bestN) bestN = n; }
    if (bestN < 60) return false;
    let py = 250; while (py < h - 10 && !st.isSolid(2537, py)) py++;
    g.player.x = 2537*16+8; g.player.y = (py-6)*16; g.player.vx = 0; g.player.vy = 0;
    g.world.timeOfDay = 0.5;
    return true;
  });
  if (ok) break;
}
await page.evaluate(() => { const g = window.__swGame; for (let i = 0; i < 120; i++) { try { g.fixedUpdate(1/60); } catch { break; } } });
await new Promise((r) => setTimeout(r, 500));
// 挂钩录一帧:bitmap→tex 映射 + 拦截 biomeBg.draw 的 blit 实例(2D/GL 通吃)
const calls = await page.evaluate(async () => {
  const g = window.__swGame;
  const bg = g.renderer.biomeBg;
  const map = new Map();
  const origLoader = bg.img.bind(bg);
  bg.img = function (n) { const r = origLoader(n); if (r) map.set(r, n); return r; };
  origLoader(248); origLoader(249); origLoader(250);
  const rec = [];
  const origDraw = bg.draw.bind(bg);
  bg.draw = function (target, ...rest) {
    if (target && typeof target.img === 'function') {
      const oi = target.img.bind(target);
      target.img = function (im, sx, sy, sw, sh, dx, dy, dw, dh, opts) {
        const tex = map.get(im);
        if (tex !== undefined) rec.push({ tex, sx, sy, sw, sh, dx: +dx?.toFixed?.(1), dy: +dy?.toFixed?.(1), dw: +dw?.toFixed?.(1), dh: +dh?.toFixed?.(1), src: opts?.src ?? null });
        return oi(im, sx, sy, sw, sh, dx, dy, dw, dh, opts);
      };
    }
    try { return origDraw(target, ...rest); } finally { if (target && target.img) delete target.img; }
  };
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  bg.draw = origDraw;
  bg.img = origLoader;
  return { rec };
});
if (calls.error) { console.log('HOOK FAIL:', JSON.stringify(calls)); await browser.close(); process.exit(1); }
console.log('info:', JSON.stringify(calls.info));
const all = calls.rec;
const desert = all.filter((c) => [248, 249, 250].includes(c.tex));
console.log('沙漠层调用(每贴图前3条):');
for (const t of [248, 249, 250]) {
  const cs = desert.filter((c) => c.tex === t);
  console.log(`tex${t}: ${cs.length} 次`);
  for (const c of cs.slice(0, 3)) console.log('  ', JSON.stringify(c));
}
const other = all.filter((c) => ![248, 249, 250].includes(c.tex));
const byTex = {};
for (const c of other) byTex[c.tex] = (byTex[c.tex] ?? 0) + 1;
console.log('其它贴图调用统计:', JSON.stringify(byTex));
await browser.close();
console.log('HOOK DONE');
