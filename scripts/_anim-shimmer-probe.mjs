// 烘焙确定性探针：篝火旁静态块是否被动画 tick 连带重烘且重烘出不同像素。
// 若 bake 层稳定 → 嫌疑转向合成/光照/GL 层；若不稳定 → bake 内帧依赖污染实锤。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 600000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
for (let i = 0; i < 10; i++) {
  try {
    await page.click('[data-act=sp]');
    await page.waitForSelector('.sw-vsel', { timeout: 8000 });
    break;
  } catch { if (i === 9) throw new Error('sp failed'); }
}
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('抖动');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.keyboard.type('1');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => { [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame?.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const TILES = window.__swTiles;
  const BRICK = TILES['gray_brick'], FIRE = TILES['v_215_campfires'];
  if (!BRICK || !FIRE) return { fail: `keys missing brick=${BRICK} fire=${FIRE}` };
  // 关欢迎弹窗
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 平台：px-8..px+8 一行砖 + 上方清空；篝火放 px+2（3 宽 2 高）
  const gy = py + 3;
  for (let x = px - 10; x <= px + 12; x++) {
    st.setTile(x, gy, BRICK, 0, 0);
    st.setTile(x, gy + 1, BRICK, 0, 0);
    for (let y = gy - 4; y < gy; y++) st.setTile(x, y, 0);
  }
  st.setTile(px + 2, gy - 1, FIRE, 0, 0);   // 坐在砖上（底行=gy-1? 篝火高 2 → 占 gy-2..gy-1）
  st.setTile(px + 3, gy - 1, FIRE, 18, 0);
  st.setTile(px + 4, gy - 1, FIRE, 36, 0);
  st.setTile(px + 2, gy - 2, FIRE, 0, 18);
  st.setTile(px + 3, gy - 2, FIRE, 18, 18);
  st.setTile(px + 4, gy - 2, FIRE, 36, 18);
  g.fullbright = true;                       // 排除光照脉动（用户 F9 同款）
  const cc = g.chunks;
  const ckeyX = Math.floor((px + 2) / 16), ckeyY = Math.floor((gy - 1) / 16);
  const targetKey = cc.key(ckeyX, ckeyY);
  // 静态采样区：chunk 内远离篝火的左下角（篝火在 chunk 内 lx≈(px+2)%16..+5）
  const fireLx = (px + 2) % 16;
  let rx0 = Math.max(1, fireLx - 8), ry0 = 14 * 16 - 40, rw = 24, rh = 32;   // 底部左侧 24×32px
  if (rx0 < 1) rx0 = 1;
  void rh; void rw; void ry0;
  // 挂钩：包 bakeChunkInto，对目标 chunk 记录 bake 序列（tile/wall 两层同哈希域）
  const proto = Object.getPrototypeOf(cc);
  const origBake = proto.bakeChunkInto;
  const samples = [];
  let tick = -1;
  proto.bakeChunkInto = function (cx, cy, wallPage, tilePage, cell) {
    const pair = origBake.call(this, cx, cy, wallPage, tilePage, cell);
    if ((cx === ckeyX && cy === ckeyY) || window.__shimmerCtl.ctrl) {
      try {
        const tctx = tilePage.getContext('2d', { willReadFrequently: true });
        const wctx = wallPage.getContext('2d', { willReadFrequently: true });
        const tData = tctx.getImageData(pair.sx + rx0, pair.sy + 16 * 16 - 48, 48, 44);
        const wData = wctx.getImageData(pair.sx + rx0, pair.sy + 16 * 16 - 48, 48, 44);
        let th = 0, wh = 0;
        for (let i = 0; i < tData.data.length; i += 4) {
          th = (th * 31 + (tData.data[i] << 16 | tData.data[i + 1] << 8 | tData.data[i + 2])) | 0;
          wh = (wh * 31 + (wData.data[i] << 16 | wData.data[i + 1] << 8 | wData.data[i + 2])) | 0;
        }
        samples.push({ cx, cy, tile: th, wall: wh, at: performance.now() });
      } catch (e) { samples.push({ err: String(e).slice(0, 80) }); }
    }
    return pair;
  };
  const ctl = { ctrl: false };
  window.__shimmerCtl = { ctl };
  // 推进 ~6s 实时（游戏活着跑）
  const t0 = performance.now();
  while (performance.now() - t0 < 6000) await new Promise((r) => requestAnimationFrame(r));
  // 汇总：目标 chunk 与其他 chunk 各自的 bake 数与不同哈希数
  const tgt = samples.filter((s) => s.cx === ckeyX && s.cy === ckeyY && s.tile !== undefined);
  const others = samples.filter((s) => !(s.cx === ckeyX && s.cy === ckeyY) && s.tile !== undefined);
  const uniq = (arr) => [...new Set(arr)].length;
  return {
    fireId: FIRE, brickId: BRICK, chunkXY: [ckeyX, ckeyY],
    targetBakes: tgt.length,
    targetTileHashesUniq: uniq(tgt.map((s) => s.tile)),
    targetWallHashesUniq: uniq(tgt.map((s) => s.wall)),
    otherBakes: others.length,
    otherChunkCount: uniq(others.map((s) => `${s.cx},${s.cy}`)),
    sampleTail: samples.slice(-6),
  };
});
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: '/tmp/anim-shimmer.png' });
await browser.close();
const ok = res && !res.fail && res.targetBakes > 3;
console.log(!ok ? '⚠️ 目标 chunk 未被重复重烘——查看 otherBakes' :
  (res.targetTileHashesUniq > 1 || res.targetWallHashesUniq > 1 ? '❌ 烘焙非确定：同一 chunk 重烘出多组像素' : '✅ 重烘像素恒定——bake 层无辜，嫌疑转向合成/光照层'));
