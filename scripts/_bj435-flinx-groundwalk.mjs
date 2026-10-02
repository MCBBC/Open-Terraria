// ★BJ435 实机探针：小雪怪法杖（5069）召唤 → 小雪怪 951 落地面（脚不浮空）+ 盒/贴图对齐。
// 运行：SW_ORIGIN=http://localhost:5810 node tools/run-diag.mjs scripts/_bj435-flinx-groundwalk.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5810';
const OUT = new URL('../docs/evidence/bj435/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${origin}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ fail: '未进游戏', errs: errs.slice(0, 3) })); await browser.close(); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));

// ---- 装备小雪怪法杖入当前槽 ----
const equip = await page.evaluate(() => {
  const g = window.__swGame;
  g.setupDevMode();
  const id = window.__swItems?.['vi_5069_FlinxStaff'];
  if (id === undefined) return { fail: 'item key 未注册' };
  g.player.inv.slots[g.player.inv.selected] = { id, stack: 1 };
  g.cb?.onInventoryChanged?.();
  document.querySelector('#sw-welcome-announce')?.remove();
  return { ok: true, slot: g.player.inv.selected, mana: g.player.mana };
});
if (equip.fail) { console.log(JSON.stringify(equip)); await browser.close(); process.exit(1); }

// ---- 真鼠标路径：屏心右下 ~2 格（玩家脚前地面）按住左键 300ms 释放,再等 4s 实时模拟 ----
const rect = await page.evaluate(() => {
  const r = Array.from(document.querySelectorAll('canvas')).map((c)=>c.getBoundingClientRect()).reduce((a,b)=>b.width*b.height>a.width*a.height?b:a, new DOMRect(0,0,0,0));
  return { w: r?.width ?? 1280, h: r?.height ?? 800, x: r?.x ?? 0, y: r?.y ?? 0 };
});
// 预备位:满血+清场(实机僵尸干扰=召唤链/取证被搅)
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.life = g.player.maxHp;
  g.player.dead = false;
  for (const e of g.entities.enemies ?? []) e.dead = true;
});
// 确定性落点：玩家所在行 ±3 内找 3 格净空的平列（与玩家同行=同表面）,屏坐标反查
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const pcx = Math.floor(g.player.cx / 16), prow = Math.floor((g.player.y + g.player.h + 2) / 16);
  const okCol = (c, r) => {
    for (let k = 1; k <= 3; k++) if (st.isSolid(c, r - k) || st.isPlatform(c, r - k)) return false;
    return st.isSolid(c, r) || st.isPlatform(c, r);
  };
  for (let off = 2; off <= 10; off++) {
    for (const c of [pcx + off, pcx - off]) {
      for (const r of [prow, prow - 1, prow + 1]) {
        if (okCol(c, r)) {
          const [sx, sy] = g.camera.worldToScreen(c * 16 + 8, r * 16 - 8);
          return { col: c, row: r, sx: Math.round(sx), sy: Math.round(sy) };
        }
      }
    }
  }
  return null;
});
if (!spot) { console.log(JSON.stringify({ fail: '无平列可落' })); await browser.close(); process.exit(1); }
await page.mouse.move(rect.x + Math.min(Math.max(spot.sx, 8), rect.w - 8), rect.y + Math.min(Math.max(spot.sy, 8), rect.h - 8));
await new Promise((r) => setTimeout(r, 150));
await page.mouse.down();
await new Promise((r) => setTimeout(r, 300));
await page.mouse.up();

// ---- 等 4s（rAF 实时）后读小雪怪落定态 ----
await new Promise((r) => setTimeout(r, 4000));
const summon = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((q) => q?.projId === 951 && !q.dead);
  if (!m) return { fail: '951 未生成', projs: g.entities.projectiles.length,
    mana: g.player.mana, item: g.player.inv.slots[g.player.inv.selected]?.id };
  const p = g.player;
  const [sx, sy] = g.camera.worldToScreen(m.cx, m.cy);
  const [psx, psy] = g.camera.worldToScreen(p.cx, p.cy);
  // 支承面：盒底正下方 2px 的两列（左右列）是否有实心/平台
  const st = g.world.store;
  const brow = Math.floor((m.y + m.h + 2) / 16);
  const sup = [Math.floor(m.x / 16), Math.floor((m.x + m.w) / 16)]
    .map((c) => st.isSolid(c, brow) || st.isPlatform(c, brow));
  return { box: { x: +m.x.toFixed(2), y: +m.y.toFixed(2), w: m.w, h: m.h, bottom: +(m.y + m.h).toFixed(2) },
    feetCol: brow, support: sup, onGround: !!m.onGround,
    player: { bottom: +(p.y + p.h).toFixed(2) },
    screen: { minion: [sx, sy].map(Math.round), player: [psx, psy].map(Math.round) } };
});
if (summon.fail) { console.log(JSON.stringify({ ...summon, alive: await page.evaluate(() => ({ dead: window.__swGame.player.dead, hp: window.__swGame.player.life, paused: window.__swGame.paused })).catch(() => null), errs: errs.slice(0, 3) })); await browser.close(); process.exit(1); }

// ---- 继续等 3s 实时采样 y 轨迹（贴地=恒定;浮空=悬停锚 p.cy−30 振荡） ----
const trace = await page.evaluate(() => {
  const g = window.__swGame;
  const m = g.entities.projectiles.find((q) => q?.projId === 951 && !q.dead);
  if (!m) return { fail: '951 消失' };
  return new Promise((res) => {
    const ys = [];
    const t0 = performance.now();
    const tick = () => {
      ys.push(+(m.y + m.h).toFixed(2));
      if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      else {
        const st = g.world.store;
        const brow = Math.floor((m.y + m.h + 2) / 16);
        const sup = [Math.floor(m.x / 16), Math.floor((m.x + m.w) / 16)]
          .map((c) => st.isSolid(c, brow) || st.isPlatform(c, brow));
        res({ bottoms: ys.filter((_, i) => i % 10 === 0), spread: +(Math.max(...ys) - Math.min(...ys)).toFixed(2),
          finalBottom: ys[ys.length - 1], support: sup, onGround: !!m.onGround });
      }
    };
    requestAnimationFrame(tick);
  });
});

// ---- 截图留档（全屏 + 玩家近景×2） ----
await page.screenshot({ path: `${OUT}bj435-full.png` });
const ccx = (summon.screen.minion[0] + summon.screen.player[0]) / 2;
const ccy = (summon.screen.minion[1] + summon.screen.player[1]) / 2;
const clip = { x: Math.max(0, ccx - 140), y: Math.max(0, ccy - 100), width: 280, height: 200 };
await page.screenshot({ path: `${OUT}bj435-closeup.png`, clip });
await page.screenshot({ path: `${OUT}bj435-closeup@2.png`, clip,
  captureBeyondViewport: false });
// 盒框标注图：canvas 覆绘盒矩形
await page.evaluate((s) => {
  const cv = document.createElement('canvas');
  cv.width = innerWidth; cv.height = innerHeight;
  cv.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none';
  const ctx = cv.getContext('2d');
  ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2;
  ctx.strokeRect(s.mx - 13, s.my - 13, 26, 26);
  ctx.fillStyle = 'rgba(255,48,48,0.25)';
  ctx.fillRect(s.mx - 13, s.my - 13, 26, 26);
  ctx.font = '14px monospace'; ctx.fillStyle = '#ff3030';
  ctx.fillText('hitbox 26x26 (951)', s.mx - 13, s.my - 18);
  document.body.appendChild(cv);
}, { mx: summon.screen.minion[0], my: summon.screen.minion[1] });
await page.screenshot({ path: `${OUT}bj435-box-overlay.png`, clip });

console.log(JSON.stringify({ equip, summon, trace, errs: errs.slice(0, 3) }, null, 1));
await browser.close();
process.exit(0);
