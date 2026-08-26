// 多人面板改造验证:①无 IP 输入框 ②刷新按钮在 ③ lobby 不可达时列表区显示
// 空态文案(无"连不上服务器"红字) ④码加入按钮文案=加入。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuOk = false;
for (let i = 0; i < 150; i++) {
  await new Promise((r) => setTimeout(r, 500));
  menuOk = await p.evaluate(() => !!document.querySelector('[data-act=mp]')).catch(() => false);
  if (menuOk) break;
}
await p.evaluate(() => { document.querySelector('[data-act=mp]').click(); });
await new Promise((r) => setTimeout(r, 3500));
const out = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('.sw-panel')].find((x) => x.textContent?.includes('多人联机') || x.textContent?.includes('Multiplayer'));
  if (!panel) return { panel: false };
  const inputs = [...panel.querySelectorAll('input')];
  const btns = [...panel.querySelectorAll('button')].map((b2) => b2.textContent);
  const listText = [...panel.children].find((c) => c.style.minHeight?.includes('60'))?.textContent ?? '';
  return {
    panel: true,
    ipInputAbsent: !inputs.some((i2) => i2.value.includes('127.0.0.1')),
    inputCount: inputs.length,
    refreshBtn: btns.some((t) => t === '刷新房间'),
    joinBtnText: btns.find((t) => t === '加入' || t === '码加入') ?? '不存在',
    listText: listText.slice(0, 40),
    hasConnectFail: panel.textContent?.includes('连不上服务器') ?? false,
  };
});
console.log(JSON.stringify(out, null, 1));
const ok = out.panel && out.ipInputAbsent && out.refreshBtn && out.joinBtnText === '加入' && !out.hasConnectFail;
await b.close();
process.exit(ok ? 0 : 1);
