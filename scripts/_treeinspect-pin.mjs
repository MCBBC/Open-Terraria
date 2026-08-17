// 解剖台针孔自检：各冠样式干带针孔计数（蓝点机器检测）——用户"不同类型冠有问题"假设的定量验证
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 180000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/tree-inspect.html', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const out = [];
  // 逐冠样式：静止(sway=0) + 无风微摆 各采样
  const sel = document.getElementById('crownSel');
  const setWind = (mode) => { [...document.querySelectorAll('#windModes button')].find((b) => b.textContent.includes(mode))?.click(); };
  for (let style = 0; style <= 18; style++) {
    sel.value = String(style);
    sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 120));
    const sample = async () => {
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const hud = document.getElementById('hud').textContent;
      const m = hud.match(/干带针孔: (\d+)/);
      return m ? Number(m[1]) : -1;
    };
    setWind('静止');
    const still = await sample();
    setWind('无风微摆');
    await new Promise(r => setTimeout(r, 400));
    const idleMax = [];
    for (let i = 0; i < 12; i++) { idleMax.push(await sample()); await new Promise(r => setTimeout(r, 90)); }
    out.push({ style, still, idleMax: Math.max(...idleMax), idleMin: Math.min(...idleMax) });
  }
  return out;
});
console.log('冠样式  静止针孔  无风微摆(12帧 min~max)');
for (const r of res) console.log(String(r.style).padStart(4), String(r.still).padStart(6), `        ${r.idleMin}~${r.idleMax}`);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
