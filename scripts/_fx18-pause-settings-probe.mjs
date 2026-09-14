// 反馈轮8验收:设置钮中心锚/暂停菜单重组/设置页签清理/游戏选项清理
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);

  // ---- P1 设置钮中心锚 ----
  const p1 = await page.evaluate(async () => {
    const ui = window.__swUI;
    document.getElementById('sw-welcome-announce')?.remove();
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const btn = [...document.querySelectorAll('.sw-vinv button')].find((b) => b.textContent === '设置' || b.textContent === 'Settings');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, bottom: r.bottom, iw: innerWidth, ih: innerHeight };
  });
  if (p1) {
    ok(Math.abs(p1.cx - (p1.iw - 110)) < 6, `P1a 设置钮中心 x=sw-110(${(p1.cx - (p1.iw - 110)).toFixed(1)})`);
    ok(Math.abs(p1.cy - (p1.ih - 20)) < 6, `P1b 设置钮中心 y=sh-20(Δ${(p1.cy - (p1.ih - 20)).toFixed(1)})`);
    ok(p1.ih - p1.bottom >= 6, `P1c 底距≥6px(实际 ${(p1.ih - p1.bottom).toFixed(1)})`);
  } else ok(false, 'P1 设置钮存在');

  // ---- P2 暂停菜单重组 ----
  const p2 = await page.evaluate(() => {
    const ui = window.__swUI;
    const flowStub = { onBack: () => {} };
    ui.showPause({ onResume: () => {}, onSave: () => {}, onQuit: () => {}, onSettings: () => {},
      onWeather: () => {}, onTime: () => {}, onItemSearch: () => {}, onPlayerList: () => {} });
    const panel = document.querySelector('.sw-pause-panel');
    const labels = [...panel.querySelectorAll('.sw-pause-btn')].map((b) => b.textContent);
    return { labels, panel };
  });
  const labels = p2.labels || [];
  ok(!labels.some((t) => t === '住房'), `P2a 住房已摘(${labels.join('/')})`);
  ok(!labels.some((t) => t?.includes('图鉴')), 'P2b 图鉴已摘');
  ok(labels.some((t) => t === '开发者选项'), 'P2c 开发者选项在');
  // 点进子视图
  await page.evaluate(() => {
    const panel = document.querySelector('.sw-pause-panel');
    [...panel.querySelectorAll('.sw-pause-btn')].find((b) => b.textContent === '开发者选项').click();
  });
  await sleep(120);
  const devLabels = await page.evaluate(() => [...document.querySelector('.sw-pause-panel').querySelectorAll('.sw-pause-btn')].map((b) => b.textContent));
  ok(devLabels.includes('天气控制') && devLabels.includes('时间控制') && devLabels.includes('道具搜索'), `P2d 子视图三项(${devLabels.join('/')})`);
  ok(!devLabels.includes('继续游戏'), 'P2e 子视图无主项');
  await page.evaluate(() => {
    const panel = document.querySelector('.sw-pause-panel');
    [...panel.querySelectorAll('.sw-pause-btn')].find((b) => b.textContent === '返回').click();
  });
  await sleep(120);
  const backLabels = await page.evaluate(() => [...document.querySelector('.sw-pause-panel').querySelectorAll('.sw-pause-btn')].map((b) => b.textContent));
  ok(backLabels.includes('继续游戏') && backLabels.includes('开发者选项'), 'P2f 返回主视图');
  await page.evaluate(() => document.querySelector('.sw-pause-panel')?.remove());

  // ---- P3 设置窗口页签 ----
  const p3 = await page.evaluate(() => {
    const { Settings } = {};
    return null;
  });
  const p3b = await page.evaluate(() => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.style.cssText = 'position:fixed; inset:0; z-index:1300;';
    return host;
  });
  await page.evaluate((hostTag) => {
    // 动态 import + 实例化(SettingsFlow 最小 stub)
    return (async () => {
      const mod = await import('/src/ui/Settings.ts');
      const host = document.querySelector(hostTag);
      window.__setProbe = new mod.SettingsPanel(host, { onBack: () => {}, onAchievements: () => {} });
    })();
  }, '.sw-set-panel' === 'x' ? 'body' : (await page.evaluate(() => { const h = document.createElement('div'); h.id = 'sw-set-host'; document.body.appendChild(h); return '#sw-set-host'; })));
  await sleep(200);
  const cats = await page.evaluate(() => [...document.querySelectorAll('.sw-set-cats > div')].map((d) => d.textContent));
  ok(!cats.some((t) => t?.includes('CatTouch')), `P3a CatTouch 页签已摘(${cats.join('/')})`);
  ok(!cats.some((t) => t === '成就'), 'P3b 成就页签已摘');
  ok(cats.includes('按键绑定'), 'P3c 其余页签在');
  // 游戏 tab
  await page.evaluate(() => {
    [...document.querySelectorAll('.sw-set-cats > div')].find((d) => d.textContent === '游戏' || d.textContent === 'Gameplay').click();
  });
  await sleep(150);
  const gameRows = await page.evaluate(() => {
    const c = document.querySelector('.sw-set-content');
    const labels = [...c.querySelectorAll('.sw-set-row, [class*=row]')].map((r) => r.textContent?.slice(0, 24));
    return { labels, html: c.textContent.slice(0, 400) };
  });
  ok(!gameRows.html.includes('开发者模式'), 'P3d 开发者模式行已摘');
  ok(!gameRows.html.includes('FrameSkipMode'), `P3e 帧模式标签已净(${gameRows.html.match(/帧模式[^,]*.{0,14}/)?.[0] ?? 'n/a'})`);
  ok(gameRows.html.includes('帧模式'), 'P3f 帧模式行在');
  ok(errs.length === 0, `无页面错误(${errs.join(' | ')})`);
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
