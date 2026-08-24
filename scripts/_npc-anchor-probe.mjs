// 鸟妖(48)碰撞盒 vs 贴图锚点探针:hook drawImage 按【对象引用】抓 NPC_48 实际目标矩形,
// 绘制时刻同步快照盒位置(鸟妖飞行中,事后读盒会漂移),对拍原版语义
// (通用尾段 Main.cs:23658 帧中心钉盒中心 + NPCAddHeight(48)=32 :22263)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const NID = Number(process.env.SW_PROBE_NPC ?? 48);
const ADD = Number(process.env.SW_PROBE_ADD ?? 32);
const out = await page.evaluate(async ([NID, ADD]) => {
  const g = window.__swGame;
  g.debugSpawnNpc(NID, 1, false);
  // 等真实渲染帧让 NPC_N 懒加载落地(首帧绘制尝试触发加载)
  await new Promise((res) => { let n = 0; const t = () => { if (++n >= 30) res(); else requestAnimationFrame(t); }; requestAnimationFrame(t); });
  const npc48 = g.renderer.atlas.vnpc(NID, 0);
  if (!npc48) return { err: 'atlas vnpc(${NID}) null(懒加载未落地)' };
  const npc48Img = npc48.img;
  const samples = [];
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    try {
      if (img === npc48.img && rest.length >= 8) {
        const h = g.entities.enemies.find((n) => !n.dead && n.vanillaId === NID);
        if (h) {
          const m = this.getTransform();
          const [bx, by] = g.camera.worldToScreen(h.cx, h.cy);
          samples.push({
            dx: rest[4], dy: rest[5], dw: rest[6], dh: rest[7],   // 9-arg: [sx,sy,sw,sh,dx,dy,dw,dh]
            scaleY: m.d, originX: m.e, originY: m.f,
            boxCy: by, zoom: g.camera.zoom,
          });
        }
      }
    } catch { /* ignore */ }
    return orig.call(this, img, ...rest);
  };
  // 收集窗:最多 240 帧或凑满 5 样本
  await new Promise((res) => {
    let n = 0;
    const tick = () => { n++; if (samples.length >= 5 || n >= 240) res(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  proto.drawImage = orig;
  if (!samples.length) return { err: '未抓到 NPC_48 绘制(鸟妖可能离屏/死亡)' };
  return { samples: samples.slice(0, 5) };
}, [NID, ADD]);
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
if (out.err) { console.log('FAIL: ' + out.err); process.exit(1); }
for (const [i, d] of out.samples.entries()) {
  // dy=帧顶(纹理单位,ctx.scale(spriteScale) 后×m.d=屏);帧中心=origin+(dy+dh/2)×m.d
  const frameCenterY = d.originY + (d.dy + d.dh / 2) * d.scaleY;
    const expectCenterY = d.boxCy + ADD * d.zoom;
  const okCenter = Math.abs(frameCenterY - expectCenterY) < 2;
  console.log(`#${i} 帧中心 ${frameCenterY.toFixed(1)} 期望 ${expectCenterY.toFixed(1)} (add=${ADD})`);
  if (i === 0) {
    check('帧高=86×zoom(6 帧切片正确)', Math.abs(d.dh * d.scaleY - 86 * d.zoom) < 1.5, `实测 ${(d.dh * d.scaleY).toFixed(1)}`);
  }
  check(`#${i} 帧中心=盒中心+32px(NPCAddHeight :22263)`, okCenter);
  }
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
