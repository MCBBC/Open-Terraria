// ★BJ682f 遮蔽定位探针:双场景(naked vs 各套)同条带原始像素导出,离线差异聚类
//  ——定位「弓被遮」发生在哪个子区域(弓身/手柄/臂部),输出差异像素的坐标网格。
//  并测朝左瞄准(facing=-1)方向对称面。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682f';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5203', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0.5);
await freezeClock(page, { tod: 0.5 });
await pump(page, 20);

await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj682');
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_170.png', 'Armor_Armor_176.png', 'Armor_Legs_111.png',
    'Armor_Head_189.png', 'Armor_Armor_190.png', 'Armor_Legs_130.png',
  ]);
  window.__grantItem = (vid, ammoVid) => {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + vid + '_').test(x));
    p.inv.slots[0] = { id: window.__swItems[k], stack: 1 };
    p.inv.selected = 0;
    if (ammoVid != null) {
      const ak = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + ammoVid + '_').test(x));
      p.inv.slots[54] = { id: window.__swItems[ak], stack: 999 };
    } else p.inv.slots[54] = null;
  };
  window.__wear = (vids) => {
    p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
    for (const v of vids) {
      const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
      const slot = [170, 171, 169, 189, 2763, 2760, 2757, 3381].includes(v) ? 0
        : [176, 177, 175, 190, 2764, 2761, 2758, 3382].includes(v) ? 1 : 2;
      p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
    }
  };
  window.__aimOnce = (dir) => {
    const gg = window.__swGame, pp = gg.player;
    const cv = gg.renderer.canvas;
    const dx = dir === 'left' ? -120 : 120;
    pp.facing = dir === 'left' ? -1 : 1; pp.dir = pp.facing;
    gg.input.mouseX = Math.round(cv.width / 2 + dx);
    gg.input.mouseY = Math.round(cv.height / 2 - 8);
    pp.useTime = 0;
    gg.input.mouseDown = true;
    gg.fixedUpdate(1 / 60);
    gg.input.mouseDown = false;
    for (const e of gg.entities.projectiles) if (e.dead === false && typeof e.projId === 'number') e.dead = true;
  };
});
await pump(page, 10);

const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames !== undefined ? window.__bjFrames : 0);
  await page.waitForFunction((n) => {
    if (window.__bjFrames === undefined) return false;
    return window.__bjFrames >= window.__bjTarget;
  }, { timeout: 60000 }, n);
};

// 帧计数器(不 wrap render——用 rAF 计数即可,swingPin 在采帧前手动施加)
await page.evaluate(() => {
  window.__bjFrames = 0; window.__bjTarget = 0;
  const tick = () => { window.__bjFrames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const waitRaf = async (n) => {
  await page.evaluate((n) => { window.__bjTarget = window.__bjFrames + n; }, n);
  await page.waitForFunction(() => window.__bjFrames >= window.__bjTarget, { timeout: 60000 });
};

// 宽条带:玩家两侧 ±64px,高 cy±32(覆盖弓两向+躯干边缘)
const strip = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const sw = g.swing;
  if (sw) sw.t = sw.dur * 0.5;   // 采帧前钉相
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx - 64), x1 = px(p.cx + 64);
  const y0 = py(p.y + p.h / 2 - 32), y1 = py(p.y + p.h / 2 + 32);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  const out = [];
  for (let i = 0; i < img.length; i += 4) out.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
  return { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), px: out };
});

const runCase = async (armorVids, dir) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 5);
  await page.evaluate((d) => window.__aimOnce(d), dir);
  await waitRaf(3);
  const s = await strip();
  await waitRaf(2);
  const s2 = await strip();   // 相邻帧(时序噪声对照)
  return { s, s2 };
};

await page.evaluate(() => window.__grantItem(39, 40));
await pump(page, 5);

const res = {};
res.nakedR = await runCase([], 'right');
res.stardustR = await runCase([3381, 3382, 3383], 'right');
res.nebulaR = await runCase([2760, 2761, 2762], 'right');
res.nakedL = await runCase([], 'left');
res.stardustL = await runCase([3381, 3382, 3383], 'left');

// 离线差异分析:命名场景 vs naked 同向
const analyze = (naked, armored, label) => {
  const { w, h } = naked.s;
  const n4 = Math.min(naked.s.px.length, armored.s.px.length);
  const grid = [];   // 差异密度网格(8px 格)
  const gw = Math.ceil(w / 8), gh = Math.ceil(h / 8);
  const dens = new Array(gw * gh).fill(0);
  let n = 0, wash = 0, dark = 0;
  const samples = [];
  for (let i = 0; i < n4; i += 4) {
    const a = naked.s, b = armored.s;
    if (a.px[i + 3] < 40 && b.px[i + 3] < 40) continue;
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    if (d > 60) {
      n++;
      const pi = i / 4;
      const gx = Math.floor((pi % w) / 8), gy = Math.floor(Math.floor(pi / w) / 8);
      dens[gy * gw + gx]++;
      const la = a.px[i] + a.px[i + 1] + a.px[i + 2], lb = b.px[i] + b.px[i + 1] + b.px[i + 2];
      if (lb - la > 90) wash++;
      if (la - lb > 90) dark++;
      if (samples.length < 12) samples.push({ x: pi % w, y: Math.floor(pi / w), n: [a.px[i], a.px[i + 1], a.px[i + 2], a.px[i + 3]], a: [b.px[i], b.px[i + 1], b.px[i + 2], b.px[i + 3]] });
    }
  }
  // 相邻帧噪声(naked.s vs naked.s2)
  let noise = 0;
  for (let i = 0; i < n4; i += 4) {
    const a = naked.s, b = naked.s2;
    if (a.px[i + 3] < 40 && b.px[i + 3] < 40) continue;
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    if (d > 60) noise++;
  }
  // 网格可视化(行=girdy,字符密度)
  const lines = [];
  for (let y = 0; y < gh; y++) {
    let ln = '';
    for (let x = 0; x < gw; x++) {
      const c = dens[y * gw + x];
      ln += c === 0 ? '.' : c < 4 ? '1' : c < 10 ? '2' : c < 25 ? '3' : '4';
    }
    lines.push(ln);
  }
  return { label, diffPx: n, wash, dark, noisePx: noise, grid: lines, samples };
};

const out = [
  analyze(res.nakedR, res.stardustR, 'stardustR'),
  analyze(res.nakedR, res.nebulaR, 'nebulaR'),
  analyze(res.nakedL, res.stardustL, 'stardustL'),
];
for (const o of out) {
  console.log(`\n===== ${o.label} diff=${o.diffPx} wash=${o.wash} dark=${o.dark} noise=${o.noisePx} =====`);
  for (const ln of o.grid) console.log(ln);
  console.log('samples(naked→armored):', JSON.stringify(o.samples.slice(0, 8)));
}
console.log('\npageErrors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
