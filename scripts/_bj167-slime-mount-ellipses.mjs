// ★BJ167 史莱姆鞍(mount 3)骑乘态残留两椭圆 实报定谳探针：
//  a) 仪器中立自证：patch CanvasRenderingContext2D.prototype.ellipse 记录
//     fillStyle==='#4080FF'（mountFallbackColor(3) 恒字面量）的调用 =
//     drawMountLayer 近似胶囊签名（大身体 bodyW/2×bodyH/2 + 小头 r≈bodyW*0.16）。
//     修后骑乘态 60 帧该签名计数必须 = 0（修前 ≈2/帧）。
//  b) 贴图层在场证据：drawImage 源 58×192（Mount_Slime.png 四帧行）计数 > 0
//     ——BJ166 修好的背层真贴图不因本刀消失。
//  c) 截图目视：骑乘稳态整幅 + 玩家局部。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 1360, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 近期探针同款自举链：?play=small 直进世界（无 select+button 舞步）
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory?.(); });
await sleep(200);
await page.waitForFunction(() => window.__swGame?.player, { timeout: 120000, polling: 500 });

const out = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, st = g.world.store, p = g.player, inv = p.inv;
  const items = window.__swItems;
  const res = { steps: [] };
  const ok = (name, cond, extra) => {
    res.steps.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra !== undefined ? ` (${extra})` : ''}`);
    return cond;
  };
  // ---- 仪器（neutral：只记录不改变行为）----
  window.__bj167 = { blue: 0, allEllipse: 0, slimeTex: 0, samples: [] };
  const EP = CanvasRenderingContext2D.prototype;
  const origEllipse = EP.ellipse;
  EP.ellipse = function (x, y, rx, ry, ...rest) {
    const w = window.__bj167;
    w.allEllipse++;
    // ★Chrome 会把 hex fillStyle 规范化为小写（'#4080FF'→'#4080ff'），比对必须不区分大小写
    if (String(this.fillStyle).toLowerCase() === '#4080ff') {
      w.blue++;
      if (w.samples.length < 8) w.samples.push([Math.round(x), Math.round(y), Math.round(rx), Math.round(ry)]);
    }
    return origEllipse.apply(this, [x, y, rx, ry, ...rest]);
  };
  const origDrawImage = EP.drawImage;
  EP.drawImage = function (img, ...rest) {
    if (img && img.width === 58 && img.height === 192) window.__bj167.slimeTex++;
    return origDrawImage.apply(this, [img, ...rest]);
  };
  // ---- 立足平台 + 静置落地 ----
  const ptx = Math.floor(p.cx / 16), pty = Math.floor((p.y + p.h) / 16);
  for (let dx = -6; dx <= 30; dx++) {
    st.setTile(ptx + dx, pty, 1, 0, 0);
    for (let dy = 1; dy <= 3; dy++) st.setTile(ptx + dx, pty - dy, 0);
  }
  for (let i = 0; i < 120 && !p.onGround; i++) { p.fixedUpdate(1, g.hooksProxy ?? g); await sleep(8); }
  ok('立足静置', p.onGround);
  // ---- 基线（未骑乘）：胶囊签名应为 0 ----
  const base0 = window.__bj167.blue;
  await sleep(500);
  ok('未骑乘基线无胶囊签名', window.__bj167.blue === base0, `delta=${window.__bj167.blue - base0}`);
  // ---- 上史莱姆鞍 2430 ----
  const KEY = 'vi_2430_slimy_saddle';
  inv.add(items[KEY], 1);
  let held = false;
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[KEY]) { inv.selected = i; held = true; }
  ok('粘鞍 2430 入包选中', held);
  g.input.mouseDown = true;
  await sleep(220);
  g.input.mouseDown = false;
  await sleep(120);
  ok('骑乘中', p.ridingMount === true, `type=${p.mount.type}`);
  ok('坐骑类型 = 史莱姆鞍(3)', p.mount.type === 3);
  // ---- 骑乘稳态 60 帧 ----
  const blue0 = window.__bj167.blue, tex0 = window.__bj167.slimeTex;
  await sleep(1000);
  const blueRide = window.__bj167.blue - blue0;
  const texRide = window.__bj167.slimeTex - tex0;
  res.blueEllipsePerRide = blueRide;
  res.slimeTexDrawPerRide = texRide;
  res.ellipseSamples = window.__bj167.samples;
  ok('骑乘态胶囊签名(#4080FF) = 0', blueRide === 0, `count=${blueRide}`);
  ok('背层 Mount_Slime 贴图在场(58×192)', texRide > 0, `count=${texRide}`);
  // 保持骑乘态返回 Node 侧截图（目视判据 = 骑乘稳态无两椭圆）
  return res;
});
await new Promise(r => setTimeout(r, 400));
const SHOT = process.env.SHOT_PREFIX || '/tmp/bj167-riding';
await page.screenshot({ path: `${SHOT}.png` });
const out2 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player;
  p.dismount?.();
  await sleep(300);
  return { dismounted: !p.ridingMount, blueTotal: window.__bj167.blue, allEllipse: window.__bj167.allEllipse };
});
await page.screenshot({ path: `${SHOT}-dismount.png` });
console.log(JSON.stringify({ ...out, ...out2 }, null, 1));
console.log('pageerrors:', JSON.stringify(errs));
await browser.close();
