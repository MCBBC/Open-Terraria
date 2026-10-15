// ★BJ682i 630 载体定点采样:读 630 弹 cx/cy,以其屏幕位置为中心 48×48 小窗,
//  naked vs 各套差分 + 非空像素计数(载体可见度直测)。附帧序(glow 冲刷序)。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682i';
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
  ]);
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__order = [];
  window.__bjFrames = 0;
  if (!proto.__bj682iwrap) {
    proto.__bj682iwrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      window.__order = [];
      return orR.apply(this, a);
    };
    const wraps = {
      flushLunarArmor: (s) => `LUNAR_ARMOR(q=${s.lunarArmorQueue?.length ?? '?'})`,
      flushArmorGlow: (s, ar) => `ARMOR_GLOW${ar[0] === true ? '(arm)' : '(under)'}(q=${s.armorGlowQueue?.length ?? '?'})`,
      flushLunarCovered: (s) => `COVERED_BLIT(q=${s.lunarCoverQueue?.length ?? '?'})`,
      flushItemGlow: (s) => `itemGlow(q=${s.itemGlowQueue?.length ?? '?'})`,
      flushSolarShieldQueue: (s) => `SOLAR_SHIELD(q=${s.solarShieldQueue?.length ?? '?'})`,
      flushHeldProjCarriers: (s) => `CARRIER_630(q=${s.heldProjCarrierQueue?.length ?? '?'})`,
      flushEyebrellaCloud: () => `eyebrella`,
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
  window.__holdFire = (ticks) => {
    const gg = window.__swGame, pp = gg.player;
    const cv = gg.renderer.canvas;
    pp.facing = 1; pp.dir = 1;
    gg.input.mouseX = Math.round(cv.width / 2 + 120);
    gg.input.mouseY = Math.round(cv.height / 2 - 8);
    gg.input.mouseDown = true; gg.input.mouseHeld = true;
    for (let i = 0; i < ticks; i++) gg.fixedUpdate(1 / 60);
    gg.input.mouseDown = false; gg.input.mouseHeld = false;
  };
});
await pump(page, 10);

const waitRaf = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

await page.evaluate(() => window.__grantItem(3540, 40));
await pump(page, 5);

// 定点采样:以 630 弹 cx/cy 为中心 48×48;无弹回退 null
const carrierSample = () => page.evaluate(() => {
  const g = window.__swGame, cam = g.camera, cv = g.renderer.canvas;
  const car = g.entities.projectiles.find((e) => !e.dead && e.projId === 630);
  if (!car) return null;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const cx = px(car.cx), cy = py(car.cy);
  const img = g.renderer.ctx.getImageData(cx - 24, cy - 24, 48, 48).data;
  const out = [];
  let opaque = 0, lum = 0;
  for (let i = 0; i < img.length; i += 4) {
    out.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
    if (img[i + 3] > 40) { opaque++; lum += img[i] + img[i + 1] + img[i + 2]; }
  }
  return { carX: car.cx, carY: car.cy, rot: Math.atan2(car.vy, car.vx).toFixed(2), opaque, avgLum: opaque ? Math.round(lum / opaque) : 0, px: out };
});

const runCase = async (name, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 4);
  await page.evaluate(() => { window.__holdFire(30); });
  await waitRaf(3);
  const order = await page.evaluate(() => window.__order.slice());
  const c = await carrierSample();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return { name, order, c };
};

const naked = await runCase('naked', []);
const stardust = await runCase('stardust', [3381, 3382, 3383]);
const nebula = await runCase('nebula', [2760, 2761, 2762]);
const solar = await runCase('solar', [2763, 2764, 2765]);

const diff = (a, b) => {
  if (!a || !b) return 'carrier-missing';
  let n = 0, wash = 0, dark = 0;
  const n4 = Math.min(a.px.length, b.px.length);
  for (let i = 0; i < n4; i += 4) {
    if (a.px[i + 3] < 40 && b.px[i + 3] < 40) continue;
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    if (d > 45) n++;
    const la = a.px[i] + a.px[i + 1] + a.px[i + 2], lb = b.px[i] + b.px[i + 1] + b.px[i + 2];
    if (d > 45 && lb - la > 90) wash++;
    if (d > 45 && la - lb > 90) dark++;
  }
  return { diffPx: n, wash, dark };
};
const meta = (c) => c ? { carX: +c.carX.toFixed(0), carY: +c.carY.toFixed(0), rot: c.rot, opaque: c.opaque, avgLum: c.avgLum } : null;

console.log(JSON.stringify({
  carrier: { naked: meta(naked.c), stardust: meta(stardust.c), nebula: meta(nebula.c), solar: meta(solar.c) },
  carrierDiffVsNaked: { stardust: diff(naked.c, stardust.c), nebula: diff(naked.c, nebula.c), solar: diff(naked.c, solar.c) },
  orderStardust: stardust.order,
  orderNaked: naked.order,
  pageErrors: errors.slice(0, 5),
}, null, 1));
await browser.close();
