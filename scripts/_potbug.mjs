// 陶罐错位 bug 复现:放陶罐(真帧/零帧)→ 开关门触发重建 → 对比 chunk 像素
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 1500));

// 玩家附近地表雕刻一块测试台:放两个陶罐(真帧版 + 全零帧版)和一扇门
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const POT = g.potId ?? null;
  void POT;
  // 内部 id 反查:用 TILE_DEFS 不可得——通过 key 表? 直接扫全图找不到。用锚点:
  // 放置走 st.setTile 需要 id。从 window 拿不到注册表,改用现存陶罐反推不可行。
  return { err: 'need pot id access' };
});
console.log(JSON.stringify(setup));

// 通过存档格式找 pot id:读 TILE_BY_KEY 不行——用 Game 内部? probe via placing:
// Game.placeTile 需要 item。退路:直接在 evaluate 里访问模块不可行。
// 用 v_ 表:wld 导入的 28 → 'pot'。游戏内 VUI 有全局注册吗?
const ids = await page.evaluate(() => {
  const g = window.__swGame;
  const out = {};
  for (const k of ['pot', 'door_closed', 'door_open', 'dirt']) {
    // TileStore 实例上没有注册表;尝试 Game 暴露
    out[k] = g.tileIdByKey ? g.tileIdByKey(k) : null;
  }
  return out;
});
console.log('ids:', JSON.stringify(ids));
await browser.close();
