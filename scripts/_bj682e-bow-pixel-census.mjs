// ★BJ682e 弓色定谳探针(正常态,无任何状态污染):
//  1) 从 atlas 取木弓(vid 39)贴图主色系(离线采样非空像素的色域);
//  2) 各装备场景(正常 aimOnce 钉相)读主画布弓矩形,统计弓色系像素数+亮度;
//  3) 帧序同步记录(covBegin/USE_ITEM/COVERED_BLIT)。
//  判别:弓色像素数(naked) vs 各套 = 弓净可见度;亮度漂移=加色洗白。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj682e';
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
  window.__order = [];
  if (!proto.__bj682ewrap) {
    proto.__bj682ewrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      window.__order = [];
      const gg = window.__swGame;
      if (gg.swing && window.__swingPin != null) gg.swing.t = gg.swing.dur * window.__swingPin;
      return orR.apply(this, a);
    };
    const wraps = {
      lunarCoverBegin: () => `>>covBegin`,
      lunarCoverEnd: () => `<<covEnd`,
      drawUseItem: () => `USE_ITEM`,
      flushLunarCovered: (s) => `COVERED_BLIT(q=${s.lunarCoverQueue?.length ?? '?'},nonEmpty=[${(s.lunarCoverQueue ?? []).map((e) => {
        const c = e.cv.getContext('2d');
        const d = c.getImageData(0, 0, Math.min(e.cv.width, e.w), Math.min(e.cv.height, e.h)).data;
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++;
        return n;
      }).join(',')}]`,
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
    // 杀弹:aimOnce 已射出的箭移出采样区(防帧间飞行污染)——直接 kill 场上箭弹
    for (const e of gg.entities.projectiles) if (e.dead === false && typeof e.projId === 'number') e.dead = true;
  };
});
await pump(page, 10);

const waitFrames = async (n) => {
  const f0 = await page.evaluate(() => window.__bjFrames);
  await page.waitForFunction((f0, n) => window.__bjFrames >= f0 + n, { timeout: 60000 }, f0, n);
};

// 离线:木弓贴图非空像素色域(renderer.atlas 的 vid 39 图标切片)
const bowPalette = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const it = r.atlasIcon ? null : null;
  const rect = r.atlas ? r.atlas.vicon(39) : null;   // vicon: vid → 切片
  if (!rect) return null;
  const cv = document.createElement('canvas');
  cv.width = rect.sw; cv.height = rect.sh;
  const c = cv.getContext('2d');
  c.drawImage(rect.img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
  const d = c.getImageData(0, 0, rect.sw, rect.sh).data;
  const px = [];
  let opaque = 0, rMin = 999, rMax = -1, gMin = 999, gMax = -1, bMin = 999, bMax = -1;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 200) {
      opaque++;
      rMin = Math.min(rMin, d[i]); rMax = Math.max(rMax, d[i]);
      gMin = Math.min(gMin, d[i + 1]); gMax = Math.max(gMax, d[i + 1]);
      bMin = Math.min(bMin, d[i + 2]); bMax = Math.max(bMax, d[i + 2]);
    }
  }
  return { w: rect.sw, h: rect.sh, opaque, rMin, rMax, gMin, gMax, bMin, bMax };
});

await page.evaluate(() => { window.__swingPin = 0.5; });
await page.evaluate(() => window.__grantItem(39, 40));
await pump(page, 5);

const census = () => page.evaluate(() => {
  const g = window.__swGame, p = g.player, cam = g.camera, cv = g.renderer.canvas;
  const px = (x) => Math.round((x - cam.x) * cam.zoom + cv.width / 2);
  const py = (y) => Math.round((y - cam.y) * cam.zoom + cv.height / 2);
  // 弓矩形:瞄准朝右近水平,贴图横跨 [cx-2+dp0, cx-2+dp0+fw] × [cy+dy-fh/2, cy+dy+fh/2]
  // 取宽窗 [cx-12, cx+48] × [cy-16, cy+16] 覆盖弓+手
  const x0 = px(p.cx - 12), x1 = px(p.cx + 48);
  const y0 = py(p.y + p.h / 2 - 16), y1 = py(p.y + p.h / 2 + 16);
  const img = g.renderer.ctx.getImageData(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)).data;
  let bowPx = 0, lum = 0, n = 0, semi = 0;
  for (let i = 0; i < img.length; i += 4) {
    const [r, gg, b, a] = [img[i], img[i + 1], img[i + 2], img[i + 3]];
    if (a < 40) continue;
    n++;
    // 木弓棕色系:R>G>B,G-R 差显著暖色调(R≥G+25, G≥B+15)且 R∈[90,220]
    if (r >= 90 && r <= 220 && r >= gg + 25 && gg >= b + 15) { bowPx++; lum += r + gg + b; }
    // 白亮像素(glow 洗白):三通道均高
    if (r > 200 && gg > 200 && b > 200) semi++;
  }
  return { total: n, bowPx, avgBowLum: bowPx ? Math.round(lum / bowPx) : 0, brightPx: semi };
});

const runCase = async (name, armorVids) => {
  await page.evaluate((vs) => {
    window.__swGame.player.solarShields = 0;
    window.__wear(vs);
  }, armorVids);
  await pump(page, 5);
  await page.evaluate(() => { window.__aimOnce(); });
  await waitFrames(3);
  const order = await page.evaluate(() => window.__order.slice());
  const c = await census();
  await page.screenshot({ path: `${OUT}/${name}.png` });
  return { name, order, census: c };
};

const cases = [];
cases.push(await runCase('naked', []));
cases.push(await runCase('stardust', [3381, 3382, 3383]));
cases.push(await runCase('nebula', [2760, 2761, 2762]));
cases.push(await runCase('solar', [2763, 2764, 2765]));
cases.push(await runCase('vortex', [2757, 2758, 2759]));

const base = cases[0].census;
const rel = {};
for (const c of cases) {
  rel[c.name] = {
    bowPx: c.census.bowPx,
    bowPxRatio: base.bowPx ? +(c.census.bowPx / base.bowPx).toFixed(3) : null,
    avgBowLum: c.census.avgBowLum,
    brightPx: c.census.brightPx,
    order: c.order,
  };
}
console.log(JSON.stringify({ bowPalette, nakedBaseline: base, rel, pageErrors: errors.slice(0, 5) }, null, 1));
await browser.close();
