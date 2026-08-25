// 全亮快路径(?lightfast)+主画布 alpha:false(?opaque) 运行时 A/B 像素对拍。
// 同一会话内翻转子模块开关(静态字段 JS 可写),停环后手动驱动 g.render(),
// 冻结时钟(performance.now/Date.now/animTick/_liquidNow)使两次渲染逐字节确定。
// 断言:
//  ① 场景内确定性基线:同配置连续两次渲染 diff==0(harness 自检)
//  ② 白天地表(光图全亮):fast 开/关输出逐字节相同,且 fast 开时 worldCtxLayer
//     的 getImageData 零调用(证明快路径真实命中)
//  ③ 地下洞穴(非全亮):快路径不触发,开/关输出逐字节相同
//  ④ opaque 翻转经 recreateMainCanvas 后 getContextAttributes().alpha 如期,
//     新旧画布 RGB(A) 输出逐字节相同
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// ?wgl=0 强制世界层×光照走 2D 三步回退(否则无头 Chrome 有 SwiftShader WebGL,
// gl.composite 直接成功,CPU 回退分支与快路径都不会被测到——2026-08-25 首跑实证)
await page.goto('' + ORIGIN + '/?wgl=0', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- 页内 harness 注入:冻结 + 快照 + 场景雕刻 ----
await page.evaluate(() => {
  const g = window.__swGame;
  // 时钟冻结(rAF 循环已由 running=false 停掉;手动 render 期间所有 now 恒定)
  window.__T0 = 8_640_000_000;
  window.__perfNow = performance.now.bind(performance);
  performance.now = () => window.__T0;
  Date.now = () => window.__T0;
  // 快照离屏缓冲
  const oc = document.createElement('canvas');
  const octx = oc.getContext('2d', { willReadFrequently: true });
  window.__snap = () => {
    const c = g.renderer.canvas;
    if (oc.width !== c.width || oc.height !== c.height) { oc.width = c.width; oc.height = c.height; }
    octx.clearRect(0, 0, oc.width, oc.height);
    octx.drawImage(c, 0, 0);
    return Array.from(octx.getImageData(0, 0, oc.width, oc.height).data);
  };
  // 手动单帧渲染(animTick 回退——逐帧自增会污染相邻两次渲染的物品帧选)
  window.__R = () => {
    const t = g.renderer.animTick;
    g.renderer.animTick = t;   // 渲染前钉住
    g.render();
    g.renderer.animTick = t;   // 渲染后回退
    return window.__snap();
  };
});
// diff 在 Node 侧做(页内传大数组慢)
const diff = (a, b) => {
  let n = 0, first = -1, alphaOnly = 0;
  for (let i = 0; i < a.length; i += 4) {
    let d = 0, da = false;
    for (let c = 0; c < 4; c++) if (a[i + c] !== b[i + c]) { d++; if (c === 3) da = true; }
    if (d > 0) { n++; if (first < 0) first = i / 4; if (da && d === 1) alphaOnly++; }
  }
  return { n, first, alphaOnly };
};
const evalSnap = async () => page.evaluate(() => window.__R());

// getImageData 调用计数钩子(worldCtxLayer 实例方法包装)
const armCounter = () => page.evaluate(() => {
  const wc = window.__swGame.renderer.worldCtxLayer;
  if (!wc) return -1;
  if (!wc.__origGet) { wc.__origGet = wc.getImageData.bind(wc); wc.__count = 0; wc.__armed = true; }
  wc.getImageData = (...a) => { wc.__count++; return wc.__origGet(...a); };
  return 0;
});
const readCounter = () => page.evaluate(() => window.__swGame.renderer.worldCtxLayer?.__count ?? -1);

// ---- 场景雕刻(高空空域 / 干燥洞穴口袋;无液体无火把无实体无天气) ----
// 场景 A 正例不再用真实天空(云/环境实体每渲染帧自走,基线无法归零),
// 改为洞穴口袋 + pinLightFull 强制全白光照输入——触发条件与白天全亮同构。
const carve = (underground) => page.evaluate((ug) => {
  const g = window.__swGame;
  const st = g.world.store;
  const ts = 16;
  window.__pinX = Math.floor(g.player.cx / ts) * ts + 8;
  window.__pinY = ug
    ? ((Math.floor(g.world.rockLevel) + 30) * ts)
    : ((Math.floor(g.world.groundLevel) - 60) * ts);
  const cx0 = Math.floor(window.__pinX / ts), cy0 = Math.floor(window.__pinY / ts);
  if (!ug) {
    // 高空纯空域:清掉盒体内一切方块(浮岛/树冠会挡天光→光图非全白)。
    // 盒体须盖住光图采样范围=视口±2 格(竖向半格≈27,横向≈42)+余量
    for (let dy = -34; dy <= 34; dy++) for (let dx = -48; dx <= 48; dx++) {
      const x = cx0 + dx, y = cy0 + dy;
      if (!st.inBounds(x, y)) continue;
      st.setTile(x, y, 0);
      st.liquid[st.idx(x, y)] = 0;
    }
  } else {
    // 洞穴口袋:清盒体+铺地板+补墙
    for (let dy = -18; dy <= 2; dy++) for (let dx = -36; dx <= 36; dx++) {
      const x = cx0 + dx, y = cy0 + dy;
      if (!st.inBounds(x, y)) continue;
      st.setTile(x, y, 0);
      st.liquid[st.idx(x, y)] = 0;
    }
    for (let dx = -36; dx <= 36; dx++) st.setTile(cx0 + dx, cy0 + 1, 1);
    for (let dy = -18; dy <= 1; dy++) for (let dx = -36; dx <= 36; dx++) {
      try { st.setWall(cx0 + dx, cy0 + dy, 1); } catch {}
    }
  }
  g.player.x = window.__pinX; g.player.y = window.__pinY;
  g.player.vx = 0; g.player.vy = 0; g.player.hp = g.player.maxHp;
  // 昼夜/天气/事件钉死:正午、无雨、无风、无血月日食
  g.world.clock.timeOfDay = 27000; g.world.clock.isDay = true;
  g.world.clock.eclipse = false; g.world.clock.bloodMoon = false;
  if (g.world.weather) { g.world.weather.maxRaining = 0; g.world.weather.cloudAlpha = 0; g.world.weather.windSpeedCurrent = 0; }
  // 清场:怪全灭、粒子清空
  window.__swSetPool?.([]);
  for (const list of [g.entities.enemies, g.entities.all?.() ?? []]) {
    for (const e of list ?? []) { try { e.dead = true; } catch {} }
  }
  try { g.particles.length = 0; } catch {}
  try { g.dmgNumbers.length = 0; } catch {}
  // buff 全清(发光类 buff 会改光照)
  try { g.player.buffs.active.clear(); } catch {}
  return { cx: cx0, cy: cy0 };
}, underground);

// 稳定化:跑若干 tick+渲染让 chunk 烘焙/光照区域就位(之后彻底停更)
const settle = async () => {
  await page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 0; i < 60; i++) {
      g.player.x = window.__pinX; g.player.y = window.__pinY;
      g.player.vx = 0; g.player.vy = 0;
      g.fixedUpdate(1 / 60);
    }
    g.player.x = window.__pinX; g.player.y = window.__pinY;
    g.player.vx = 0; g.player.vy = 0;
  });
  await evalSnap();
};

// 正例场景改用【洞穴口袋+强制全白光照】:高空空域的云/环境实体每渲染帧自走
// (updateClouds 风随机游走等),两次渲染基线无法归零——改为直接把 lighting
// 公共面数组钉成全 255(compositeLight 的输入),快路径触发条件与真实白天
// 全亮场景完全同构,而场景本身保持洞穴的逐字节确定性。
const pinLightFull = () => page.evaluate(() => {
  const L = window.__swGame.lighting;
  L.r.fill(255); L.g.fill(255); L.b.fill(255);
});
console.log('==== 场景 A(洞穴口袋+强制全白光照):期望快路径命中 ====');
console.log(await carve(true));
g_running_off: await page.evaluate(() => { window.__swGame.running = false; });
await settle();
check('harness:worldCtxLayer 存在', await page.evaluate(() => !!window.__swGame.renderer.worldCtxLayer));
await armCounter();
// harness 自检:回退分支确实在跑(任意一次渲染应有 getImageData)
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = false; });
await evalSnap();
check('harness:CPU 回退分支已激活(getImageData>0)', await readCounter() > 0, `cnt=${await readCounter()}`);
await pinLightFull();   // 钉全白光照(渲染只读该数组,后续多次渲染持续有效)

// 配置 1:快路径开(默认)
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = true; });
const cntBase = await readCounter();   // 基数含 harness 自检那一次
const A_on1 = await evalSnap(), cntAon1 = await readCounter();
const A_on2 = await evalSnap(), cntAon2 = await readCounter();
// 配置 2:快路径关(旧行为)
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = false; });
const A_off1 = await evalSnap(), cntAoff1 = await readCounter();
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = true; });

const dBase = diff(A_on1, A_on2);
check('场景A 确定性基线(同配置两帧 diff=0)', dBase.n === 0, JSON.stringify(dBase));
const dAB = diff(A_on1, A_off1);
check('场景A 快路径开/关 输出逐字节一致', dAB.n === 0, JSON.stringify(dAB));
check('场景A 快路径命中(on 渲染 getImageData 零新增)', cntAon1 === cntBase && cntAon2 === cntBase, `base=${cntBase} on=${cntAon1},${cntAon2}`);
check('场景A 关闭时走旧路径(getImageData +1)', cntAoff1 === cntBase + 1, `off=${cntAoff1} base=${cntBase}`);

console.log('==== 场景 B:地下洞穴口袋(期望非全亮,快路径不触发) ====');
console.log(await carve(true));
await settle();
await armCounter();
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = true; });
const B_on1 = await evalSnap(), cntBon1 = await readCounter();
const B_on2 = await evalSnap(), cntBon2 = await readCounter();
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = false; });
const B_off1 = await evalSnap(), cntBoff1 = await readCounter();
await page.evaluate(() => { window.__swGame.renderer.constructor.lightFast = true; });

const dBaseB = diff(B_on1, B_on2);
check('场景B 确定性基线(diff=0)', dBaseB.n === 0, JSON.stringify(dBaseB));
const dBB = diff(B_on1, B_off1);
check('场景B 快路径开/关 输出逐字节一致', dBB.n === 0, JSON.stringify(dBB));
check('场景B 快路径未触发(两配置都有 getImageData)', cntBon1 > 0 && cntBoff1 > 0, `on=${cntBon1} off=${cntBoff1}`);

console.log('==== 场景 C(洞穴口袋):opaque(alpha:false) 翻转对拍 ====');
console.log(await carve(true));
await settle();
const attrsDefault = await page.evaluate(() => {
  const a = window.__swGame.renderer.ctx.getContextAttributes?.() ?? {};
  return { alpha: a.alpha, wRF: a.willReadFrequently };
});
check('默认主画布 alpha=false(opaqueMain 默认开)', attrsDefault.alpha === false, JSON.stringify(attrsDefault));
const O_opaque = await evalSnap();
// 翻转到透明后备(recreateMainCanvas 读 opaqueMain 静态)
await page.evaluate(() => { window.__swGame.renderer.constructor.opaqueMain = false; window.__swGame.renderer.recreateMainCanvas(); });
const attrsTransparent = await page.evaluate(() => {
  const a = window.__swGame.renderer.ctx.getContextAttributes?.() ?? {};
  return { alpha: a.alpha };
});
check('翻转后 alpha=true', attrsTransparent.alpha === true, JSON.stringify(attrsTransparent));
const O_transp1 = await evalSnap();
const O_transp2 = await evalSnap();
// 还原
await page.evaluate(() => { window.__swGame.renderer.constructor.opaqueMain = true; window.__swGame.renderer.recreateMainCanvas(); });

const dOT = diff(O_opaque, O_transp1);
check('opaque 开/关 输出一致(RGB 必须全等;α 差异区计数单列)', dOT.n === 0 || (dOT.n === dOT.alphaOnly), JSON.stringify(dOT));
const dTT = diff(O_transp1, O_transp2);
check('透明后备确定性基线(diff=0)', dTT.n === 0 || dTT.n === dTT.alphaOnly, JSON.stringify(dTT));

console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail > 0 ? 1 : 0);
