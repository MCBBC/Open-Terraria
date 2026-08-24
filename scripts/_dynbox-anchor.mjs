// _dynbox-anchor:炸弹 28/雷管 29/手雷 30 绘制锚点 1:1 实测
// 原版 1457 DrawProjDirect else 支旧式公式(Main.cs:35492):
//   anchor = (盒左 + num153 + num152, 盒上 + 盒高/2),origin = (num153, 盒高/2 + num151)
//   num153 = (贴图宽−盒宽)/2 + 盒宽/2 = 贴图宽/2;num152=X 偏移(28/29/30 全 0)
//   num151: 28 族=8 / 29 族=11 / 30 无条目=0
//   ⇒ 贴图左上角 = (盒左, 盒上 − num151):
//     28: (x, y−8)  22×30(体 y8-29 恰填盒,引线上探 8)
//     29: (x, y−11) 10×32(盒罩贴图 11-21 行中带,引线上探 11、体下悬 11)
//     30: (x, y)    14×20(盒罩上半,体下悬 6)
// 探针:rot=0(投后清零速度)原子捕获 drawImage(img,dx,dy,dw,dh)+当前变换,
// 与实体盒同帧对照。贴图 naturalWidth 同时验证 SW 缓存健康(10×32/22×30/14×20)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 }, protocolTimeout: 900000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// document-start 挂钩:记录三类贴图的每次 drawImage 原子参数
// 贴图经 upgradeToBitmap 升级为 ImageBitmap(无 src)——挂 createImageBitmap 打标
await page.evaluateOnNewDocument(() => {
  const origCib = window.createImageBitmap?.bind(window);
  if (origCib) {
    window.createImageBitmap = (...args) => origCib(...args).then((bmp) => {
      try {
        const src = args[0]?.currentSrc || args[0]?.src || '';
        const m = /Projectile_(28|29|30)\.png/.exec(src);
        if (m) bmp.__swId = +m[1];
      } catch { /* ignore */ }
      return bmp;
    });
  }
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  const cap = [];
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    try {
      const src = img.currentSrc || img.src || '';
      const m = /Projectile_(28|29|30)\.png/.exec(src);
      const id = m ? +m[1] : (img.__swId ?? null);
      if (id && rest.length >= 4) {
        const t = this.getTransform();
        cap.push({
          id,
          dx: rest[0], dy: rest[1], dw: rest[2], dh: rest[3],
          natW: img.naturalWidth ?? img.width, natH: img.naturalHeight ?? img.height,
          e: t.e, f: t.f, a: t.a, b: t.b, c: t.c, d: t.d,
        });
        if (cap.length > 400) cap.shift();
      }
    } catch { /* ignore */ }
    return orig.call(this, img, ...rest);
  };
  window.__dynCap = cap;
});
await page.goto(URL, { waitUntil: 'networkidle0' });
// 溅屏(sw-splash,默认时序 ~20s)盖在垫片上——先等其移除再点,否则点击被 overlay 吃掉
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 120000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 800000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));

// 依次投掷 167(雷管→29)/166(炸弹→28)/168(手雷→30),出手即清速度钉 rot=0
const results = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  for (const itemId of [167, 166, 168]) {
    const key = Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${itemId}_`).test(k));
    if (!key) { out[itemId] = { err: 'item key missing' }; continue; }
    g.player.inv.slots[0] = { id: window.__swItems[key], stack: 5 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    const before = g.entities.projectiles.length;
    g.input.mouseDown = true;
    g.input.mouseX = g.renderer.canvas.width / 2 + 60;
    g.input.mouseY = g.renderer.canvas.height / 2 - 30;
    await new Promise((r) => setTimeout(r, 100));
    g.input.mouseDown = false;
    const proj = g.entities.projectiles[g.entities.projectiles.length - 1];
    if (!proj || proj.constructor.name !== 'GrenadeProj') { out[itemId] = { err: 'no GrenadeProj', n: g.entities.projectiles.length - before }; continue; }
    proj.vx = 0; proj.vy = 0; proj.rot = 0; proj.fuse = 3000;
    // 钉死位置(重力每 tick 加 vy,绘制采样窗口内每帧回写)——锚点=盒心恒定可精确对照
    const px = proj.x, py = proj.y;
    const pin = setInterval(() => { proj.x = px; proj.y = py; proj.vx = 0; proj.vy = 0; proj.rot = 0; }, 8);
    await new Promise((r) => setTimeout(r, 350)); // 采几帧绘制
    clearInterval(pin);
    out[itemId] = { projId: proj.projId, w: proj.w, h: proj.h, x: px, y: py };
  }
  return out;
});
console.log('实体状态:', JSON.stringify(results));

const caps = await page.evaluate(() => window.__dynCap.splice(0, window.__dynCap.length));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 贴图健康(SW 缓存):naturalWidth/Height 必须等于原版
const NAT = { 28: [22, 30], 29: [10, 32], 30: [14, 20] };
for (const id of [28, 29, 30]) {
  const c = caps.find((k) => k.id === id);
  check(`贴图 ${id} 尺寸 ${NAT[id][0]}×${NAT[id][1]}(缓存健康)`, !!c && c.natW === NAT[id][0] && c.natH === NAT[id][1],
    c ? `实际 ${c.natW}×${c.natH}` : '无绘制采样');
}
// 锚点:贴图左上角 = (盒左, 盒上 − num151);num151 = {28:8, 29:11, 30:0}
const EXP = { 28: 8, 29: 11, 30: 0 };
const BY_ITEM = { 167: 29, 166: 28, 168: 30 };
for (const [itemId, id] of Object.entries(BY_ITEM)) {
  const pid = +id;
  const st = results[itemId];
  if (!st || st.err || st.projId !== pid) { check(`弹 ${pid}(物品 ${itemId})实体就位`, false, JSON.stringify(st)); continue; }
  // 该 id 只投一次 → 此 id 全部采样都属于本弹。变换=屏幕空间(含相机缩放):
  // 盒心/期望左上都经 cam.worldToScreen 换算后对照;b/c≈0 排除旋转帧
  const geo = await page.evaluate(([px, py, pw, ph, expOff]) => {
    const g = window.__swGame;
    const [cx, cy] = g.camera.worldToScreen(px + pw / 2, py + ph / 2);
    const [ex, ey] = g.camera.worldToScreen(px, py - expOff);
    return { cx, cy, ex, ey };
  }, [st.x, st.y, st.w, st.h, EXP[pid]]);
  const cands = caps.filter((k) => k.id === pid
    && Math.abs(k.b) < 0.01 && Math.abs(k.c) < 0.01
    && Math.abs(k.e - geo.cx) < 3 && Math.abs(k.f - geo.cy) < 3);
  const c = cands[cands.length - 1];
  if (cands.length > 1) console.log(`  [采样散布 ${pid}] n=${cands.length} f=${cands.map(k=>k.f.toFixed(1)).join(',')}`);
  if (!c) { check(`弹 ${pid} 绘制采样匹配`, false, `盒心屏 (${geo.cx.toFixed(1)},${geo.cy.toFixed(1)}) 采样数 ${cands.length} 全部采样 ${caps.length}`); continue; }
  const tlx = c.e + c.dx * c.a, tly = c.f + c.dy * c.a;   // rot=0:局部偏移×zoom→屏幕
  const expX = geo.ex, expY = geo.ey;
  const okX = Math.abs(tlx - expX) < 2, okY = Math.abs(tly - expY) < 2;
  const okW = Math.abs(c.dw - NAT[pid][0]) < 0.6, okH = Math.abs(c.dh - NAT[pid][1]) < 0.6;   // 局部单位=原生
  check(`弹 ${pid} 贴图左上=盒左,(盒上−${EXP[pid]})(屏空间)`, okX && okY,
    `实测 (${tlx.toFixed(1)},${tly.toFixed(1)}) 期望 (${expX.toFixed(1)},${expY.toFixed(1)}) zoom=${c.a.toFixed(2)}`);
  check(`弹 ${pid} 绘制尺寸=贴图原生(局部)`, okW && okH, `实测 ${c.dw}×${c.dh}`);
}
console.log(`\n${pass} pass / ${fail} fail`);
if (errors.length) console.log('[pageerror]', errors.slice(0, 3).join(' | '));
await browser.close();
process.exit(fail ? 1 : 0);
