// BJ535 层1定谳 v2:Chromium :hover 维护面——rAF 心跳(模拟游戏主循环)下,
// DOM 重建后零 mousemove,:hover 是否自动更新。三阶段:
//   P1 静止页(无 rAF):mousemove 是否建立 hover(基线)
//   P2 rAF 心跳页:mousemove 建立 hover → 重建 → 零事件多帧 → hover?
//   P3 elementFromPoint 坐标 hit-test 在重建后是否恒正确(修复法可行性)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: false, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.goto('about:blank');
const cdp = await page.createCDPSession();
const X = 200, Y = 110;

const mkRow = (id) => `(() => {
  let host = document.getElementById('host');
  if (!host) {
    document.body.style.margin = '0';
    host = document.createElement('div');
    host.id = 'host';
    host.style.cssText = 'position:absolute; left:100px; top:100px; width:300px; height:400px;';
    document.body.appendChild(host);
  }
  const row = document.createElement('div');
  row.id = '${id}';
  row.style.cssText = 'height:40px; background:#463764;';
  const sp = document.createElement('span');
  sp.textContent = '${id}';
  row.appendChild(sp);
  host.replaceChildren(row);
  return row;
})()`;

const hoverOf = () => page.evaluate(() => {
  const el = document.querySelector('#host > div');
  return { id: el.id, hover: el.matches(':hover'), fromPoint: (() => { const t = document.elementFromPoint(200, 110); return t ? (t.closest('#host > div')?.id ?? t.tagName) : null; })() };
});
const move = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- P1 静止页(无 rAF 心跳) ----------
await page.evaluate(mkRow('P1a'));
await move(X, Y);
await wait(400);
console.log('[P1] 静止页 mouseMoved 后:           ', JSON.stringify(await hoverOf()), '(hover 建立否=基线)');

// ---------- P2 rAF 心跳页(模拟游戏主循环) ----------
await page.evaluate(() => { const beat = () => { requestAnimationFrame(beat); }; requestAnimationFrame(beat); });
await page.evaluate(mkRow('P2a'));
await move(X, Y);
await wait(400);
const p2a = await hoverOf();
console.log('[P2.1] rAF 页 mouseMoved 后:         ', JSON.stringify(p2a), '(hover 应建立)');
// 重建 → 零事件 1.5s
await page.evaluate(mkRow('P2b'));
await wait(1500);
const p2b = await hoverOf();
console.log('[P2.2] 重建后 1.5s 零 mousemove:     ', JSON.stringify(p2b), '← Windows 形态判定点');
// 微动 mousemove
await move(X + 1, Y);
await wait(300);
const p2c = await hoverOf();
console.log('[P2.3] 微动 1px mousemove 后:        ', JSON.stringify(p2c), '(应恢复 true)');
// 复验:再重建一次 → 零事件 2s
await page.evaluate(mkRow('P2d'));
await wait(2000);
const p2d = await hoverOf();
console.log('[P2.4] 复验重建后 2s 零 mousemove:   ', JSON.stringify(p2d), '← 复验');
// 压着键重建(长按形态:mousedown 持续中,每拍合成触发重建)
await move(X, Y);
await wait(200);
await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: X, y: Y, button: 'left', buttons: 1, clickCount: 1 });
await wait(200);
await page.evaluate(mkRow('P2e'));
await wait(1500);
const p2e = await hoverOf();
console.log('[P2.5] 按住左键中重建+1.5s 零事件:   ', JSON.stringify(p2e), '← 长按合成重建同形态');
await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: X, y: Y, button: 'left', buttons: 0, clickCount: 1 });

// ---------- P3 elementFromPoint 恒正确性(修复法) ----------
await page.evaluate(mkRow('P3a'));
await move(X, Y);
await wait(300);
await page.evaluate(mkRow('P3b'));
await wait(300);
console.log('[P3] 重建后 elementFromPoint 命中链: ', JSON.stringify(await hoverOf()), '(fromPoint 应=P3b=坐标法不依赖事件流)');

await browser.close();
console.log('\n判读:P2.2/P2.4/P2.5 hover=false 且 P3 fromPoint 正确 → hover 更新依赖 mousemove 事件流(重建后冻结),坐标 hit-test 法成立。');
