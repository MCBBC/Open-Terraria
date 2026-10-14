// ★BJ682g 品红弓定谳探针(零状态污染,决定性):
//  运行时把 vid 39 木弓的 atlas 图标烘焙成纯品红(保形 source-in)——弓本体在画面
//  上=品红贴图,甲/皮肤/背景全不受影响。品红像素计数 = 弓净可见度(逐装备对比)。
//  同法剑(368)对照,分离「弓路径」vs「星尘残量」两面。附带逐层 kill 实验:
//  关掉 arm glow 遍 / 恒色甲重绘 / under glow,看品红弓可见度恢复哪层。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682g';
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
  window.__killLayers = {};   // {armGlow, lunarArmor, underGlow}
  if (!proto.__bj682gwrap) {
    proto.__bj682gwrap = true;
    // 品红烘焙 vid 39/368(保形 source-in)
    const oIcon = proto.atlasIcon;
    proto.atlasIcon = function (id, ...rest) {
      const r = oIcon.apply(this, [id, ...rest]);
      if (r && window.__magentaVids) {
        const vids = window.__magentaVids;
        if (vids.has(id)) {
          const key = id;
          if (!window.__magCache) window.__magCache = new Map();
          let cv = window.__magCache.get(key);
          if (!cv) {
            cv = document.createElement('canvas');
            cv.width = r.sw; cv.height = r.sh;
            const c = cv.getContext('2d');
            c.drawImage(r.img, r.sx, r.sy, r.sw, r.sh, 0, 0, r.sw, r.sh);
            c.globalCompositeOperation = 'source-in';
            c.fillStyle = 'rgb(255,0,255)';
            c.fillRect(0, 0, r.sw, r.sh);
            window.__magCache.set(key, cv);
          }
          return { img: cv, sx: 0, sy: 0, sw: r.sw, sh: r.sh };
        }
      }
      return r;
    };
    // 层 kill 开关
    const oArm = proto.flushArmorGlow;
    proto.flushArmorGlow = function (armPass = false, ...rest) {
      if (armPass === true && window.__killLayers.armGlow) { this.armorGlowQueue = []; return; }
      if (armPass === false && window.__killLayers.underGlow) { this.armorGlowQueue = []; return; }
      return oArm.apply(this, [armPass, ...rest]);
    };
    const oLunar = proto.flushLunarArmor;
    proto.flushLunarArmor = function (...a) {
      if (window.__killLayers.lunarArmor) { this.lunarArmorQueue = []; return; }
      return oLunar.apply(this, a);
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
    for (const e of gg.entities.projectiles) if (e.dead === false && typeof e.projId === 'number') e.dead = true;
  };
});
await pump(page, 10);

// rAF 帧计数
await page.evaluate(() => {
  window.__bjFrames = 0; window.__bjTarget = 0;
  const tick = () => { window.__bjFrames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const waitRaf = async (n) => {
  await page.evaluate((n) => { window.__bjTarget = window.__bjFrames + n; }, n);
  await page.waitForFunction(() => window.__bjFrames >= window.__bjTarget, { timeout: 60000 });
};

// 品红武器内部 id 注册
await page.evaluate(() => {
  const ids = new Set();
  for (const [k, v] of Object.entries(window.__swItems)) {
    if (/^vi_(39|368)_/.test(k)) ids.add(v);
  }
  window.__magentaVids = ids;
});

// 宽条带(玩家±64×cy±32)+品红像素统计
const magentaCensus = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const sw = g.swing;
  if (sw) sw.t = sw.dur * 0.5;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx - 64), x1 = px(p.cx + 64);
  const y0 = py(p.y + p.h / 2 - 32), y1 = py(p.y + p.h / 2 + 32);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  let mag = 0, magWash = 0, total = 0;
  const magPx = [];
  for (let i = 0; i < img.length; i += 4) {
    const [r, gg, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a < 40) continue;
    total++;
    if (r > 180 && b > 180 && gg < 100) {
      mag++;
      if (r > 245 && b > 245 && gg > 60) magWash++;   // 品红被加色提亮(glow 盖上=中间值)
      if (magPx.length < 2000) magPx.push(Math.floor(i / 4));
    }
  }
  return { total, mag, magWash, magPx, w: Math.abs(x1 - x0) };
});

const runCase = async (armorVids, weaponGrant) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 3);
  await page.evaluate((wg) => window.__grantItem(wg.vid, wg.ammo), weaponGrant);
  await pump(page, 4);
  await page.evaluate(() => { window.__aimOnce(); });
  await waitRaf(3);
  return await magentaCensus();
};

const res = {};
// 弓场景(品红弓)
res.bowNaked = await runCase([], { vid: 39, ammo: 40 });
res.bowStardust = await runCase([3381, 3382, 3383], { vid: 39, ammo: 40 });
res.bowNebula = await runCase([2760, 2761, 2762], { vid: 39, ammo: 40 });
res.bowSolar = await runCase([2763, 2764, 2765], { vid: 39, ammo: 40 });
res.bowVortex = await runCase([2757, 2758, 2759], { vid: 39, ammo: 40 });
// 逐层 kill(星尘,用户套装)
await page.evaluate(() => { window.__killLayers = { armGlow: true }; });
res.bowStardustNoArm = await runCase([3381, 3382, 3383], { vid: 39, ammo: 40 });
await page.evaluate(() => { window.__killLayers = { armGlow: true, lunarArmor: true }; });
res.bowStardustNoArmNoLunar = await runCase([3381, 3382, 3383], { vid: 39, ammo: 40 });
await page.evaluate(() => { window.__killLayers = { armGlow: true, lunarArmor: true, underGlow: true }; });
res.bowStardustAllOff = await runCase([3381, 3382, 3383], { vid: 39, ammo: 40 });
await page.evaluate(() => { window.__killLayers = {}; });
// 剑对照(品红剑)
res.swordNaked = await runCase([], { vid: 368, ammo: null });
res.swordStardust = await runCase([3381, 3382, 3383], { vid: 368, ammo: null });
res.swordNebula = await runCase([2760, 2761, 2762], { vid: 368, ammo: null });

const summary = (c) => ({ mag: c.mag, magWash: c.magWash });
const base = res.bowNaked.mag || 1;
const sBase = res.swordNaked.mag || 1;
const out = {};
for (const [k, v] of Object.entries(res)) {
  const b = k.startsWith('bow') ? base : sBase;
  out[k] = { ...summary(v), ratio: +(v.mag / b).toFixed(3) };
}
console.log(JSON.stringify({ baseline: { bowNakedMag: res.bowNaked.mag, swordNakedMag: res.swordNaked.mag }, out, pageErrors: errors.slice(0, 5) }, null, 1));
await browser.close();
