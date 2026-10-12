// ★BJ665b 真机烟测：日耀套恒色甲件（BJ594 登记架构债=免光面）A/B 暗场采样。
//  判别面：午夜地表（光照≈0）——裸装 vs 日耀三件套,甲区亮度跳变=恒色 250³ 直出
//  （lit 窗×0 与恒色件分异）;对照区恒暗=无侧漏;静持火把（holdStyle1）glow 矩阵
//  回改后仍在物品位=重定向窗 itemGlow 校正面;全页零 pageerror（R1-R3 重定向窗
//  无运行时炸面）。昼档记录=日光不褪面（恒色与采光在亮场差异可感度）。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj665b';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5211', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0);          // 午夜
await freezeClock(page, { tod: 0 });
await pump(page, 30);

// 外观补赋（mainFlow 面等价,_bj597 同式）
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj665b');
  p.appearance.pantsColor = { r: 255, g: 220, b: 120 };
  // ★无头渲染饥饿对策：甲位贴图懒加载显式预载（否则 ready() 落空=bake null=裸 fallback）
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',
    'Armor_Head_169.png', 'Armor_Armor_175.png', 'Armor_Legs_110.png',
  ]);
  window.__bjFrames = 0;
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  if (!proto.__bj665fp) {
    proto.__bj665fp = true;
    const orR = proto.render;
    proto.render = function (...a) { window.__bjFrames++; return orR.apply(this, a); };
  }
});
await pump(page, 20);
const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

const sample = (tag) => page.evaluate((t) => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const sx = Math.round((p.x + p.w / 2 - cam.x) * cam.zoom + cv.width / 2);
  const sy = Math.round((p.y + p.h - cam.y) * cam.zoom + cv.height / 2);
  const read = (x, y, w, h) => {
    const img = g.renderer.ctx.getImageData(Math.max(0, x), Math.max(0, y), w, h).data;
    let sum = 0, n = 0, bright = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] > 60) { n++; const v = (img[i] + img[i + 1] + img[i + 2]) / 3; sum += v; if (v > 140) bright++; }
    }
    return { avg: n ? +(sum / n).toFixed(2) : 0, bright, n };
  };
  const out = {
    head: read(sx - 14, sy - 56, 28, 20),
    torso: read(sx - 14, sy - 36, 28, 18),
    legs: read(sx - 14, sy - 18, 28, 16),
    ctrl: read(sx + 40, sy - 56, 30, 40),
  };
  if (t) { out.tag = t; window.__bj665bLast = out; }
  return out;
}, tag);

const clearArmor = () => page.evaluate(() => {
  const p = window.__swGame.player;
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
});
const grantArmor = (vids) => page.evaluate((vs) => {
  const g = window.__swGame, p = g.player;
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
  for (const v of vs) {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
    const slot = v === 2763 || v === 189 ? 0 : v === 2764 || v === 190 ? 1 : 2;
    p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
  }
}, vids);

// ---- A/B：午夜裸装 vs 日耀套 ----
await clearArmor();
await pump(page, 20);
await waitFrames(3);
const naked = await sample('naked');
await grantArmor([2763, 2764, 2765]);   // 日耀全套 171/177/112
await pump(page, 5);
await waitFrames(3);
const solar = await sample('solar');
await page.screenshot({ path: `${OUT}/dark_solar.png` });

// ---- 星旋套对照（无恒色覆写,glow 叠层族——甲区不恒亮） ----
await grantArmor([2757, 2758, 2759]);
await pump(page, 5);
await waitFrames(3);
const vortex = await sample('vortex');
await page.screenshot({ path: `${OUT}/dark_vortex.png` });

// ---- 静持火把（holdStyle1 → collectHeldItemGlow → 矩阵回改重放面） ----
await grantArmor([2763, 2764, 2765]);
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  const k = Object.keys(window.__swItems).find((x) => /^vi_8_/.test(x));   // 火把
  p.inv.slots[0] = { id: window.__swItems[k], stack: 50 };
  p.inv.selected = 0;
});
await pump(page, 5);
await waitFrames(3);
const torch = await sample('torch');
await page.screenshot({ path: `${OUT}/dark_solar_torch.png` });

// ---- 昼档记录（日光不褪面） ----
await unfreeze(page);
await clockSet(page, 0.5);
await pump(page, 10);
await waitFrames(3);
const day = await sample('day');
await page.screenshot({ path: `${OUT}/day_solar.png` });

function unfreeze(pg) { return import('../tools/probe/lib/clock.mjs').then((m) => m.unfreezeClock(pg)); }

const verdict = {
  darkArmorJump: +(solar.torso.avg - naked.torso.avg).toFixed(2),
  darkHeadJump: +(solar.head.avg - naked.head.avg).toFixed(2),
  noSideLeak: solar.ctrl.avg < 60 && naked.ctrl.avg < 60,
  solarLit: solar.torso.avg > 110 && solar.torso.bright > 30,
  vortexNotLit: vortex.torso.avg < solar.torso.avg - 40,   // 漩涡无恒色覆写（glow 叠层族,面读=甲区暗于日耀）
  torchGlowOn: torch.torso.avg > 60,                       // 火把光照+glow(矩阵回改面,位=物品位)
  pageErrors: errors.slice(0, 5),
  samples: { naked, solar, vortex, torch, day },
};
console.log(JSON.stringify(verdict, null, 1));
await browser.close();
