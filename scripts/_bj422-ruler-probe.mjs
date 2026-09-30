// ★BJ422 标尺网格实机探针（用户实报：①标尺网格暗处/深处消失 ②应像原版一样在
//  完全黑暗中亮青显示）。判别面 = 同机位「网格开/关」双拍像素差分：
//  · 修正后：黑暗封闭气囊 diff 高（格子不吃光照,黑暗中照画）+地表 diff 高
//  · 病灶态（回插 4.56 世界层旧调用位）：黑暗气囊 diff≈0（被 compositeLight 乘光
//    压灭,=用户实报的消失症状）、地表 diff 高（亮处乘光≈1,格子照常=截图 49 形态）
// 运行：SW_ORIGIN=http://localhost:5610 node tools/run-diag.mjs scripts/_bj422-ruler-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5610';
const EV = new URL('../docs/evidence/bj422/', import.meta.url).pathname;
mkdirSync(EV, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}

// 授机械标尺 2799 进背包（rulerGrid 判定域=背包∪装备扫描）;线关（隔离网格面）
const grant = await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_2799_/.test(k));
  if (!key) return { ok: false, keys: Object.keys(byKey).filter((k) => /2799/.test(k)) };
  g.player.inv.slots[10] = { id: byKey[key], stack: 1 };
  g.player.builderAccStatus[1] = 0;   // RulerGrid 开
  g.player.builderAccStatus[0] = 1;   // RulerLine 关（隔离网格;线/读数另案）
  return { ok: true, key, spawn: { x: g.player.x, y: g.player.y }, world: { w: g.world.store.w, h: g.world.store.h, groundLevel: g.world.groundLevel } };
});
console.log('GRANT:', JSON.stringify(grant));
if (!grant.ok) { console.error('FAIL: 2799 未注册'); await browser.close(); process.exit(2); }

/** 在页内做「网格开/关」双拍差分：返回中心盒 diff 像素数与网格感知亮度 */
async function gridDiff(tag) {
  // rAF 对齐后读注入态（builderRulers 由 Game.render 每帧写,直读会撞帧界）
  const pre = await page.evaluate(() => new Promise((res) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = window.__swGame.renderer, p = window.__swGame.player;
      res({ br: r.builderRulers ? { gridOn: r.builderRulers.gridOn, gridDist: Math.round(r.builderRulers.gridDist * 100) / 100, speed: Math.round(r.builderRulers.speed * 100) / 100 } : null, dead: !!p.dead, hp: p.hp });
    }));
  }));
  console.log(`PRE[${tag}]`, JSON.stringify(pre));
  const grab = () => page.evaluate(() => {
    let best = null, area = 0;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width * c.height > area) { area = c.width * c.height; best = c; } });
    const c2 = best.getContext('2d');
    const bx = Math.round(best.width * 0.25), by = Math.round(best.height * 0.30);
    const bw = Math.round(best.width * 0.50), bh = Math.round(best.height * 0.40);
    return { d: [...c2.getImageData(bx, by, bw, bh).data], bx, by, bw, bh, cvw: best.width, cvh: best.height };
  });
  const on = await grab();
  await page.evaluate(() => { window.__swGame.player.builderAccStatus[1] = 1; });   // 网格关
  await new Promise((r) => setTimeout(r, 350));
  const off = await grab();
  await page.evaluate(() => { window.__swGame.player.builderAccStatus[1] = 0; });   // 网格开(还原)
  let diff = 0, sumB = 0, cyan = 0;
  for (let i = 0; i < on.d.length; i += 4) {
    const dr = Math.abs(on.d[i] - off.d[i]), dg = Math.abs(on.d[i + 1] - off.d[i + 1]), db = Math.abs(on.d[i + 2] - off.d[i + 2]);
    if (dr > 10 || dg > 10 || db > 10) diff++;
    sumB += on.d[i + 2];
    // 网格青系直检：B>G>R 且 B−R>18（背景近黑灰→不命中;青 (61,204,229)×α 家族命中）
    const r0 = on.d[i], g0 = on.d[i + 1], b0 = on.d[i + 2];
    if (b0 > g0 && g0 > r0 && b0 - r0 > 18) cyan++;
  }
  const avgB = (sumB / (on.d.length / 4)).toFixed(1);
  const st = await page.evaluate(() => {
    const g = window.__swGame, r = g.renderer, p = g.player;
    return {
      br: r.builderRulers ? { gridOn: r.builderRulers.gridOn, gridDist: Math.round(r.builderRulers.gridDist * 10) / 10, speed: Math.round(r.builderRulers.speed * 100) / 100 } : null,
      paused: !!g.paused, vy: Math.round(p.vy * 100) / 100,
    };
  });
  console.log(`DIFF[${tag}] diffPx=${diff} cyanPx=${cyan} avgBlue=${avgB} box=${on.bw}x${on.bh} state=${JSON.stringify(st)}`);
  return { diff, cyan, avgB: Number(avgB), state: st };
}

async function settle(ms) {
  // 钉速+回血+等落稳（y 连续 8 采样不变）→ 残影 4~5 拍归位→网格满幅;末尾再钉一次防自由落体
  let lastY = NaN, stable = 0;
  for (let k = 0; k < ms / 60; k++) {
    const st = await page.evaluate(() => {
      const p = window.__swGame.player;
      p.hp = p.maxHp; p.vx = 0; p.vy = 0;
      return { y: p.y, dead: !!p.dead, hp: p.hp };
    });
    await new Promise((r) => setTimeout(r, 60));
    if (st.dead) throw new Error('player died during settle (fall damage?)');
    if (st.y === lastY) { if (++stable >= 8) break; } else { stable = 0; lastY = st.y; }
  }
  await page.evaluate(() => {
    const p = window.__swGame.player;
    p.hp = p.maxHp; p.vx = 0; p.vy = 0; p.fallStartY = null;   // 清摔伤锚（Player.ts:1162）
  });
  await new Promise((r) => setTimeout(r, 800));
}

// ---- 场景 A：深层大洞穴空腔（7×7 全空+无液,y>rockLevel+100 = 天空光死区） ----
const darkSpot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const yStart = Math.max(20, Math.round(g.world.rockLevel) + 100);
  for (let y = yStart; y < st.h - 30; y += 2) {
    for (let x = 30; x < st.w - 40; x += 2) {
      let air = true;
      for (let j = 0; j < 7 && air; j++) for (let i = 0; i < 7; i++) {
        const li = st.idx(x + i, y + j);
        if (st.type[li] !== 0 || st.liquid[li] !== 0) { air = false; break; }
      }
      if (air) return { x: x + 3, y: y + 3 };
    }
  }
  return null;
});
console.log('DARK_SPOT:', JSON.stringify(darkSpot));
if (!darkSpot) { console.error('FAIL: 未找到深层空腔'); await browser.close(); process.exit(2); }

// 落位=空腔正下方的实心地面（贴地站立即静止,免摔伤/免残影漂移）
const darkLand = await page.evaluate(({ x, y }) => {
  const g = window.__swGame, st = g.world.store;
  for (let ty = y + 4; ty < Math.min(st.h - 4, y + 60); ty++) {
    let solid = true;
    for (let i = -2; i <= 2; i++) if (st.type[st.idx(x + i, ty)] === 0) { solid = false; break; }
    if (solid) return { x, y: ty };
  }
  return null;
}, darkSpot);
console.log('DARK_LAND:', JSON.stringify(darkLand));
if (!darkLand) { console.error('FAIL: 空腔下未找到地面'); await browser.close(); process.exit(2); }

await page.evaluate(({ x, y }) => {
  const p = window.__swGame.player;
  p.x = x * 16; p.y = y * 16 - p.h - 2; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.fallStartY = null;
}, darkLand);
await settle(1800);
const dark = await gridDiff('dark-pocket');
await page.screenshot({ path: EV + 'bj422-dark-fixed.png' });

// ---- 场景 B：地表出生点亮处（对照=两种形态下 diff 都应高） ----
await page.evaluate((spawn) => {
  const p = window.__swGame.player;
  p.x = spawn.x; p.y = spawn.y; p.vx = 0; p.vy = 0; p.hp = p.maxHp;
}, grant.spawn);
await settle(1500);
const surface = await gridDiff('surface');
await page.screenshot({ path: EV + 'bj422-surface-fixed.png' });

const A = (c, m) => { if (!c) { console.error('FAIL: ' + m); process.exitCode = 1; } };

// ---- 场景 C：暗位标尺线+读数（Ruler 档;同域光照无关验证——线体 (48,163,183) 直加） ----
await page.evaluate(({ x, y }) => {
  const p = window.__swGame.player;
  p.x = x * 16; p.y = y * 16 - p.h - 2; p.vx = 0; p.vy = 0; p.hp = p.maxHp; p.fallStartY = null;
  p.builderAccStatus[0] = 0;   // RulerLine 开
}, darkLand);
await page.mouse.move(720, 550);   // 离屏心 ~4×4 格（zoom 1.25,20px/格）
await settle(1200);
const lines = await page.evaluate(() => new Promise((res) => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    let best = null, area = 0;
    document.querySelectorAll('canvas').forEach((c) => { if (c.width * c.height > area) { area = c.width * c.height; best = c; } });
    const c2 = best.getContext('2d');
    const d = c2.getImageData(0, 0, best.width, best.height).data;
    let lineCyan = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r0 = d[i], g0 = d[i + 1], b0 = d[i + 2];
      if (b0 > 120 && g0 > 100 && r0 < 110 && b0 - r0 > 60) lineCyan++;
    }
    res({ lineCyan, readout: window.__swGame.renderer.rulerReadout?.text ?? null });
  }));
}));
await page.screenshot({ path: EV + 'bj422-dark-lines.png' });
console.log('LINES[dark]:', JSON.stringify(lines));

A(lines.lineCyan > 300, `暗位标尺线像素=${lines.lineCyan}（应 >300=黑暗中线体照画）`);
A(!!lines.readout, `暗位 W×H 读数=${lines.readout}（应非 null）`);
A(dark.diff > 4000, `黑暗气囊网格 diff=${dark.diff}（应 >4000=黑暗中格子照画）`);
A(surface.diff > 4000, `地表网格 diff=${surface.diff}（应 >4000=亮处格子照常）`);
A(errs.length === 0, `页面异常: ${errs[0] ?? ''}`);
console.log(JSON.stringify({ dark, surface, lines, errs: errs.slice(0, 3) }));
console.log(process.exitCode ? 'PROBE FAILED' : 'PROBE OK (fixed-state)');
await browser.close();
