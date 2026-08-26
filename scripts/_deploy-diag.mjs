// 公告弹框验证:?play=small 进世界 → 公告出现 → 点「我已知晓」→ 关闭;
// reload 后不再出现(localStorage 永久关闭)。购买链接断言:_blank + Steam。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
await p.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:4177'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const dlgPresent = () => p.evaluate(() => !!document.getElementById('sw-welcome-announce')).catch(() => false);
let shown = false;
for (let i = 0; i < 240; i++) {
  await new Promise((r) => setTimeout(r, 500));
  if (await dlgPresent()) { shown = true; break; }
}
if (!shown) { console.log('公告未出现 ✗'); await b.close(); process.exit(1); }
const content = await p.evaluate(() => {
  const root = document.getElementById('sw-welcome-announce');
  const body = root.querySelector('div:nth-child(2)');
  const link = [...root.querySelectorAll('a')].find((a) => a.textContent === '购买原版');
  const ack = [...root.querySelectorAll('button')].find((b2) => b2.textContent === '我已知晓');
  return {
    textLen: body.textContent?.length ?? 0,
    noMarkdown: !/##|\*\*/.test(body.textContent ?? ''),
    hasBuyLink: !!link,
    linkTarget: link?.getAttribute('target'),
    linkHrefOk: (link?.href ?? '').includes('store.steampowered.com'),
    ackBtn: !!ack,
  };
});
await p.evaluate(() => {
  const ack = [...document.querySelectorAll('#sw-welcome-announce button')].find((b2) => b2.textContent === '我已知晓');
  ack.click();
});
await new Promise((r) => setTimeout(r, 400));
const afterAck = await dlgPresent();
const lsSet = await p.evaluate(() => !!localStorage.getItem('sw.welcome.announce.acked'));
await p.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
let reAppears = true;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  reAppears = await dlgPresent();
  if (reAppears) break;   // 出现=永久关闭失效
}
console.log(JSON.stringify({ shown, ...content, afterAckClosed: !afterAck, lsSet, reAppearsAfterReload: reAppears, errs: errs.length }, null, 1));
const ok = shown && content.textLen > 1200 && content.noMarkdown && content.hasBuyLink && content.linkTarget === '_blank' && content.linkHrefOk && content.ackBtn && afterAckClosed && lsSet && !reAppearsAfterReload && errs.length === 0;
await b.close();
process.exit(ok ? 0 : 1);
