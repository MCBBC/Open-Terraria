// 公告框改版验证:①无独立购买原版按钮(仅我已知晓) ②免责段无"(新标签页打开)"
// ③面板高度 ≤72vh ④蓝链仍在(_blank + Steam) ⑤我已知晓关闭+永久生效。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let shown = false;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  shown = await p.evaluate(() => !!document.getElementById('sw-welcome-announce')).catch(() => false);
  if (shown) break;
}
if (!shown) { console.log('公告未出现 ✗'); await b.close(); process.exit(1); }
const s1 = await p.evaluate(() => {
  const root = document.getElementById('sw-welcome-announce');
  const panel = root.firstElementChild;
  const vh = window.innerHeight / 100;
  const btns = [...root.querySelectorAll('button')].map((b2) => b2.textContent);
  const link = [...root.querySelectorAll('a')].find((a) => a.textContent === '购买原版');
  return {
    panelHeightVh: +(panel.getBoundingClientRect().height / vh).toFixed(1),
    buttons: btns,
    onlyAckBtn: btns.length === 1 && btns[0] === '我已知晓',
    noParenText: !(root.textContent ?? '').includes('(新标签页打开)'),
    linkTarget: link?.getAttribute('target'),
    bodyScrolls: (root.querySelector('div:nth-child(2)')?.getBoundingClientRect().height ?? 0) < panel.getBoundingClientRect().height,
  };
});
await p.evaluate(() => {
  const ack = [...document.querySelectorAll('#sw-welcome-announce button')].find((b2) => b2.textContent === '我已知晓');
  ack.click();
});
await new Promise((r) => setTimeout(r, 300));
const closed = await p.evaluate(() => !document.getElementById('sw-welcome-announce'));
const lsSet = await p.evaluate(() => !!localStorage.getItem('sw.welcome.announce.acked'));
console.log(JSON.stringify({ ...s1, closed, lsSet, errs: errs.length }, null, 1));
const ok = s1.onlyAckBtn && s1.noParenText && s1.panelHeightVh <= 72 && s1.linkTarget === '_blank' && s1.bodyScrolls && closed && lsSet && errs.length === 0;
await b.close();
process.exit(ok ? 0 : 1);
