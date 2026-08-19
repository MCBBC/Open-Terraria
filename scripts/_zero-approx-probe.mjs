// 清零近似验证探针:①浮标贴图+钓线(bobber num143=8 + FishingLine 段链)
// ②宝箱怪 4.1 三段跳劈帧序(6,5,4,3,4,5 各 4t)。
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
  const mod = await import('/src/render/Renderer.ts');
  const { Bobber } = await import('/src/entities/Bobber.ts');
  const out = {};
  // ---- ① 浮标:钓鱼姿态下生成,等贴图加载后采样 drawImage ----
  {
    const bob = new Bobber(p.x + 90, p.y - 10, 2, -2, 25, 0, 10, () => p);
    bob.poleVid = 2289;             // 木钓竿(经典浮标 360)
    g.entities.add(bob, 'projectiles');
    const rec5 = [];   // 5 参(本体)
    const rec9 = [];   // 9 参(钓线源裁条)
    const proto = CanvasRenderingContext2D.prototype;
    const orig = proto.drawImage;
    proto.drawImage = function (img) {
      if (arguments.length === 5) rec5.push([arguments[1], arguments[2], arguments[3], arguments[4]]);
      if (arguments.length === 9) rec9.push([arguments[3], arguments[4], arguments[7], arguments[8]]);
      return orig.apply(this, arguments);
    };
    await new Promise((r) => setTimeout(r, 2000));
    bob.dead = true;
    proto.drawImage = orig;
    // 浮标本体:帧图(Projectile_360 尺寸?)+公式 y=−(盒高/2+8)
    const { projFrameImg } = await import('/src/entities/Arrow.ts');
    const img = projFrameImg(bob.projId, 0);
    const expBob = img ? { y: -(bob.h / 2 + 8), w: img.width } : null;
    // 钓线:FishingLine 段 = 9 参源裁条(sw=dw=12, sh=dh=segLen∈(0,12])
    const lineCalls = rec9.filter((c) => c[0] === 12 && c[2] === 12 && c[3] <= 12 && c[3] > 0);
    out.bobber = {
      projId: bob.projId, imgDims: img ? [img.width, img.height] : null, expBob,
      bobCalls: rec5.filter((c) => expBob && c[2] === expBob.w).slice(-2),
      lineSegs: lineCalls.length, lineDims: lineCalls.slice(0, 3),
    };
  }
  // ---- ② 宝箱怪 4.1 帧序 ----
  {
    const m = g.spawnNpcByVanilla(473, p.x - 140, p.y - 20);
    if (m) {
      m.ai0 = 4.1; m.vx = 0; m.vy = 0;
      // 连续调用推进 counter,采帧序
      const seq = [];
      for (let i = 0; i < 30; i++) seq.push(mod.vanillaFrameIdx(m, 14));
      m.dead = true;
      out.mimic41 = { seq };
    }
  }
  return out;
});

// ① 浮标
if (res.bobber) {
  const b = res.bobber;
  check('浮标贴图按 projId 加载(360 木钓竿浮标)', !!b.imgDims, JSON.stringify(b.imgDims));
  const last = b.bobCalls[b.bobCalls.length - 1];
  check('浮标本体公式锚(y=−(盒高/2+8))', last && Math.abs(last[1] - b.expBob.y) < 0.51,
    `got ${last ? last[1] : 'none'} want ${b.expBob.y}`);
  check('钓线段链绘制(FishingLine 12px 段)', b.lineSegs > 0, `segs=${b.lineSegs} dims=${JSON.stringify(b.lineDims)}`);
}
// ② 宝箱怪 4.1
if (res.mimic41) {
  const s = res.mimic41.seq;
  // 期望帧序:counter 0..3→6, 4..7→5, 8..11→4, 12..15→3, 16..19→4, 20..22→5, 23 回卷→6...
  const exp = [];
  for (let c = 1; c <= 30; c++) {
    const v = ((c - 1) % 23) + 1;   // counter 回卷 0 后自增 → 值域 1..23
    exp.push(v < 4 ? 6 : v < 8 ? 5 : v < 12 ? 4 : v < 16 ? 3 : v < 20 ? 4 : 5);
  }
  const ok = s.every((f, i) => f === exp[i]);
  check('宝箱怪 4.1 三段跳劈帧序(6,5,4,3,4,5 各 4t 回卷)', ok,
    `got ${s.slice(0, 12).join(',')} want ${exp.slice(0, 12).join(',')}`);
}
check('无页面错误', errors.length === 0, errors.join(' | ').slice(0, 200));
await browser.close();
console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
