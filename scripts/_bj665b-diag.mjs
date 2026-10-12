// ★BJ665b 诊断②：页内直调恒色件烘焙面（nullity/尺寸）+ 判定模块实值 + 渲染帧数。
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5211', {});
await createGame(page, { size: 'small', settleMs: 1200 });
await godMode(page, true);
await clockSet(page, 0);
await freezeClock(page, { tod: 0 });
await pump(page, 10);
await page.evaluate(() => { window.__bjFrames = 0; });
await page.evaluate(async () => {
  const mod = await import('/src/render/Renderer.ts');
  const proto = mod.Renderer.prototype;
  if (!proto.__bj665dp2) {
    proto.__bj665dp2 = true;
    const orR = proto.render;
    proto.render = function (...a) { window.__bjFrames++; return orR.apply(this, a); };
  }
});
await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj665d');
  for (const [slot, v] of [[0, 2763], [1, 2764], [2, 2765]]) {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
    p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
  }
});
await pump(page, 30);
const diag = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const PD = await import('/src/player/PaperDoll.ts');
  const LA = await import('/src/data/vanillaLunarArmor.ts');
  const RR = await import('/src/render/Renderer.ts');
  const eq = RR.dollEquipFromInv(p.inv, p.appearance, false);
  const out = {
    batch: LA.LUNAR_CONST_BATCH,
    pieces: LA.lunarConstPieces(171, 177, 112),
    frameCount: window.__bjFrames,
    eqHead: eq ? (eq.head ?? null) : 'no-eq-source',
  };
  if (eq) {
    const up = PD.compositePaperDoll(p.appearance, eq, { lunarSplit: true, lunarPart: 'upper' });
    const lg = PD.compositePaperDoll(p.appearance, eq, { lunarSplit: true, lunarPart: 'legs' });
    const main = PD.compositePaperDoll(p.appearance, eq, { lunarSplit: true });
    const plain = PD.compositePaperDoll(p.appearance, eq);
    const UT = await import('/src/vui/assets/UITextures.ts');
    const TX = await import('/src/render/texId.ts');
    const sheets = {};
    for (const n of ['Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',
      'Player_0_0.png', 'Player_0_3.png', 'Player_0_10.png', 'Player_0_15.png']) {
      const r = UT.UITextures.get(n);
      sheets[n] = r ? (TX.texReady(r.img) ? 'ready' : 'loaded-not-ready') : 'missing';
    }
    out.up = up ? { w: up.width, h: up.height } : null;
    out.legs = lg ? { w: lg.width, h: lg.height } : null;
    out.main = main ? { w: main.width, h: main.height } : null;
    out.plain = plain ? { w: plain.width, h: plain.height } : null;
    out.sheets = sheets;
    out.skinVariant = p.appearance.skinVariant;
  }
  return out;
});
console.log(JSON.stringify(diag, null, 1));
console.log('pageErrors:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
