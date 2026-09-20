// 一次性:静态层向日葵动画运行态采样——验证 keyframes 实际推进(帧数离散跳变
// +首帧 16 tick 停顿),补 _bootstatic-probe.mjs 只看 animationName 的盲区。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5282';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
// ★与 _bootstatic-probe.mjs 同款节流:不放慢 bundle,静态层几十 ms 就被摘,采不到循环
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 40,
  downloadThroughput: 160 * 1024, uploadThroughput: 160 * 1024,
});
await cdp.send('Page.enable');
await cdp.send('Page.navigate', { url: ORIGIN });
await new Promise((r) => setTimeout(r, 2500));
const seq = await page.evaluate(() => new Promise((res) => {
  const el = document.querySelector('#sw-boot-static .sb-flower');
  const out = [];
  const t0 = performance.now();
  const tick = () => {
    const p = getComputedStyle(el).backgroundPositionY;
    out.push([Math.round(performance.now() - t0), p]);
    if (performance.now() - t0 < 1250) requestAnimationFrame(tick); else res(out);
  };
  requestAnimationFrame(tick);
}));
// 折叠成 (position, 持续ms) 游程
const runs = [];
for (const [, p] of seq) {
  if (!runs.length || runs[runs.length - 1][0] !== p) runs.push([p, 1]);
  else runs[runs.length - 1][1]++;
}
console.log('runs(pos,frames):', JSON.stringify(runs));
// 原版循环(行序 10,11..18,0..9;首行 16 tick 其余 3 tick):采样窗从循环中段起,
// 判据=①游程行序与原版循环循环同构(从任一点起转一圈回到起点)②首行停顿≥14 帧
// ③中间各行=3±1 帧。
const CYCLE = ['55.5556%', '61.1111%', '66.6667%', '72.2222%', '77.7778%', '83.3333%',
  '88.8889%', '94.4444%', '100%', '0%', '5.55556%', '11.1111%', '16.6667%', '22.2222%',
  '27.7778%', '33.3333%', '38.8889%', '44.4444%', '50%'];
const posSeq = runs.map((r) => r[0]);
let ok = true;
for (let i = 0; i < posSeq.length; i++) {
  if (posSeq[i] !== CYCLE[i % CYCLE.length]) { ok = false; break; }
}
const firstHold = runs[0][1];
const midOk = runs.slice(1, -1).every((r) => r[1] >= 2 && r[1] <= 4);
console.log('cycle-order ok:', ok, '; first hold:', firstHold, 'frames (期望≈16); mid holds 3±1:', midOk);
if (ok && firstHold >= 14 && midOk) console.log('PASS anim');
else { console.log('FAIL anim'); process.exitCode = 1; }
await browser.close();
