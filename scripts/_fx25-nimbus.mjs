// 一次性探针(FX25 雨云魔杖云绘制单帧取证):
//  用户实报:Nimbus Rod(1244) 召唤云画成【完整动画帧贴图竖排】而非单帧。
//  根因:RainCloudProj.draw 走 drawProj 整图通支(frames 实参缺省 0)——
//  237/243 贴图 28×112(4 帧)/238 54×168(6 帧)整条画出。
//  双相取证:
//   A 离屏直绘(确定性,不依赖相机/背景):RainCloudProj(237)/(238) 真实 draw()
//     到透明画布,量 alpha>0 纵向跨度——修复后≈单帧高(≤45px),
//     缺陷态=整条帧带(237≈112 / 238≈168)。
//   B 实机施法链:holdItem(1244) → 提蓝 → aimAt 天空点 → mouseHold 边沿 →
//     验证 237 过锚 Kill → 238 降雨云 + 239 雨滴实体链,画布截图
//     /tmp/fx25-nimbus.png。
// 运行:SW_ORIGIN=http://localhost:5208 node tools/run-diag.mjs scripts/_fx25-nimbus.mjs
import puppeteer from 'puppeteer-core';
import { holdItem, aimAt, mouseHold } from '../tools/probe/lib/world.mjs';
import { saveCanvasShot } from '../tools/probe/lib/shot.mjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));

const A = [];
const ok = (name, pass, extra) => { A.push({ name, pass: !!pass }); console.log((pass ? '  ok   ' : '  FAIL ') + name + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); };

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&fx25nimbus=' + Date.now(),
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

// ---- A 相:离屏直绘(真实 draw() 接线,透明底 alpha 量跨度) ----
const off = await page.evaluate(async () => {
  const { RainCloudProj } = await import('/src/entities/WeaponProj.ts');
  const arrow = await import('/src/entities/Arrow.ts');
  // 等贴图懒加载就绪(轮询;width 语义对 Image/ImageBitmap 通用,bitmap 无 .complete)
  const waitImg = (id) => new Promise((res) => {
    const t0 = performance.now();
    const poll = () => {
      const img = arrow.projSprite(id);
      if (img && img.width > 0) return res({ w: img.width, h: img.height });
      if (performance.now() - t0 > 8000) return res(null);
      setTimeout(poll, 100);
    };
    poll();
  });
  const img237 = await waitImg(237);
  const img238 = await waitImg(238);
  const measure = (projId, boxW, boxH) => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 280;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const e = new RainCloudProj(80 - boxW / 2, 80 - boxH / 2, 0, 0, 10, 0, projId);
    // 与实体循环同源锚:e 中心置于画布 (80,80);draw(r,cam) 只读 r.ctx
    e.x = 80 - e.w / 2; e.y = 80 - e.h / 2;
    e.draw({ ctx }, {});
    const d = ctx.getImageData(0, 0, 160, 280).data;
    let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1, n = 0;
    for (let y = 0; y < 280; y++) for (let x = 0; x < 160; x++) {
      if (d[(y * 160 + x) * 4 + 3] > 8) {
        n++; if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
      }
    }
    return { tex: img237 && [img237.w, img237.h],
      h: maxY < 0 ? 0 : maxY - minY + 1, w: maxX < 0 ? 0 : maxX - minX + 1,
      y0: maxY < 0 ? -1 : minY, px: n,
      tex238: img238 ? [img238.w, img238.h] : null };
  };
  return { m237: measure(237, 28, 28), m238: measure(238, 54, 28) };
});
// 缺陷态对照:复刻旧 drawProj else 支公式(dest 宽=盒宽、高=盒宽×整图纵横比
// = 整条帧带不除帧数)——量得 237≈112 / 238≈168 即用户所报「多帧竖排堆叠」
const stripCtrl = await page.evaluate(async () => {
  const arrow = await import('/src/entities/Arrow.ts');
  const grab = (id) => new Promise((res) => {
    const t0 = performance.now();
    const poll = () => {
      const img = arrow.projSprite(id);
      if (img && img.width > 0) return res(img);
      if (performance.now() - t0 > 8000) return res(null);
      setTimeout(poll, 100);
    };
    poll();
  });
  const oldElse = (img, boxW, boxH) => {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 280;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const dw = boxW, dh = dw * img.height / img.width;   // 旧式:高按整图纵横比
    ctx.drawImage(img, 80 - img.width / 2, 80 - boxH / 2, dw, dh);
    const d = ctx.getImageData(0, 0, 160, 280).data;
    let minY = 1e9, maxY = -1;
    for (let y = 0; y < 280; y++) for (let x = 0; x < 160; x++)
      if (d[(y * 160 + x) * 4 + 3] > 8) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
    return maxY < 0 ? 0 : maxY - minY + 1;
  };
  return { s237: oldElse(await grab(237), 28, 28), s238: oldElse(await grab(238), 54, 28) };
});
console.log('STRIP-CTRL(缺陷态对照):', JSON.stringify(stripCtrl));
ok('对照:旧式整图公式 237 纵向跨度≈112(整条帧带)', stripCtrl.s237 > 95 && stripCtrl.s237 <= 120, stripCtrl.s237);
ok('对照:旧式整图公式 238 纵向跨度≈168(整条帧带)', stripCtrl.s238 > 150 && stripCtrl.s238 <= 175, stripCtrl.s238);
console.log('OFFSCREEN:', JSON.stringify(off));
ok('237 贴图 28×112(4 帧竖排)就绪', off.m237.tex?.[0] === 28 && off.m237.tex?.[1] === 112, off.m237.tex);
ok('238 贴图 54×168(6 帧竖排)就绪', off.m238.tex238?.[0] === 54 && off.m238.tex238?.[1] === 168, off.m238.tex238);
// 修复后=单帧(帧高 28 源再 −1 shave=27),缺陷态=整条 112/168
ok('237 绘制纵向跨度≈单帧(8..45px,缺陷态≈112)', off.m237.h > 8 && off.m237.h <= 45, off.m237);
ok('238 绘制纵向跨度≈单帧(8..45px,缺陷态≈168)', off.m238.h > 8 && off.m238.h <= 45, off.m238);
ok('238 绘制横向跨度≈盒宽 54', off.m238.w > 30 && off.m238.w <= 58, off.m238.w);
ok('237 绘制起于盒顶(y0≈66±6,非整条上溢)', Math.abs(off.m237.y0 - 66) <= 6, off.m237.y0);

// ---- B 相:实机施法链 1244 → 237 → 238 + 239 ----
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.baseMaxMana = 400; p.mana = 400;   // 雨云魔杖耗蓝 30,起步蓝 20 不够
});
const held = await holdItem(page, 1244, 1, 0);
ok('holdItem 1244 雨云魔杖', held === true, held);
// 天空锚点:玩家头顶找 220px 净空(供 237 飞行 + 238 驻留 + 239 落滴)
const target = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.store, p = g.player;
  const clearBox = (cx, cy) => {           // (cx,cy)±(70,45) 世界像素内无实心
    for (let y = Math.floor((cy - 45) / 16); y <= Math.floor((cy + 45) / 16); y++)
      for (let x = Math.floor((cx - 70) / 16); x <= Math.floor((cx + 70) / 16); x++)
        if (w.inBounds(x, y) && w.isSolid(x, y)) return false;
    return true;
  };
  // dx 斜射优先:dx=0 垂直施法时 vx=cos(−π/2)*16≈1e-16,原版过锚门 `velocity.X == 0f`
  // (cs:28361 精确零比较)+ cx==anchorX 恰等 → 双旗永不齐 = 云悬停,原版同款退化
  // 证(测量零事件,非本仓缺陷);真实玩家斜射不受影响,探针照斜射取景
  for (const dy of [220, 260, 180]) {
    for (const dx of [80, -80, 160, -160, 0]) {
      const cx = p.cx + dx, cy = p.cy - dy;
      if (clearBox(cx, cy)) return { wx: cx, wy: cy };
    }
  }
  return null;
});
ok('找到净空天空锚点', !!target, target);
if (target) {
  await aimAt(page, target.wx, target.wy);
  await mouseHold(page, true);
  await new Promise((r) => setTimeout(r, 250));
  await mouseHold(page, false);
  await new Promise((r) => setTimeout(r, 3200));   // 237 飞抵锚 → Kill 变 238 → 降雨若干拍
  const live = await page.evaluate(() => {
    const g = window.__swGame;
    const ps = g.entities.projectiles.filter((p) => p.constructor.name === 'RainCloudProj');
    const c = ps.find((p) => p.projId === 237);
    return {
      rain238: ps.filter((p) => p.projId === 238 && !p.dead).length,
      move237: ps.filter((p) => p.projId === 237 && !p.dead).length,
      drops239: ps.filter((p) => p.projId === 239 && !p.dead).length,
      frames: ps.filter((p) => p.projId === 238).map((p) => p.frame),
      st: c ? { x: Math.round(c.x), y: Math.round(c.y), vx: c.vx, vy: c.vy, w: c.w, h: c.h,
        cx: Math.round(c.cx), cy: Math.round(c.cy) } : null,
      mouse: [g.input.mouseX, g.input.mouseY],
      player: [Math.round(g.player.cx), Math.round(g.player.cy)],
    };
  });
  console.log('LIVE:', JSON.stringify(live));
  ok('移动云 237 已过锚 Kill 变身(在场数=0)', live.move237 === 0, live.move237);
  ok('降雨云 238 在场', live.rain238 >= 1, live.rain238);
  ok('雨滴 239 已从云底出生', live.drops239 >= 1, live.drops239);
  ok('238 帧序在 0..5 帧带内循环', live.frames.every((f) => f >= 0 && f <= 5), live.frames);
  await saveCanvasShot(page, '/tmp/fx25-nimbus.png');
  console.log('saved /tmp/fx25-nimbus.png');
}

if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
const failed = A.filter((a) => !a.pass);
console.log(failed.length ? `FAIL ${failed.length}/${A.length}` : `ALL PASS ${A.length}/${A.length}`);
await browser.close();
process.exit(failed.length ? 1 : 0);
