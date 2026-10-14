// ★BJ682 真机定谳探针：BJ681 复诊——弓（useStyle 5 瞄准族）仍被甲遮（用户实报
//  「弓还是被盔甲遮住,脱掉盔甲才正常」）。BJ681 验的是持剑挥舞（swing useStyle1）
//  路径;本探针改持木弓（vid 39,useStyle 5 静持瞄准支）,同正午钉相+帧序插桩+像素差分。
//  判别面：
//   A) 帧序：弓使用帧（swing.t 钉中点）covBegin→USE_ITEM→covEnd 是否成窗
//      （covR3 = (lunarHoist||glowCover) && lunarR3Content——弓 swing 在内容门内,
//      窗不开=glowCover 未置位或 lunarCoverCollected 已含）;7e 冲刷序
//      ARMOR_GLOW(under) < SOLAR_SHIELD < COVERED_BLIT(弓) < itemGlow < ARMOR_GLOW(arm)。
//   B) 像素 A/B：弓身条带差分（naked vs 各套）,wash=glow 加色盖弓 / dark=恒色盖弓。
//  套装族：星云 2760/2761/2762;日耀 2763/2764/2765;漩涡 2757/2758/2759;星尘 3381/3382/3383。
//  对照：持剑挥舞（Excalibur 368,useStyle 1）一例——确认 BJ681 修复面仍在位。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5203', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0.5);          // 正午（全亮=采光烘焙跳过档,免光照差干扰）
await freezeClock(page, { tod: 0.5 });
await pump(page, 20);

// 外观+装备+弓瞄准脚手架
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj682');
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_170.png', 'Armor_Armor_176.png', 'Armor_Legs_111.png',   // 星云
    'Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',   // 日耀
    'Armor_Head_189.png', 'Armor_Armor_190.png', 'Armor_Legs_130.png',   // 星尘
    'Armor_Head_169.png', 'Armor_Armor_175.png', 'Armor_Legs_110.png',   // 漩涡
  ]);
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__bjFrames = 0;
  window.__order = [];
  if (!proto.__bj682wrap) {
    proto.__bj682wrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      window.__order = [];
      const gg = window.__swGame;
      if (gg.swing && window.__swingPin != null) gg.swing.t = gg.swing.dur * window.__swingPin;
      return orR.apply(this, a);
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
        window.__order.push(tag(this, a));
        return orig.apply(this, a);
      };
    }
  }
  // 木弓 39 + 木箭 40（弹药槽 54-57）;Excalibur 368 对照
  window.__grantItem = (vid, ammoVid) => {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + vid + '_').test(x));
    p.inv.slots[0] = { id: window.__swItems[k], stack: 1 };
    p.inv.selected = 0;
    if (ammoVid != null) {
      const ak = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + ammoVid + '_').test(x));
      p.inv.slots[54] = { id: window.__swItems[ak], stack: 999 };
    } else {
      p.inv.slots[54] = null;
    }
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
  // 鼠标钉玩家右前方（aim≈水平朝右,facing=1）;一帧 mouseDown 起一次使用动画
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

await page.evaluate(() => {
  window.__swingPin = 0.5;    // 使用动画中点（瞄准态）
});
await page.evaluate(() => window.__grantItem(39, 40));   // 木弓+木箭
await pump(page, 5);

// 弓身条带采样:玩家前方水平带（aim 朝右近水平,弓贴图横跨 [cx-2+dp0, +fw]）
const bowStrip = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx - 4), x1 = px(p.cx + 72);
  const y0 = py(p.y - 8), y1 = py(p.y + 44);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  const out = [];
  for (let i = 0; i < img.length; i += 4) out.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
  return { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), px: out };
});

const runBowCase = async (name, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 5);
  await page.evaluate(() => { window.__aimOnce(); });
  await waitFrames(2);            // 一帧起手+一帧渲染（相位被钉 0.5）
  const order = await page.evaluate(() => window.__order.slice());
  const strip = await bowStrip();
  const shot = `${OUT}/${name}.png`;
  await page.screenshot({ path: shot });
  return { name, order, strip };
};

const runSwingCase = async (name, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 5);
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.useTime = 0;
    g.input.mouseDown = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  });
  await waitFrames(2);
  const order = await page.evaluate(() => window.__order.slice());
  const strip = await bowStrip();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return { name, order, strip };
};

// ---- 弓场景：星尘（用户实报套装）首位 + 各套 + 裸装基线 ----
const nakedBow = await runBowCase('naked_bow', []);
const stardustBow = await runBowCase('stardust_bow', [3381, 3382, 3383]);
const nebulaBow = await runBowCase('nebula_bow', [2760, 2761, 2762]);
const solarBow = await runBowCase('solar_bow', [2763, 2764, 2765]);
const vortexBow = await runBowCase('vortex_bow', [2757, 2758, 2759]);

// ---- 剑对照（分离「弓路径 bug」vs「星尘残量 bug」两面对照组）----
await page.evaluate(() => window.__grantItem(368));   // Excalibur
await pump(page, 5);
const nakedSwing = await runSwingCase('naked_swing', []);
const stardustSwing = await runSwingCase('stardust_swing', [3381, 3382, 3383]);
const solarSwing = await runSwingCase('solar_swing', [2763, 2764, 2765]);
const nebulaSwing = await runSwingCase('nebula_swing', [2760, 2761, 2762]);

const diff = (a, b) => {
  let n = 0, wash = 0, dark = 0, maxD = 0;
  const n4 = Math.min(a.px.length, b.px.length);
  for (let i = 0; i < n4; i += 4) {
    if (a.px[i + 3] < 40 && b.px[i + 3] < 40) continue;
    const d = Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1]) + Math.abs(a.px[i + 2] - b.px[i + 2]);
    if (d > 45) { n++; maxD = Math.max(maxD, d); }
    const lum = (q) => q.px[i] + q.px[i + 1] + q.px[i + 2];
    if (d > 45 && lum(b) - lum(a) > 90) wash++;
    if (d > 45 && lum(a) - lum(b) > 90) dark++;
  }
  return { diffPx: n, wash, dark, maxD, total: n4 / 4 };
};

const verdict = {
  bowOrder: {
    naked: nakedBow.order, stardust: stardustBow.order, nebula: nebulaBow.order,
    solar: solarBow.order, vortex: vortexBow.order,
  },
  bowDiffVsNaked: {
    stardust: diff(nakedBow.strip, stardustBow.strip),
    nebula: diff(nakedBow.strip, nebulaBow.strip),
    solar: diff(nakedBow.strip, solarBow.strip),
    vortex: diff(nakedBow.strip, vortexBow.strip),
  },
  swingOrder: { naked: nakedSwing.order, stardust: stardustSwing.order, solar: solarSwing.order, nebula: nebulaSwing.order },
  swingDiffVsNaked: {
    stardust: diff(nakedSwing.strip, stardustSwing.strip),
    solar: diff(nakedSwing.strip, solarSwing.strip),
    nebula: diff(nakedSwing.strip, nebulaSwing.strip),
  },
  pageErrors: errors.slice(0, 5),
};
console.log(JSON.stringify(verdict, null, 1));
await browser.close();
