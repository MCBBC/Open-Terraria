// ★RB31a 终局探针#4(2026-09-16;②已随 RB31a-F1 修复改判翻绿):
//  ① E''-2 纠偏:烘焙位图计数基线差分(行可见 vs 行清零,同帧域,关包关图)
//  ② RB31a-F1 验证:_capturePass 嵌套渲染不得污染 _fmWasOpen。污染原=嵌套
//     render :3325(修复后 :3330)无条件写 + CaptureMode.renderChunk 换装
//     open=false(:877)而其 finally 只还原 open ⇒ 分块帧末把 _fmWasOpen 钉 false
//     → 关图复位站(Renderer :3306 门)整站跳过。修复=capturePass 期不写;
//     本探针②改走真路径(置 _capturePass+open=false 跑帧=renderChunk 换装同械,
//     非手注旗)断言:分块帧后 _fmWasOpen 保持 true、按住关图复位照跑、
//     重开无陈旧跳变、常态复位不回归。
// 跑法:SW_ORIGIN=http://localhost:5264 node tools/run-diag.mjs scripts/_rb31a-input-bake4.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const note = (n, x = '') => console.log(`INFO: ${n}${x ? '  ' + x : ''}`);
const ticks = (n = 4) => page.evaluate((n) => new Promise((res) => {
  const g = window.__swGame; const t0 = g.tickCount;
  const iv = setInterval(() => { if (g.tickCount - t0 >= n) { clearInterval(iv); res(g.tickCount - t0); } }, 8);
}), n);
const hygiene = () => page.evaluate(() => {
  const g = window.__swGame;
  g.renderer.fullMap.open = false;
  g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false; g.input.delayUseItem = false;
  g.housingMode = null; g.player.dead = false; g.player.respawnTimer = 0; g.player.useTime = 0;
});
const GY = 300;
const placePlayer = (tx) => page.evaluate(({ GY, tx }) => {
  const g = window.__swGame, p = g.player;
  p.x = tx * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = false; p.dead = false; p.respawnTimer = 0;
}, { GY, tx });

// ============ ① E''-2 纠偏:基线差分 ============
{
  await hygiene(); await placePlayer(260); await sleep(300);
  await page.evaluate(() => { window.__swUI.closeInventory?.(); });
  await ticks(2);
  await page.evaluate(() => {
    window.__rb4 = { draw5: 0, wrapped: window.__rb4Wrapped === true };
    if (!window.__rb4Wrapped) {
      window.__rb4Wrapped = true;
      const od = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, a, b, c, d, ...rest) {
        if (a !== undefined && d !== undefined && rest.length === 0 && img instanceof HTMLCanvasElement) window.__rb4.draw5++;
        return od.call(this, img, a, b, c, d, ...rest);
      };
    }
  });
  // 基线窗(无信息件)
  await page.evaluate(() => { for (let i = 40; i < 46; i++) window.__swGame.player.inv.slots[i] = null; window.__rb4.draw5 = 0; window.__rb4.f0 = window.__swGame.renderer.animTick; });
  await sleep(700);
  const B = await page.evaluate(() => ({ draw5: window.__rb4.draw5, frames: window.__swGame.renderer.animTick - window.__rb4.f0 }));
  // 行窗(6 件)
  await page.evaluate(() => {
    const g = window.__swGame;
    const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {}; const it = window.__swItems ?? {};
    [17, 18, 393, 3119, 3099, 3084].forEach((vid, i) => { const k = vk[vid]; if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 }; });
    window.__rb4.draw5 = 0; window.__rb4.f0 = window.__swGame.renderer.animTick;
  });
  await sleep(700);
  const L = await page.evaluate(() => ({
    draw5: window.__rb4.draw5, frames: window.__swGame.renderer.animTick - window.__rb4.f0,
    rows: window.__swGame.renderer.infoAccs.state.rows.length,
  }));
  const perFrameB = B.draw5 / Math.max(1, B.frames);
  const perFrameL = L.draw5 / Math.max(1, L.frames);
  const perRow = L.rows ? (perFrameL - perFrameB) / L.rows : -1;
  note('① 基线差分', `base=${B.draw5}/${B.frames}f(${perFrameB.toFixed(1)}/f) live=${L.draw5}/${L.frames}f(${perFrameL.toFixed(1)}/f) rows=${L.rows}`);
  check('① 每行恰 2 次烘焙位图 drawImage(剪影+染色,无双调用)', perRow > 1.4 && perRow < 2.7, `ΔperRow=${perRow.toFixed(2)}`);
  await hygiene();
}

// ============ ② RB31a-F1:_capturePass 嵌套渲染不污染 _fmWasOpen(修复面) ============
{
  await hygiene(); await placePlayer(300); await sleep(300);
  // 步1:开图+拖拽建立 md=true/lastMouse=560(常态主渲染帧尾 _fmWasOpen=true)
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(3);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(560, 400, { steps: 4 });
  await ticks(2);
  const s1 = await page.evaluate(() => { const r = window.__swGame.renderer; return { md: r.mapDragging, lm: r.lastMouse.x, fm: r._fmWasOpen }; });
  check('②-1 拖拽态建立(md=true,lastMouse=560,_fmWasOpen=true)', s1.md === true && s1.lm === 560 && s1.fm === true, JSON.stringify(s1));
  // 步2:真路径复现(非手注旗)——仿 CaptureMode.renderChunk :877-878 换装
  //     (open=false + _capturePass=true)跑帧:修复前嵌套 render :3325 无条件写
  //     把 _fmWasOpen 钉 false;修复后(RB31a-F1 capturePass 期不写)本旗保持 true
  await page.evaluate(() => { const r = window.__swGame.renderer; r._capturePass = true; r.fullMap.open = false; });
  await ticks(2);
  const s2 = await page.evaluate(() => { const r = window.__swGame.renderer; return { fm: r._fmWasOpen }; });
  check('②-2 分块帧后 _fmWasOpen 未被钉 false(仍 true)', s2.fm === true, JSON.stringify(s2));
  // 步3:同一批次还原换装+按住关图(无主渲染帧插入)→ 复位站照跑(修复前被跳过)
  await page.evaluate(() => { const r = window.__swGame.renderer; r._capturePass = false; r.fullMap.open = true; window.__swGame.toggleFullMap(); });
  await ticks(5);
  const s3 = await page.evaluate(() => { const r = window.__swGame.renderer; return { open: r.fullMap.open, md: r.mapDragging, lm: r.lastMouse.x }; });
  check('②-3 按住关图复位照跑(md=false,lastMouse=0)', !s3.open && s3.md === false && s3.lm === 0, JSON.stringify(s3));
  // 步4:关图期移鼠→按住重开→拖 60px → 无陈旧跳变(修复基线≈60;洞=≈200)
  await page.mouse.move(700, 400);
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await sleep(2400);   // 缓动收敛
  await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; f.zoomTarget = f.zoom; });
  await ticks(3);
  const pan0 = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
  await page.mouse.move(760, 400, { steps: 4 });
  await ticks(3);
  const pan1 = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
  const dpan = pan1 - pan0;
  note('②-4 重开首段 panΔ(修复基线≈60;洞=≈200)', `panΔ=${dpan.toFixed(1)}`);
  check('②-4 重开首段无陈旧跳变(panΔ<100)', dpan < 100, `panΔ=${dpan.toFixed(1)}`);
  await page.mouse.up();
  // 步5:对照——常态复位不回归:确保开图→拖拽(md=true,主渲染帧尾 _fmWasOpen=true)
  await page.evaluate(() => { const r = window.__swGame.renderer; if (!r.fullMap.open) window.__swGame.toggleFullMap(); });
  await ticks(3);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(560, 400, { steps: 4 });
  await ticks(2);
  const s4 = await page.evaluate(() => { const r = window.__swGame.renderer; return { fm: r._fmWasOpen, md: r.mapDragging, lm: r.lastMouse.x }; });
  check('②-5 主渲染路径常态:拖拽态建立+_fmWasOpen 逐帧写 true', s4.fm === true && s4.md === true && s4.lm === 560, JSON.stringify(s4));
  // 步6:按住关图 → 常态复位照跑(RB30a 原面不回归)
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(5);
  const s5 = await page.evaluate(() => { const r = window.__swGame.renderer; return { open: r.fullMap.open, md: r.mapDragging, lm: r.lastMouse.x }; });
  check('②-6 对照:常态复位照跑(md=false,lastMouse=0)', !s5.open && s5.md === false && s5.lm === 0, JSON.stringify(s5));
  await page.mouse.up();
  await hygiene();
}

check('全程零页面异常', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
