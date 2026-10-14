// ★BJ676 诊断:armorGlow(星云 glow)水罩链路内部状态——队列/Stroke 调用/mask 内容。
// 运行:SW_ORIGIN=http://localhost:5206 node tools/run-diag.mjs scripts/_bj676-diag.mjs
import { mkdirSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, clockSet, freezeClock, godMode } from '../tools/probe/lib/index.mjs';

const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj676';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser();
const errors = [];
const page = await openPage(browser, { errors });
await bootstrap(page, process.env.SW_ORIGIN ?? 'http://localhost:5211', {});
await createGame(page, { size: 'small', settleMs: 1500 });
await godMode(page, true);
await clockSet(page, 0.5);
await freezeClock(page, { tod: 0.5 });
await pump(page, 30);

await page.evaluate(async () => {
  const g = window.__swGame, p = g.player;
  const A = await import('/src/player/Appearance.ts');
  p.appearance = A.randomAppearance('bj676d');
  const UT = await import('/src/vui/assets/UITextures.ts');
  await UT.UITextures.ensure([
    'Armor_Head_171.png', 'Armor_Armor_177.png', 'Armor_Legs_112.png',
    'Armor_Head_170.png', 'Armor_Armor_176.png', 'Armor_Legs_111.png',
  ]);
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  // 插桩:stroke/end 计数+mask 内容统计+armorGlow 队列长度+render 计数（命中性对照）
  window.__bj676dbg = { strokes: 0, ends: 0, maskPix: 0, agOps: 0, laQ: 0, veil: null, box: null, act: null, renders: 0, hasVeil: typeof proto.escapeVeilStroke, boxes: [], agLen: [] };
  const orR = proto.render;
  proto.render = function (...a) { window.__bj676dbg.renders++; return orR.apply(this, a); };
  const os = proto.escapeVeilStroke;
  proto.escapeVeilStroke = function (box, paint) {
    window.__bj676dbg.strokes++;
    if (window.__bj676dbg.boxes.length < 40) window.__bj676dbg.boxes.push([box.x, box.y, box.w, box.h]);
    return os.call(this, box, paint);
  };
  // 逐帧 armorGlowQueue 长度（4.5 前景水时刻=veil676 谓词读点）
  const od = proto.drawLiquids;
  proto.drawLiquids = function (world, cam, viewW, viewH, z, isBackground) {
    if (!isBackground) {
      window.__bj676dbg.agLen.push([
        this.armorGlowQueue.length, this.lunarArmorQueue.length,
        this.armorGlowQueue.reduce((s, e) => s + e.ops.length, 0),
      ]);
    }
    return od.call(this, world, cam, viewW, viewH, z, isBackground);
  };
  const oe = proto.escapeVeilEnd;
  proto.escapeVeilEnd = function () {
    const d = window.__bj676dbg;
    d.act = this._veilActive; d.box = this._veilBox ? { ...this._veilBox } : null;
    d.veil = this._liqVeil ? { w: this._liqVeil.width, h: this._liqVeil.height } : null;
    // mask 非空像素（截 256×256 抽样区计数）
    if (this._veilMaskCtx) {
      const mc = this._veilMaskCtx;
      const W = this._veilMask.width, H = this._veilMask.height;
      const img = mc.getImageData(0, 0, Math.min(300, W), Math.min(300, H)).data;
      let n = 0;
      for (let i = 3; i < img.length; i += 4) if (img[i] > 0) n++;
      d.maskPix = n;
    }
    return oe.call(this);
  };
  const of = proto.flushArmorGlow;
  proto.flushArmorGlow = function () {
    window.__bj676dbg.agOps = (this.armorGlowQueue ?? []).reduce((s, e) => s + e.ops.length, 0);
    return of.call(this);
  };
  const ol = proto.flushLunarArmor;
  proto.flushLunarArmor = function () {
    window.__bj676dbg.laQ = (this.lunarArmorQueue ?? []).length;
    return ol.call(this);
  };
});

const grantArmor = (vids) => page.evaluate((vs) => {
  const g = window.__swGame, p = g.player;
  p.inv.armor[0] = null; p.inv.armor[1] = null; p.inv.armor[2] = null;
  for (const v of vs) {
    const k = Object.keys(window.__swItems).find((x) => new RegExp('^vi_' + v + '_').test(x));
    const slot = v === 2763 || v === 170 ? 0 : v === 2764 || v === 176 ? 1 : 2;
    p.inv.armor[slot] = { id: window.__swItems[k], stack: 1 };
  }
}, vids);

// 水柱(与主探针同式)
const spot = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, w = st.w, h = st.h;
  const seg = new Map();
  for (let x = Math.floor(w * 0.1); x < Math.floor(w * 0.9); x++) {
    let y0 = -1, bestD = 0, bestY0 = -1;
    for (let y = 2; y < h - 40; y++) {
      const i = st.idx(x, y);
      if (st.liquid[i] > 0 && st.liquidType[i] === 1) { if (y0 < 0) y0 = y; }
      else if (y0 >= 0) { if (y - y0 > bestD) { bestD = y - y0; bestY0 = y0; } y0 = -1; }
    }
    if (bestD >= 10) seg.set(x, { y0: bestY0, d: bestD });
  }
  const bottomOf = (x, y0, d) => {
    for (let y = y0 + 3; y < y0 + d + 12; y++) {
      const i = st.idx(x, y);
      if (st.w[i] !== 0 && st.liquid[i] === 0) return y;
    }
    return -1;
  };
  const xs = [...seg.keys()];
  for (const x of xs.sort((a, b) => seg.get(b).d - seg.get(a).d)) {
    const c = seg.get(x);
    if (!(seg.get(x - 1)?.d >= 10 && seg.get(x + 1)?.d >= 10)) continue;
    const bottom = bottomOf(x, c.y0, c.d);
    if (bottom > c.y0 + Math.floor(c.d * 0.6)) return { tx: x, tySurface: c.y0, depth: c.d, tyBottom: bottom };
  }
  return null;
});
console.log('spot:', JSON.stringify(spot));

const pin = () => page.evaluate((s) => {
  const g = window.__swGame, p = g.player;
  p.x = (s.tx + 0.5) * 16 - p.w / 2;
  p.y = s.tyBottom * 16 - p.h - 1;
  p.vx = 0; p.vy = 0;
}, spot);

// armorGlowOps 纯函数面直测（星云三件在表→ops 数）
const opsTest = await page.evaluate(async () => {
  const m = await import('/src/data/vanillaArmorGlow.ts');
  const mk = (head, body, legs) => m.armorGlowOps({
    head, body, legs, female: false,
    undershirt: { r: 160, g: 90, b: 40 },
    rowsBody: 0, rowsLegs: 0, sit: null, pet: null, mt: 255, miscCounter: 0, mul: 1, tv: null,
  });
  return {
    nebula: mk(170, 176, 111).length,
    solar: mk(171, 177, 112).length,
    stardust: mk(189, 190, 130).length,
    naked: mk(0, 0, 0).length,
  };
});
console.log('armorGlowOps 直测:', JSON.stringify(opsTest));

// drawPlayer 调用计数（主 doll 段是否跑）
await page.evaluate(async () => {
  const R = await import('/src/render/Renderer.ts');
  const proto = R.Renderer.prototype;
  if (!window.__bj676dp) {
    window.__bj676dp = true;
    const odp = proto.drawPlayer;
    proto.drawPlayer = function (...a) { window.__bj676dbg.drawCalls = (window.__bj676dbg.drawCalls || 0) + 1; return odp.apply(this, a); };
  }
});

for (const suit of [{ name: 'solar', vids: [2763, 2764, 2765] }, { name: 'nebula', vids: [2760, 2761, 2762] }]) {
  await grantArmor(suit.vids);
  await pin(); await pump(page, 90);   // 相机跟随玩家（远距瞬移后 lerp 收敛）
  await pin(); await pump(page, 10);
  const dbg = await page.evaluate(() => {
    const d = { ...window.__bj676dbg };
    d.boxes = window.__bj676dbg.boxes.slice(-8);
    d.agLen = window.__bj676dbg.agLen.slice(-8);
    window.__bj676dbg.strokes = 0; window.__bj676dbg.boxes = []; window.__bj676dbg.agLen = [];
    return d;
  });
  const onscreen = await page.evaluate(() => {
    const g = window.__swGame, p = g.player, cam = g.camera;
    return { dcx: Math.round(p.cx - cam.x), dcy: Math.round(p.cy - cam.y) };
  });
  console.log(`[${suit.name}] pOffCam=${JSON.stringify(onscreen)} strokes=${dbg.strokes} agOps(last)=${dbg.agOps} laQ(last)=${dbg.laQ} veil=${JSON.stringify(dbg.veil)} box=${JSON.stringify(dbg.box)}`);
  console.log(`  agLen(帧尾8): ${JSON.stringify(dbg.agLen)}`);
  console.log(`  boxes(尾8): ${JSON.stringify(dbg.boxes)}`);
}

console.log('pageerrors:', errors.length);
await browser.close();
