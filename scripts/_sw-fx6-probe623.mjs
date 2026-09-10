// SW-FX6 探针④(2026-09-10):623 星尘守护者 draw 分支实机自证(ai0==2 抖动 rand 流 +
// CurrentDrawnEntityShader==0 的 A/=2 折半,Main.cs:34170-34177)。
// 前提 = 真实星尘套装(armor[0..2] → equipStats.summonSet.guardian → Game 套装段自然
// 生成 623,Game.ts:8552-8556)——623 是套装常驻弹,须由游戏自身维护段生成。
// 实测与主探针(_sw-fx6-probe.mjs)同页复跑时,前序轮次存在 armor 态干涉(探针侧伪影),
// 故本探针独立开页、单独跑 623 一轮。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_sw-fx6-probe623.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 24;
  for (let dx = -80; dx <= 80; dx++) for (let dy = -30; dy <= 2; dy++) {
    st.setTile(px0 + dx, gy + dy, 0);
    st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
  }
  for (let dx = -80; dx <= 80; dx++) st.setTile(px0 + dx, gy + 3, 2);
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  // 真实星尘套装(3381 头/3382 身/3383 腿 → 内部 id)
  const flow = window.__swFlow;
  g.player.inv.armor[0] = { id: flow.itemByVid(3381), stack: 1 };
  g.player.inv.armor[1] = { id: flow.itemByVid(3382), stack: 1 };
  g.player.inv.armor[2] = { id: flow.itemByVid(3383), stack: 1 };
  await sleep(200);   // equipStats 内容键失效重算
  res.guardianOn = !!g.player.equipStats.summonSet?.guardian;

  window.__fx6Tag = 623;
  window.__fx6Count = 0;
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__fx6Hooked) {
    const orig = proto.drawImage;
    proto.drawImage = function (...a) {
      if (window.__fx6Tag != null) window.__fx6Count++;
      return orig.apply(this, a);
    };
    proto.__fx6Hooked = true;
  }

  // 套装段自然生成 623 → 包其 draw 计实调
  let m = null;
  for (let i = 0; i < 100 && !(m = g.entities.projectiles.find((e) => e && e.projId === 623 && !e.dead)); i++) await sleep(16);
  res.found = !!m;
  if (m) {
    const origDraw = m.draw.bind(m);
    m.draw = function (r) { try { return origDraw(r); } finally { void 0; } };
    for (let i = 0; i < 120; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
    await new Promise((r) => setTimeout(r, 800));
    res.alive = !m.dead;
    m.dead = true;
  }
  await new Promise((r) => setTimeout(r, 300));
  res.count = window.__fx6Count;
  return res;
});

check('套装生成条件满足(equipStats.summonSet.guardian)', out.guardianOn === true);
check('④ 623 自然生成并存活', out.found === true && out.alive === true);
check('④ 623 draw 分支实机执行(drawImage 实调 >0)', (out.count ?? 0) > 0, `count=${out.count ?? 0}`);
check('pageerror 全程为空', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`RESULT: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
