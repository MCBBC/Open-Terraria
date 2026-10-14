// ★BJ682b 弓净可见度探针:分离「弓像素贡献」与「甲面差异」。
//  方法:同一帧状态(同甲+同 swing 相位+同身体行)下,渲染头 toggle swing.noGraphic
//  ——on=弓不画(S-),off=弓画(S+);|S+ − S−| = 弓在该装备下的净可见像素。
//  裸装 vs 各套对比:遮弓率 = 1 − bowVisible(armor)/bowVisible(naked)。
//  wash 判定:弓像素在甲装下 vs 裸装下的亮度差(glow 加色洗白=显著变亮)。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682b';
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
    'Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',
    'Armor_Head_189.png', 'Armor_Armor_190.png', 'Armor_Legs_130.png',
    'Armor_Head_169.png', 'Armor_Armor_175.png', 'Armor_Legs_110.png',
  ]);
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__bjFrames = 0;
  if (!proto.__bj682bwrap) {
    proto.__bj682bwrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      const gg = window.__swGame;
      if (gg.swing) {
        if (window.__swingPin != null) gg.swing.t = gg.swing.dur * window.__swingPin;
        if (window.__bowHide === true) { gg.swing.__noGBackup = gg.swing.noGraphic; gg.swing.noGraphic = true; }
        else if (window.__bowHide === false && gg.swing.__noGBackup !== undefined) { gg.swing.noGraphic = gg.swing.__noGBackup; }
      }
      return orR.apply(this, a);
    };
  }
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
  window.__aimOnce = () => {
    const gg = window.__swGame, pp = gg.player;
    const cv = gg.renderer.canvas;
    pp.facing = 1; pp.dir = 1;
    gg.input.mouseX = Math.round(cv.width / 2 + 120);
    gg.input.mouseY = Math.round(cv.height / 2 - 8);
    pp.useTime = 0;
    gg.input.mouseDown = true;
    gg.fixedUpdate(1 / 60);
    gg.input.mouseDown = false;
  };
});
await pump(page, 10);

const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

await page.evaluate(() => { window.__swingPin = 0.5; });
await page.evaluate(() => window.__grantItem(39, 40));   // 木弓+木箭
await pump(page, 5);

const bowStrip = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx - 10), x1 = px(p.cx + 76);
  const y0 = py(p.y - 10), y1 = py(p.y + 46);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  const out = [];
  for (let i = 0; i < img.length; i += 4) out.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
  return { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), px: out };
});

// 同帧 toggle 两采:aimOnce 起手 → hide 采 S− → show 采 S+(相位钉死不变)
const runCase = async (name, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 5);
  await page.evaluate(() => { window.__aimOnce(); });
  await waitFrames(2);
  await page.evaluate(() => { window.__bowHide = true; });
  await waitFrames(2);
  const sMinus = await bowStrip();
  await page.screenshot({ path: `${OUT}/${name}_noBow.png` });
  await page.evaluate(() => { window.__bowHide = false; });
  await waitFrames(2);
  const sPlus = await bowStrip();
  await page.screenshot({ path: `${OUT}/${name}_bow.png` });
  return { name, sMinus, sPlus };
};

const cases = [];
cases.push(await runCase('naked', []));
cases.push(await runCase('stardust', [3381, 3382, 3383]));
cases.push(await runCase('nebula', [2760, 2761, 2762]));
cases.push(await runCase('solar', [2763, 2764, 2765]));
cases.push(await runCase('vortex', [2757, 2758, 2759]));

// 弓净贡献 = |S+ − S−| 显著差像素;附亮度漂移统计(每差分像素:甲装 vs 裸装的亮度比)
const bowVisible = (c) => {
  let n = 0, lumPlus = 0, lumMinus = 0;
  const n4 = Math.min(c.sMinus.px.length, c.sPlus.px.length);
  for (let i = 0; i < n4; i += 4) {
    const aA = c.sMinus.px[i + 3], aB = c.sPlus.px[i + 3];
    if (aA < 40 && aB < 40) continue;
    const d = Math.abs(c.sMinus.px[i] - c.sPlus.px[i]) + Math.abs(c.sMinus.px[i + 1] - c.sPlus.px[i + 1]) + Math.abs(c.sMinus.px[i + 2] - c.sPlus.px[i + 2]) + Math.abs(aA - aB);
    if (d > 45) {
      n++;
      lumPlus += c.sPlus.px[i] + c.sPlus.px[i + 1] + c.sPlus.px[i + 2];
      lumMinus += c.sMinus.px[i] + c.sMinus.px[i + 1] + c.sMinus.px[i + 2];
    }
  }
  return { visiblePx: n, avgLumWithBow: n ? Math.round(lumPlus / n) : 0, avgLumNoBow: n ? Math.round(lumMinus / n) : 0 };
};

const base = bowVisible(cases[0]);
const per = {};
for (const c of cases) per[c.name] = bowVisible(c);
const cover = {};
for (const [k, v] of Object.entries(per)) {
  if (k === 'naked') continue;
  cover[k] = {
    bowVisiblePx: v.visiblePx,
    bowVisibleRatio: base.visiblePx ? +(v.visiblePx / base.visiblePx).toFixed(3) : null,
    lumDelta: v.avgLumWithBow - v.avgLumNoBow,   // 弓像素处甲装下的加色/减色(对照裸装见下行)
  };
}
const lumBase = base.avgLumWithBow - base.avgLumNoBow;
console.log(JSON.stringify({
  nakedBaseline: { bowVisiblePx: base.visiblePx, lumDelta: lumBase },
  cover,
  lumDeltaVsNaked: Object.fromEntries(Object.entries(per).filter(([k]) => k !== 'naked')
    .map(([k, v]) => [k, v.avgLumWithBow - v.avgLumNoBow - lumBase])),
  pageErrors: errors.slice(0, 5),
}, null, 1));
await browser.close();
