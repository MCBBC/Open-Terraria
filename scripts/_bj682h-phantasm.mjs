// ★BJ682h Phantasm 复现探针:用户实报「弓被盔甲遮」真凶假设=noUseGraphic 武器的
//  视觉载体弹(630 PhantasmBow,aiStyle 75 heldProj 族)画在弹实体层,被 7e 甲 glow/
//  恒色甲冲刷盖住。原版锚:Projectile.cs :6769-6780(drawLayer=7,usesOwnerLight)+
//  AI_075 尾 :68385 heldProj=whoAmI 钉手;PlayerDrawLayers.cs :3154(27_HeldItem 开头
//  projectileDrawPosition 插入)+:4310-4330(PlayDrawData 到位 DrawHeldProj)。
//  判别:3540 Phantasm(noUseGraphic)按住连射 → 630 弹在场;帧序记录弹 draw 与
//  7e 冲刷先后(弹 draw 先于 glow 冲刷=弹在 glow 之下=病灶);像素:naked vs 星尘
//  的 630 区域(玩家手前)差分+630 紫色像素计数。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682h';
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
  window.__order = [];
  window.__bjFrames = 0;
  if (!proto.__bj682hwrap) {
    proto.__bj682hwrap = true;
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
      drawProjectiles: () => `PROJS_DRAW(实体弹层)`,
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
  // 按住连射(Phantasm channel 族持续出弹 630)
  window.__holdFire = (ticks) => {
    const gg = window.__swGame, pp = gg.player;
    const cv = gg.renderer.canvas;
    pp.facing = 1; pp.dir = 1;
    gg.input.mouseX = Math.round(cv.width / 2 + 120);
    gg.input.mouseY = Math.round(cv.height / 2 - 8);
    gg.input.mouseDown = true;
    for (let i = 0; i < ticks; i++) gg.fixedUpdate(1 / 60);
    gg.input.mouseDown = false;
  };
});
await pump(page, 10);

const waitRaf = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

await page.evaluate(() => window.__grantItem(3540, 40));   // Phantasm + 木箭
await pump(page, 5);

// 630 区域:玩家手前(cx±60, cy±40) + 630 紫色像素计数 + 弹在场检查
const census = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  const x0 = px(p.cx - 60), x1 = px(p.cx + 60);
  const y0 = py(p.y + p.h / 2 - 40), y1 = py(p.y + p.h / 2 + 40);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  const pxArr = [];
  for (let i = 0; i < img.length; i += 4) pxArr.push(img[i], img[i + 1], img[i + 2], img[i + 3]);
  let p630 = 0;
  for (let i = 0; i < img.length; i += 4) {
    const [r, gg, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a > 60 && r > 110 && b > 150 && gg < 120 && r + b > 2 * (gg + 60)) p630++;
  }
  const projs = g.entities.projectiles.filter((e) => !e.dead && e.projId === 630);
  return { w: Math.abs(x1 - x0), h: Math.abs(y1 - y0), px: pxArr, purplePx: p630, proj630Count: projs.length };
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
  const c = await census();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return { name, order, c };
};

const naked = await runCase('naked_phantasm', []);
const stardust = await runCase('stardust_phantasm', [3381, 3382, 3383]);
const nebula = await runCase('nebula_phantasm', [2760, 2761, 2762]);
const solar = await runCase('solar_phantasm', [2763, 2764, 2765]);

const diff = (a, b) => {
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

console.log(JSON.stringify({
  order: { naked: naked.order, stardust: stardust.order, nebula: nebula.order, solar: solar.order },
  proj630: { naked: naked.c.proj630Count, stardust: stardust.c.proj630Count, nebula: nebula.c.proj630Count, solar: solar.c.proj630Count },
  purplePx: { naked: naked.c.purplePx, stardust: stardust.c.purplePx, nebula: nebula.c.purplePx, solar: solar.c.purplePx },
  diffVsNaked: { stardust: diff(naked.c, stardust.c), nebula: diff(naked.c, nebula.c), solar: diff(naked.c, solar.c) },
  pageErrors: errors.slice(0, 5),
}, null, 1));
await browser.close();
