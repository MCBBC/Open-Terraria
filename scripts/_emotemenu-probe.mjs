// M4 表情窗口 + M3 聊天命令探针（一次性,SW_ORIGIN 私有实例）：
//   1. 背包表情角按钮存在（UI_Emotes 双帧贴图）
//   2. 点击打开 UIEmotesMenu：分组数/标题/按钮数/解锁门（新世界=无 Boss 表情组）
//   3. 点击一个表情 → 菜单关闭 + 玩家头顶出泡（__swEmotes.count ≥1 + 360t 寿命）
//   4. 聊天命令解析（模块直取:命令表/表情别名/死亡门——离线管线冒烟）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try {
    await page.goto(`${process.env.SW_ORIGIN ?? 'http://localhost:5201'}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    ok = 'yes';
  } catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }
const ready = await page.evaluate(async () => {
  const t0 = Date.now();
  while (!window.__swGame?.player && Date.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 500)); }
  while (!window.__swUI && Date.now() - t0 < 90000) { await new Promise(r => setTimeout(r, 500)); }
  return !!(window.__swGame?.player && window.__swUI);
});
console.log('ready:', ready);
if (!ready) { await browser.close(); process.exit(1); }

// 1+2. 开背包 → 表情按钮 → 打开菜单
const menu = await page.evaluate(async () => {
  const ui = window.__swUI;
  ui.openInventory();
  await new Promise(r => setTimeout(r, 300));
  const btns = [...ui.invPanel.querySelectorAll('button')];
  const emoteBtn = btns.find(b => (b.title || '').includes('表情'));
  if (!emoteBtn) return { err: 'no emote button', titles: btns.map(b => b.title).slice(0, 12) };
  const bg0 = emoteBtn.style.backgroundPosition;
  emoteBtn.dispatchEvent(new MouseEvent('mouseenter'));
  const bgHover = emoteBtn.style.backgroundPosition;
  emoteBtn.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
  await new Promise(r => setTimeout(r, 400));
  const overlay = document.querySelector('.sw-emote-menu');
  if (!overlay) return { err: 'menu not open' };
  const groups = [...overlay.querySelectorAll('.sw-emote-group')];
  const buttons = overlay.querySelectorAll('.sw-emote-btn');
  return {
    btnTitle: emoteBtn.title, bg0, bgHover,
    groupCount: groups.length,
    titles: groups.map(g => g.querySelector('.sw-emote-title')?.textContent),
    btnCount: buttons.length,
    firstBtnTip: buttons[0]?.title,
    backText: overlay.querySelector('.sw-back-btn')?.textContent,
    paused: window.__swGame.paused,
  };
});
console.log('menu:', JSON.stringify(menu, null, 1));

// 3. 点击第 6 个表情钮（0=EmotionLove）→ 菜单关闭 + 出泡
const emote = await page.evaluate(async () => {
  const overlay = document.querySelector('.sw-emote-menu');
  const btn = overlay.querySelectorAll('.sw-emote-btn')[6];
  btn.dispatchEvent(new MouseEvent('click'));
  await new Promise(r => setTimeout(r, 300));
  return {
    closed: !document.querySelector('.sw-emote-menu'),
    bubbles: window.__swEmotes?.count?.(),
    resumed: !window.__swGame.paused,
  };
});
console.log('emote click:', JSON.stringify(emote));

// 3b. 泡寿命观察（360t ≈ 6s;2s 后仍在场）
await new Promise(r => setTimeout(r, 2000));
const still = await page.evaluate(() => window.__swEmotes?.count?.());
console.log('bubble after 2s:', still);

// 4. 命令解析冒烟（模块直取——不打网络）
const cmds = await page.evaluate(async () => {
  const m = await import('/src/chat/ChatCommands.ts');
  return {
    roll: m.createOutgoingMessage('/roll'),
    e5: m.createOutgoingMessage('/e 5'),
    alias: m.createOutgoingMessage('/大笑'),
    unknown: m.createOutgoingMessage('/notacommand x'),
    say: m.createOutgoingMessage('你好'),
    emoji: m.resolveEmojiId('爱心'),
    rollExec: m.executeCommand(m.createOutgoingMessage('/roll'), {
      playerName: 'Vinlic', team: 0, localPlayerDead: false, multiplayer: true,
      activePlayers: ['Vinlic'], playerDeaths: () => ({ pve: 0, pvp: 0 }), bossReports: [],
      rand: () => 0.42,
    }).broadcast[0].text,
  };
});
console.log('commands:', JSON.stringify(cmds, null, 1));
await browser.close();
