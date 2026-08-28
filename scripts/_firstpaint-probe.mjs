// 就绪瞬间黑一下验证(#三开压测批):rAF 逐帧采样
//   vuiW = vui-canvas 宽(全屏→80 = 加载页撤除时刻)
//   skyLum = 主画布 (25%h) 天区亮度
// 断言:vuiW 收缩帧及其后 ≤1 帧内 skyLum 必须已亮(世界先上屏后撤幕布)
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5210');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('fp');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
await page.evaluate(() => {
  (window).__fp = { frames: [], raf: 0 };
  const vui = document.querySelector('#ui-canvas');
  const loop = () => {
    let lum = -1;
    try {
      // ★每帧动态取 renderer.canvas(菜单幕布销毁后宽 0,静态捕获会抛异常)
      const main = window.__swGame?.renderer?.canvas;
      if (main && main.width > 0) {
        const t = document.createElement('canvas'); t.width = 1; t.height = 1;
        const x = t.getContext('2d', { willReadFrequently: true });
        x.drawImage(main, Math.round(main.width / 2), Math.round(main.height * 0.25), 2, 2, 0, 0, 1, 1);
        const d = x.getImageData(0, 0, 1, 1).data;
        lum = (d[0] + d[1] + d[2]) / 3;
      }
    } catch { /* 画布未就绪 */ }
    (window).__fp.frames.push({ vuiW: vui?.width ?? 0, lum: Math.round(lum) });
    (window).__fp.raf = requestAnimationFrame(loop);
  };
  loop();
});
// 点击进入世界(存档 12345 已存在则直进)
if (await page.$('.sw-vsel .sw-vitem')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
} else {
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(()=>{});
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const f = (window).__fp.frames;
  cancelAnimationFrame((window).__fp.raf);
  // 找切换帧:vuiW 从全屏(>500)跳到 ≤200
  let switchIdx = -1;
  for (let i = 1; i < f.length; i++) if (f[i - 1].vuiW > 500 && f[i].vuiW <= 200) { switchIdx = i; break; }
  if (switchIdx < 0) return { fail: '未见切换帧', total: f.length };
  const at = f[switchIdx], before = f[switchIdx - 1];
  const next2 = f.slice(switchIdx, switchIdx + 2).map(x => x.lum);
  return { switchIdx, before: { vuiW: before.vuiW, lum: before.lum },
    at: { vuiW: at.vuiW, lum: at.lum }, next2,
    framesAfterSwitchToBright: next2.findIndex(l => l > 60) };
});
console.log(JSON.stringify(out));
if (out.fail) { console.log('=== FAIL(probe)==='); process.exit(2); }
const gapOk = out.framesAfterSwitchToBright === 0;   // 切换帧当帧世界已亮
console.log(`${gapOk || out.framesAfterSwitchToBright === 0 ? 'PASS' : 'FAIL'} 撤幕布帧 skyLum=${out.at.lum}(切换后至亮帧间隔=${out.framesAfterSwitchToBright})`);
await browser.close();
process.exit(gapOk || out.framesAfterSwitchToBright === 0 ? 0 : 3);
