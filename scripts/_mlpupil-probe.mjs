// 一次性探针:月总瞳孔椭圆修复验证(scripts/_mlpupil-probe.mjs)
// 召唤月总 → 拦截一帧 drawImage 记录 Extra_19(32×32 瞳孔)/NPC_396/Extra_25/29 的
// 变换锚点 → 对账:瞳孔相对头/手中心的设备像素偏移 == mlElipseVec(lai0,…)×zoom×dpr。
// 附白天截图供人工核对。经 tools/run-diag.mjs 运行;SW_ORIGIN 指向私有实例。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
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
  await page.keyboard.type('瞳孔验证');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const worldItem = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (worldItem) {
  await page.click('.sw-list-panel .sw-item');
} else {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  // 白天(规避夜光压暗,纯验证几何)
  g.world.clock.timeOfDay = 0.4;
  // 找一块地表净空:玩家右上找平地
  const st = g.world.store;
  const p = g.player;
  const baseX = Math.floor(g.world.spawnX), gy = Math.floor(g.world.groundLevel);
  let sxT = baseX;
  for (let tx = baseX; tx < baseX + 200; tx++) {
    let clear = true;
    for (let ty = gy - 30; ty < gy + 6; ty++) {
      if (st.inBounds(tx, ty) && st.isSolid(tx, ty) && ty < gy) { clear = false; break; }
    }
    if (clear && st.inBounds(tx, gy) && st.isSolid(tx, gy)) { sxT = tx; break; }
  }
  p.x = sxT * 16 - 200; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
  await wait(600);
  // 召唤月总全家桶(核心 398 出生链带手+头)
  g.toggleDebugGod();   // F2 无敌:防测试玩家被月总打死→全灭离场
  // ★正规通道:summonBoss('moon_lord') 走 boss 槽+SpawnOnPlayer 语义
  // (spawnNpcByVanilla 会把敌怪塞进 critters 桶被小动物清理逻辑清掉——不适用 Boss)
  const spawned = g.summonBoss('moon_lord', { onPlayer: true });
  const core = null;
  // 高频轮询:前 1.5s 每 100ms 追核心死因
  const trace = [];
  for (let i = 0; i < 15; i++) {
    await wait(100);
    trace.push(i + ': ml=' + g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId))
      .map(e => e.vanillaId + (e.dead ? 'D' : '')).join(','));
  }
  for (let i = 0; i < 7; i++) {
    await wait(1000);
    trace.push('s' + (i + 1) + ': ' + g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId))
      .map(e => e.vanillaId + ':ai0=' + e.ai0.toFixed(1) + ',hp=' + Math.round(e.hp) + (e.dead ? 'D' : '')).join(' | '));
  }
  const enemies = g.entities.enemies;
  const mlParts = enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({
    vid: e.vanillaId, id: e.id, ai0: e.ai0, ai1: e.ai1, ai2: e.ai2, ai3: e.ai3,
    lai0: e.lai0, lai1: e.lai1, cx: e.cx, cy: e.cy, hp: e.hp, dead: e.dead,
  }));
  // ---- 拦截一帧 drawImage:记录 32×32 源(瞳孔 Extra_19)/NPC_396(191×268 源)/
  // Extra_25(56×56 源)/Extra_29(90×100 源) 的调用点与当前变换 ----
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const histo = {};
  let nCalls = 0;
  // ★钩 prototype:月总画在世界层离屏 canvas(非主画布 ctx),须全局拦截
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  let recording = false;
  proto.drawImage = function (img, ...rest) {
    if (recording) {
      const sw = rest.length >= 5 ? rest[3] : img.width;
      const sh = rest.length >= 5 ? rest[4] : img.height;
      const sx = rest.length >= 5 ? rest[0] : 0;
      const sy = rest.length >= 5 ? rest[1] : 0;
      nCalls++;
      const key = img.width + 'x' + img.height + ':' + sw + 'x' + sh;
      histo[key] = (histo[key] || 0) + 1;
    }
    return orig.call(this, img, ...rest);
  };
  // rAF 计帧:恰好录 1 帧(渲染主循环)
  recording = true;
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  recording = false;
  proto.drawImage = orig;
  const cam = { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom };
  const dpr = cv.width / cv.getBoundingClientRect().width;
  return { spawned, trace, nCalls, histo, nEnemies: enemies.length, allVids: enemies.map(e => e.vanillaId).filter(v => v >= 390 && v <= 410), mlParts, records, cam, dpr, canvasW: cv.width, canvasH: cv.height };
});
console.log(JSON.stringify({ errs, spawned: out.spawned, cam: out.cam, dpr: out.dpr, canvas: [out.canvasW, out.canvasH] }));
console.log('trace:', JSON.stringify(out.trace));
console.log('nEnemies:', out.nEnemies, 'vids390-410:', JSON.stringify(out.allVids));
console.log('parts:', JSON.stringify(out.mlParts));
console.log('drawImage histogram:', JSON.stringify(out.histo));
console.log('ml parts:', JSON.stringify(out.mlParts));
await page.screenshot({ path: '/tmp/ml_pupil_fixed.png', type: 'png' });
await browser.close();
