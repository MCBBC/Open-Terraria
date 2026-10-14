// ★BJ682c toggle 判别探针:剑(368)与弓(39)双武器 × 星云/星尘 toggle 净可见度
//  + S+ 帧序记录(USE_ITEM 在窗内? COVERED_BLIT q?)。分离「弓特有 bug」vs
//  「BJ681 修复面整体回退」。toggle 方式同 _bj682b(noGraphic 渲染头开关)。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682c';
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
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__bjFrames = 0;
  window.__order = [];
  if (!proto.__bj682cwrap) {
    proto.__bj682cwrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      window.__order = [];
      const gg = window.__swGame;
      if (gg.swing) {
        if (window.__swingPin != null) gg.swing.t = gg.swing.dur * window.__swingPin;
        if (window.__bowHide === true) { gg.swing.__noGBackup = gg.swing.noGraphic; gg.swing.noGraphic = true; }
        else if (window.__bowHide === false && gg.swing.__noGBackup !== undefined) { gg.swing.noGraphic = gg.swing.__noGBackup; }
      }
      return orR.apply(this, a);
    };
    const wraps = {
      flushLunarArmor: (s) => `LUNAR_ARMOR(q=${s.lunarArmorQueue?.length ?? '?'})`,
      flushArmorGlow: (s, a) => `ARMOR_GLOW${a[0] === true ? '(arm)' : '(under)'}(q=${s.armorGlowQueue?.length ?? '?'})`,
      flushLunarCovered: (s) => `COVERED_BLIT(q=${s.lunarCoverQueue?.length ?? '?'
        },areas=[${(s.lunarCoverQueue ?? []).map((e) => `${e.w}x${e.h}:nonEmpty=${(() => {
          const c = e.cv.getContext('2d'); const d = c.getImageData(0, 0, Math.min(e.cv.width, e.w), Math.min(e.cv.height, e.h)).data;
          let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
          return n;
        })()}`).join(' | ')}]`,
      flushItemGlow: (s) => `itemGlow(q=${s.itemGlowQueue?.length ?? '?'})`,
      lunarCoverBegin: () => `>>covBegin`,
      lunarCoverEnd: () => `<<covEnd`,
      drawUseItem: () => `USE_ITEM(weapon)`,
    };
    for (const [k, tag] of Object.entries(wraps)) {
      const orig = proto[k];
      if (!orig) continue;
      proto[k] = function (...a) {
        window.__order.push(tag(this, a));
        return orig.apply(this, a);
      };
    }
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

const strip = () => page.evaluate(() => {
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

const runCase = async (label, weaponVid, ammoVid, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 3);
  await page.evaluate((wv, av) => window.__grantItem(wv, av), weaponVid, ammoVid);
  await pump(page, 5);
  await page.evaluate(() => { window.__aimOnce(); });
  await waitFrames(2);
  await page.evaluate(() => { window.__bowHide = true; });
  await waitFrames(2);
  const sMinus = await strip();
  const orderMinus = await page.evaluate(() => window.__order.slice());
  await page.evaluate(() => { window.__bowHide = false; });
  await waitFrames(2);
  const sPlus = await strip();
  const orderPlus = await page.evaluate(() => window.__order.slice());
  return { label, sMinus, sPlus, orderMinus, orderPlus };
};

const cases = [];
// 剑三态:naked / nebula / stardust
cases.push(await runCase('sword_naked', 368, null, []));
cases.push(await runCase('sword_nebula', 368, null, [2760, 2761, 2762]));
cases.push(await runCase('sword_stardust', 368, null, [3381, 3382, 3383]));
// 弓两态复核
cases.push(await runCase('bow_nebula', 39, 40, [2760, 2761, 2762]));

const weaponVisible = (c) => {
  let n = 0;
  const n4 = Math.min(c.sMinus.px.length, c.sPlus.px.length);
  for (let i = 0; i < n4; i += 4) {
    if (c.sMinus.px[i + 3] < 40 && c.sPlus.px[i + 3] < 40) continue;
    const d = Math.abs(c.sMinus.px[i] - c.sPlus.px[i]) + Math.abs(c.sMinus.px[i + 1] - c.sPlus.px[i + 1])
      + Math.abs(c.sMinus.px[i + 2] - c.sPlus.px[i + 2]) + Math.abs(c.sMinus.px[i + 3] - c.sPlus.px[i + 3]);
    if (d > 45) n++;
  }
  return n;
};

const out = { visible: {}, orders: {} };
for (const c of cases) {
  out.visible[c.label] = weaponVisible(c);
  out.orders[c.label] = { plus: c.orderPlus };
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
