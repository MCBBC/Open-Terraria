// ★BJ682d v2 诊断:render 头全量记录(__bowHide/__noGBackup/恢复分支命中/noG 真值)
//  + swing 状态 + covBegin/USE_ITEM——toggle 恢复链为何失效。
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

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
  ]);
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  window.__bjFrames = 0;
  window.__trace = [];
  if (!proto.__bj682dwrap) {
    proto.__bj682dwrap = true;
    const orR = proto.render;
    proto.render = function (...a) {
      window.__bjFrames++;
      const gg = window.__swGame;
      const sw = gg.swing;
      let act = '';
      if (sw && window.__swingPin != null) sw.t = sw.dur * window.__swingPin;
      if (sw) {
        if (window.__bowHide === true) {
          sw.__noGBackup = sw.noGraphic; sw.noGraphic = true; act = 'TOGGLE_ON';
        } else if (window.__bowHide === false && sw.__noGBackup !== undefined) {
          sw.noGraphic = sw.__noGBackup; act = `RESTORE(->${sw.noGraphic})`;
        } else if (window.__bowHide === false) {
          act = 'RESTORE_SKIP(noBackup)';
        }
      }
      const swInfo = sw
        ? `swing(t=${sw.t.toFixed(0)}/${sw.dur},item=${sw.item},noG=${sw.noGraphic === true},bkp=${String(sw.__noGBackup)})`
        : 'swing=null';
      window.__trace.push(`F${window.__bjFrames} hide=${String(window.__bowHide)} ${act} ${swInfo}`);
      return orR.apply(this, a);
    };
    const wraps = {
      lunarCoverBegin: () => `>>covBegin`,
      lunarCoverEnd: () => `<<covEnd`,
      drawUseItem: (s, a) => `USE_ITEM(item=${a[2]?.item})`,
    };
    for (const [k, tag] of Object.entries(wraps)) {
      const orig = proto[k];
      if (!orig) continue;
      proto[k] = function (...a) {
        window.__trace.push('   ' + tag(this, a));
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

await page.evaluate(() => {
  window.__swingPin = 0.5;
  window.__wear([2760, 2761, 2762]);
});
await page.evaluate(() => window.__grantItem(39, 40));
await pump(page, 5);
const f0 = await page.evaluate(() => { window.__trace = []; window.__aimOnce(); return window.__bjFrames; });
await waitFrames(3);
await page.evaluate(() => { window.__bowHide = true; });
await waitFrames(3);
await page.evaluate(() => { window.__bowHide = false; });
await waitFrames(3);
const trace = await page.evaluate(() => window.__trace.slice());
console.log(trace.join('\n'));
console.log('pageErrors:', JSON.stringify(errors.slice(0, 3)));
await browser.close();
