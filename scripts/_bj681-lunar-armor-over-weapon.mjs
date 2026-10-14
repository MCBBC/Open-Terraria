// ★BJ681 真机定谳探针：月套甲盖住挥舞武器（用户实报「星云套和日耀套……挥动武器
//  等时,甲的绘制层级也高于武器本身」）。
//  判别面：
//   A) 帧内绘制序（机制级真相）：包 Renderer 冲刷族/重定向窗/drawUseItem,记录
//      「武器画点 vs armorGlow/lunarArmor/covered blit/solarShield 冲刷点」先后序。
//      原版锚（PlayerDrawLayers/LegacyPlayerRenderer.cs:227-234 亲读）：
//      13/17/21 甲+glow < 22 FaceAcc < 23 MountFront < 24 Pulley < 26 SolarShield
//      < 27 HeldItem(武器) < 28 ArmOverItem(臂 glow) < 37 BeetleBuff < 38 Eyebrella。
//   B) 像素 A/B：正午冻结同一挥舞相位（swing.t 钉半程）,甲装 vs 裸装,刀身条带
//      差分（被 glow/盾球盖掉的量）。
//  套装族：星云 2760/2761/2762（glow 族,lunarHoist=null）;日耀 2763/2764/2765
//  （恒色族,win 开）;漩涡 2757/2758/2759（glow 族对照）;星尘 3381/3382/3383。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj681';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5211', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0.5);          // 正午（全亮=scratch 烘焙跳过档,免光照差干扰）
await freezeClock(page, { tod: 0.5 });
await pump(page, 20);

// 外观+装备脚手架（_bj665b 同式）
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj681');
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_170.png', 'Armor_Armor_176.png', 'Armor_Legs_111.png',   // 星云
    'Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',   // 日耀
    'Armor_Head_189.png', 'Armor_Armor_190.png', 'Armor_Legs_130.png',   // 星尘
    'Armor_Head_169.png', 'Armor_Armor_175.png', 'Armor_Legs_110.png',   // 漩涡
  ]);
  // 帧计数 + 挥舞钉相 + 冲刷序记录
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__bjFrames = 0;
  window.__order = [];
  if (!proto.__bj681wrap) {
    proto.__bj681wrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      window.__order = [];
      // 冻结相位钉子：渲染头把挥舞 t 钉到目标相位（若在挥舞）
      const gg = window.__swGame;
      if (gg.swing && window.__swingPin != null) gg.swing.t = gg.swing.dur * window.__swingPin;
      const r = orR.apply(this, a);
      return r;
    };
    const wraps = {
      flushWingGlow: (s) => `wingGlow(q=${s.wingGlowQueue?.length ?? '?'})`,
      flushLunarArmor: (s) => `LUNAR_ARMOR(q=${s.lunarArmorQueue?.length ?? '?'})`,
      flushArmorGlow: (s, a) => `ARMOR_GLOW${a[0] === true ? '(arm)' : '(under)'}(q=${s.armorGlowQueue?.length ?? '?'
        },tex=[${(s.armorGlowQueue ?? []).flatMap((e) => e.ops.map((o) => o.tex.replace('vanilla/', ''))).join(',')}]`,
      flushLunarCovered: (s) => `COVERED_BLIT(q=${s.lunarCoverQueue?.length ?? '?'})`,
      flushItemGlow: (s) => `itemGlow(q=${s.itemGlowQueue?.length ?? '?'})`,
      flushSolarShieldQueue: (s) => `SOLAR_SHIELD(q=${s.solarShieldQueue?.length ?? '?'})`,
      flushEyebrellaCloud: () => `eyebrella`,
      lunarCoverBegin: () => `>>covBegin`,
      lunarCoverEnd: () => `<<covEnd`,
      drawUseItem: () => `USE_ITEM(weapon)`,
    };
    for (const [k, tag] of Object.entries(wraps)) {
      const orig = proto[k];
      if (!orig) continue;
      proto[k] = function (...a) {
        window.__order.push(tag(this) + (k === 'lunarCoverBegin' ? `#${a[1]?.vanillaId ?? (a[1]?.name ?? 'p')}` : ''));
        return orig.apply(this, a);
      };
    }
  }
  // 起挥（useStyle1 Excalibur 368）
  window.__grantItem = (vid) => {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + vid + '_').test(x));
    p.inv.slots[0] = { id: window.__swItems[k], stack: 1 };
    p.inv.selected = 0;
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
  window.__swingOnce = () => {
    g.player.useTime = 0;
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  };
});
await pump(page, 10);

const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

// 玩家朝右钉住（免行走朝向漂移）;相位钉 0.5（横挥,刀身在前）
await page.evaluate(() => {
  const p = window.__swGame.player;
  p.facing = 1; p.dir = 1;
  window.__swingPin = 0.5;
});
await page.evaluate(() => window.__grantItem(368));   // Excalibur
await pump(page, 5);

// 刀身条带采样（正午全亮;主画布像素域=玩家前方 4..72px、躯干带高 44px）
const bladeStrip = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx + 4), x1 = px(p.cx + 72);
  const y0 = py(p.y + 4), y1 = py(p.y + 48);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  const out = [];
  for (let i = 0; i < img.length; i += 4) out.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
  return { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), px: out };
});

const runCase = async (name, armorVids, opt = {}) => {
  await page.evaluate((vs, o) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
    if (o.shields) window.__swGame.player.solarShields = 3;
  }, armorVids, opt);
  await pump(page, 5);
  await page.evaluate(() => { window.__swingOnce(); });
  await waitFrames(2);            // 一帧起挥+一帧渲染（相位被钉）
  const order = await page.evaluate(() => window.__order.slice());
  const strip = await bladeStrip();
  const shot = `${OUT}/${name}.png`;
  await page.screenshot({ path: shot });
  return { name, order, strip };
};

const naked = await runCase('naked_swing', []);
const nebula = await runCase('nebula_swing', [2760, 2761, 2762]);
const solar = await runCase('solar_swing', [2763, 2764, 2765]);
const solarSh = await runCase('solar_swing_shields', [2763, 2764, 2765], { shields: true });
const stardust = await runCase('stardust_swing', [3381, 3382, 3383]);
const vortex = await runCase('vortex_swing', [2757, 2758, 2759]);

// 差分：naked vs 各套（刀身条带,逐像素 RGB 差）
const diff = (a, b) => {
  let n = 0, wash = 0, dark = 0, maxD = 0;
  const n4 = Math.min(a.px.length, b.px.length);
  for (let i = 0; i < n4; i += 4) {
    if (a.px[i + 3] < 40 && b.px[i + 3] < 40) continue;
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    if (d > 45) { n++; maxD = Math.max(maxD, d); }
    const lum = (q) => q.px[i] + q.px[i + 1] + q.px[i + 2];
    if (d > 45 && lum(b) - lum(a) > 90) wash++;    // b 更亮=加色洗白（glow/盾罩面）
    if (d > 45 && lum(a) - lum(b) > 90) dark++;    // a 更亮=b 被盖暗（恒色甲覆盖面）
  }
  return { diffPx: n, wash, dark, maxD, total: n4 / 4 };
};

const verdict = {
  order: {
    naked: naked.order,
    nebula: nebula.order,
    solar: solar.order,
    solarShields: solarSh.order,
    stardust: stardust.order,
    vortex: vortex.order,
  },
  bladeDiffVsNaked: {
    nebula: diff(naked.strip, nebula.strip),
    solar: diff(naked.strip, solar.strip),
    solarShields: diff(naked.strip, solarSh.strip),
    stardust: diff(naked.strip, stardust.strip),
    vortex: diff(naked.strip, vortex.strip),
  },
  pageErrors: errors.slice(0, 5),
};
console.log(JSON.stringify(verdict, null, 1));
await browser.close();
