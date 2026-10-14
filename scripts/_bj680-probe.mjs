// ★BJ680 探针:Enter 聊天历史回看端到端(单机面)。
// 链路:注入消息 → 关框 10 行浮层 → 10s 过期消失 → Enter 开框=历史重现(500 池)
//   → ↑/↓ 滚动 → Esc 收合 → 再开框发消息=单机本地回显;几何锚(36/22/88)。
// 运行:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj680-probe.mjs
import puppeteer from 'puppeteer-core';

const N = 14;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const t0 = Date.now();
page.on('pageerror', (e) => console.log(`PAGE ERROR [+${Date.now() - t0}ms]:`, e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
for (let a = 0; a < 5; a++) {
  try {
    await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
    break;
  } catch { await sleep(1500); }
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await sleep(800);
const out = {};

// ---- 注入 N 条消息(单行,确定性) ----
await page.evaluate((n) => {
  for (let i = 1; i <= n; i++) window.__swUI.chatMessage(`msg${i}`, 50, 255, 130);
}, N);
await sleep(300);

const lineTexts = () => page.evaluate(() =>
  [...document.querySelectorAll('.sw-chat-line')].map((l) => l.textContent));

// ---- A. 关框:10 行浮层(新在底) ----
out.closedCount = (await lineTexts()).length;
out.closedNewest = (await lineTexts()).at(-1);
out.closedOldest = (await lineTexts())[0];

// ---- B. 几何锚:x=88 / 最新行底=36 / 行距 22 ----
out.geo = await page.evaluate(() => {
  const lines = [...document.querySelectorAll('.sw-chat-line')].map((l) => l.getBoundingClientRect());
  const gaps = lines.slice(1).map((r, i) => Math.round(lines[i].y - r.y));
  return {
    x: Math.round(lines.at(-1).x),
    newestBottomGap: Math.round(window.innerHeight - lines.at(-1).bottom),
    pitches: [...new Set(gaps)],
  };
});

// ---- C. 10s 过期:关框整窗消失(600 拍) ----
await sleep(10600);
out.afterExpiryClosedCount = (await lineTexts()).length;

// ---- D. Enter 开框:单机开禁 + 历史重现(池常驻) ----
await page.keyboard.press('Enter');
await sleep(300);
out.chatboxOpen = await page.evaluate(() => !!document.querySelector('.sw-chatbox'));
out.reopenCount = (await lineTexts()).length;
out.reopenNewest = (await lineTexts()).at(-1);
out.reopenOldest = (await lineTexts())[0];

// ---- E. ↑ 滚动:真实键 1 次应移窗(容差:首按即时 +1,长按 interval 60/s) ----
await page.keyboard.press('ArrowUp');
await sleep(150);
const afterUpOldest = (await lineTexts())[0];
out.upShifted = afterUpOldest !== out.reopenOldest;
out.afterUpOldest = afterUpOldest;

// ---- F. 滚到底:直接事件补到 offset 上限(N-10=4 行旧向),最旧 msg1 应到顶 ----
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sw-chat-scroll', { detail: { delta: 99 } })));
await sleep(150);
out.scrolledOldest = (await lineTexts())[0];

// ---- G. ↓ 回新 + Esc 收合:过期后关框=空 ----
await page.evaluate(() => window.dispatchEvent(new CustomEvent('sw-chat-scroll', { detail: { delta: -99 } })));
await page.keyboard.press('Escape');
await sleep(300);
out.chatboxAfterEsc = await page.evaluate(() => !!document.querySelector('.sw-chatbox'));
out.afterEscCount = (await lineTexts()).length;

// ---- H. 单机发送本地回显(netMode==0,Main.cs:18545-18548) ----
await page.evaluate(() => {
  const g = window.__swGame, ui = window.__swUI;
  window.__probe = { sent: null, uiMsgs: [] };
  const os = g.sendChat.bind(g);
  g.sendChat = (t, w) => { window.__probe.sent = [t, w]; os(t, w); };
  const om = ui.chatMessage.bind(ui);
  ui.chatMessage = (t, r, gg, b, wd) => { window.__probe.uiMsgs.push(String(t)); om(t, r, gg, b, wd); };
});
await page.keyboard.press('Enter');
await sleep(250);
out.hChatboxOpen = await page.evaluate(() => !!document.querySelector('.sw-chatbox'));
out.hInputVal = await page.evaluate(() => document.querySelector('.sw-chatbox input')?.value ?? null);
await page.keyboard.type('hi680');
out.hTyped = await page.evaluate(() => document.querySelector('.sw-chatbox input')?.value ?? null);
await page.keyboard.press('Enter');
await sleep(400);
out.hSent = await page.evaluate(() => window.__probe.sent);
out.hUiMsgs = await page.evaluate(() => window.__probe.uiMsgs);
out.spEcho = (await lineTexts()).at(-1) ?? null;
out.chatboxAfterSend = await page.evaluate(() => !!document.querySelector('.sw-chatbox'));

// ---- 判定 ----
const pass = out.closedCount === 10 && out.closedNewest === `msg${N}` && out.closedOldest === `msg${N - 9}`
  && out.geo.x === 88 && out.geo.newestBottomGap === 36 && out.geo.pitches.every((p) => Math.abs(p) === 22)
  && out.afterExpiryClosedCount === 0
  && out.chatboxOpen === true && out.reopenCount === 10 && out.reopenNewest === `msg${N}` && out.reopenOldest === `msg${N - 9}`
  && out.upShifted === true
  && out.scrolledOldest === 'msg1'
  && out.chatboxAfterEsc === false && out.afterEscCount === 0
  && out.hSent?.[0] === 'hi680'
  && typeof out.spEcho === 'string' && out.spEcho.includes('hi680') && out.chatboxAfterSend === false;
console.log(JSON.stringify({ ...out, PASS: pass }, null, 1));
await browser.close();
process.exit(pass ? 0 : 1);
