/**
 * SW-BJ58 探针 J：worldCanvas 位图持久性判宖。
 * 前情:精灵像素在 worldCanvas 上,但任何一帧的 drawImage/putImageData 全量记录
 * 都没有它 → 假说=曾一次性画上,worldCanvas 不整帧清屏 → 陈旧位图。
 * ① WC 擦除测试:clearRect worldCanvas 精灵区 → 可见画布同步消失? 泵 5 帧后是否
 *   被某通道重画回来?
 * ② 位移测试:玩家+200px → 精灵随玩家重生(每帧面)还是留原世界位(位图)还是消失?
 * ③ 摘除测试:摘配件长泵 → WC 上是否被整清/覆盖。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump, nextFrame,
  godMode, clearEnemies, itemByVid, teleport, Ledger } from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj58';
mkdirSync(OUT, { recursive: true });

const READS = `(() => {
  const g = window.__swGame;
  const read = (cv, x, y, w, h) => {
    const c2 = document.createElement('canvas');
    c2.width = w; c2.height = h;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(cv, x, y, w, h, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
    return hit;
  };
  return {
    wc: read(g.renderer.worldCanvas, 660, 370, 320, 60),
    vc: read(g.renderer.canvas, 660, 370, 320, 60),
    cam: { x: g.camera.x, y: g.camera.y },
    player: { cx: g.player.cx, cy: g.player.cy },
  };
})()`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 60, { clearEnemies: true });
  const iid5126 = await itemByVid(page, 5126);
  await page.evaluate((iid) => { const g = window.__swGame; g.player.inv.armor[3] = { id: iid, stack: 1 }; g.player.facing = 1; g.player.vx = 0; g.player.vy = 0; }, iid5126);
  await pump(page, 60, { clearEnemies: true });
  await nextFrame(page);
  const r0 = await page.evaluate(READS);
  L.say(`装备态: WC=${r0.wc} VC=${r0.vc} cam=(${r0.cam.x.toFixed(0)},${r0.cam.y.toFixed(0)}) player=(${r0.player.cx.toFixed(0)},${r0.player.cy.toFixed(0)})`);

  // ① WC 擦除精灵1 区域(700,398,16,14)
  await page.evaluate(() => {
    const g = window.__swGame;
    const cx = g.renderer.worldCanvas.getContext('2d');
    cx.save();
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.clearRect(700, 398, 16, 14);
    cx.restore();
  });
  const r1 = await page.evaluate(READS);
  L.say(`WC擦除后: WC=${r1.wc} VC=${r1.vc} (VC 应同步减)`);
  for (let i = 0; i < 5; i++) await nextFrame(page);
  const r2 = await page.evaluate(READS);
  L.say(`5帧后: WC=${r2.wc} VC=${r2.vc} (${r2.wc >= r1.wc + 3 ? '被重画=每帧通道' : '未复活=WC 位图持久'})`);

  // ② 位移:玩家右移 200px,泵+等帧
  await teleport(page, r0.player.cx + 200, r0.player.cy);
  await pump(page, 30, { clearEnemies: true });
  for (let i = 0; i < 3; i++) await nextFrame(page);
  const r3 = await page.evaluate(READS);
  L.say(`右移200px后: WC=${r3.wc} VC=${r3.vc} cam=(${r3.cam.x.toFixed(0)},${r3.cam.y.toFixed(0)}) player=(${r3.player.cx.toFixed(0)},${r3.player.cy.toFixed(0)})`);
  // 旧世界位对应屏位:屏 = 旧世界位 - 新cam + (640,400)
  const oldScreenX = Math.round(33650 + 65 - r3.cam.x + 640);
  const oldRead = await page.evaluate(`(() => {
    const g = window.__swGame;
    const c2 = document.createElement('canvas');
    c2.width = 60; c2.height = 40;
    const cx = c2.getContext('2d', { willReadFrequently: true });
    cx.drawImage(g.renderer.worldCanvas, ${oldScreenX - 30}, 380, 60, 40, 0, 0, 60, 40);
    const d = cx.getImageData(0, 0, 60, 40).data;
    let hit = 0;
    for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
    return hit;
  })()`);
  L.say(`旧世界位(现屏 x=${oldScreenX}) 橙斑=${oldRead} (>0=精灵留原地=位图;=0=随相机/玩家)`);
  // 新屏盒(相机中心周围)
  const r4 = await page.evaluate(`(() => {
    const g = window.__swGame;
    const read = (x, y, w, h) => {
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const cx = c2.getContext('2d', { willReadFrequently: true });
      cx.drawImage(g.renderer.worldCanvas, x, y, w, h, 0, 0, w, h);
      const d = cx.getImageData(0, 0, w, h).data;
      let hit = 0;
      for (let i = 0; i < d.length; i += 4) if ((d[i] > 200 && d[i+1] < 130) || (d[i] > 200 && d[i+1] > 190 && d[i+2] < 170)) hit++;
      return hit;
    };
    return { center: read(490, 370, 300, 60) };
  })()`);
  L.say(`新屏中心盒橙斑=${JSON.stringify(r4)}`);

  // ③ 摘除 + 长泵
  await page.evaluate(() => { const g = window.__swGame; g.player.inv.armor[3] = null; });
  await pump(page, 120, { clearEnemies: true });
  for (let i = 0; i < 3; i++) await nextFrame(page);
  const r5 = await page.evaluate(READS);
  L.say(`摘除+长泵后: WC=${r5.wc} VC=${r5.vc}`);

  process.exit(L.exitCode());
} finally {
  await browser.close();
}
