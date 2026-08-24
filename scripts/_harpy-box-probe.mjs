// 鸟妖(48)碰撞盒 vs 贴图锚点探针:hook drawImage 抓 NPC_48 实际目标矩形,
// 对拍原版语义(通用尾段 Main.cs:23658 帧中心钉盒中心 + NPCAddHeight(48)=32 :22263)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  g.debugSpawnNpc(48, 1, false);
  for (let t = 0; t < 10; t++) g.fixedUpdate(1 / 60);
  // 等真实渲染帧(rAF)——fixedUpdate 不触发绘制;首帧触发 NPC_48 懒加载
  await new Promise((res) => {
    let n = 0;
    const tick = () => { if (++n >= 60) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  // hook drawImage:按【对象引用】匹配 NPC_48(ImageBitmap 桥后无 .src 属性)
  const npc48 = g.renderer.atlas.vnpc(48, 0);
  if (!npc48) return { err: 'atlas vnpc(48) null(懒加载未落地)' };
  const npc48Img = npc48.img;
  window.__swHarpyDraws = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    try {
      if (img === npc48Img) {
        let d;
        if (rest.length >= 8) d = { dx: rest[5], dy: rest[6], dw: rest[7], dh: rest[8] ?? rest[7], mode: '9arg' };
        else d = { dx: rest[0], dy: rest[1], dw: rest[2] ?? img.width, dh: rest[3] ?? img.height, mode: '4arg' };
        // 记录当前变换,换算世界坐标
        const m = this.getTransform();
        window.__swHarpyDraws.push({ ...d, a: m.a, d: m.d, e: m.e, f: m.f });
      }
    } catch { /* ignore */ }
    return orig.call(this, img, ...rest);
  };
  g.debugSpawnNpc(48, 1, false);
  for (let t = 0; t < 10; t++) g.fixedUpdate(1 / 60);
  // 再等 30 渲染帧收集绘制调用
  await new Promise((res) => {
    let n = 0;
    const tick = () => { if (++n >= 30) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const h = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 48);
  const draws = window.__swHarpyDraws.slice(-3);
  proto.drawImage = orig;
  if (!h) return { err: 'harpy not spawned' };
  // 屏空间对拍:draws 已是屏坐标(CTM 含相机);盒三角投影同空间
  const cam = g.renderer.cam;
  const proj = (wx, wy) => { const [sx, sy] = cam.worldToScreen(wx, wy); return { x: sx, y: sy }; };
  return {
    boxScreen: {
      top: proj(h.x, h.y), center: proj(h.cx, h.cy), bottom: proj(h.cx, h.y + h.h),
      w: h.w * cam.zoom, h: h.h * cam.zoom,
    },
    draws,
    zoom: cam.zoom,
  };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
if (out.err) { console.log('FAIL: ' + out.err); process.exit(1); }
const d = out.draws[out.draws.length - 1];
const b = out.boxScreen;
if (d) {
  const frameBottom = d.y + d.h;
  const bodyBottom = d.y + 57 * (d.h / 86);   // 帧内体底 y=57(帧高86)
  console.log(`盒(屏): top=${b.top.y.toFixed(1)} bottom=${b.bottom.y.toFixed(1)} center=${b.center.y.toFixed(1)} h=${b.h.toFixed(1)}`);
  console.log(`帧(屏): y=${d.y.toFixed(1)} h=${d.h.toFixed(1)} bottom=${frameBottom.toFixed(1)} w=${d.w.toFixed(1)} zoom=${out.zoom}`);
  console.log(`体底(帧y57): ${bodyBottom.toFixed(1)}`);
  // 原版语义:帧中心 = 盒中心屏 y + 32×zoom(NPCAddHeight(48)=32 :22263)
  const expectCenter = b.center.y + 32 * out.zoom;
  const actualCenter = d.y + d.h / 2;
  check('帧高=86×zoom(6 帧切片正确)', Math.abs(d.h - 86 * out.zoom) < 1, `实测 ${d.h.toFixed(1)}`);
  check('帧中心=盒中心+32px(NPCAddHeight :22263)', Math.abs(actualCenter - expectCenter) < 2,
    `实测 ${actualCenter.toFixed(1)} 期望 ${expectCenter.toFixed(1)}`);
  check('体底垂到盒底之下(原版观感:盒盖躯干,脚/尾悬下)', bodyBottom > b.bottom.y - 1,
    `体底 ${bodyBottom.toFixed(1)} vs 盒底 ${b.bottom.y.toFixed(1)}`);
} else {
  check('抓到 NPC_48 绘制调用', false);
}
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
