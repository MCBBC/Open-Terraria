// 一次性视觉审计:菜单手机适配多设备×多界面截图(审完即删)
//  视口:SE竖375×667 / 常规竖390×844 / Max竖430×932 / SE横667×375 / 常规横844×390 / iPad竖768×1024
//  界面:标题 / 角色列表(8行含长名) / 角色创建(info/发型/颜色) / 世界列表(8行) / 世界创建
//  触屏仿真:hover:none+pointer:coarse 显式仿真 → 验证 C 档热区+预填标签真实效果
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/va';

const VIEWPORTS = [
  { name: 'se-portrait', vp: { width: 375, height: 667, isMobile: true, hasTouch: true } },
  { name: 'portrait', vp: { width: 390, height: 844, isMobile: true, hasTouch: true } },
  { name: 'max-portrait', vp: { width: 430, height: 932, isMobile: true, hasTouch: true } },
  { name: 'se-landscape', vp: { width: 667, height: 375, isMobile: true, hasTouch: true } },
  { name: 'landscape', vp: { width: 844, height: 390, isMobile: true, hasTouch: true } },
  { name: 'ipad-portrait', vp: { width: 768, height: 1024, isMobile: true, hasTouch: true } },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitMenuReady(page) {
  for (let i = 0; i < 600; i++) {
    const ready = await page.evaluate(() => ({
      menu: !!document.querySelector('.sw-title-menu'),
      splashUp: !!document.querySelector('#sw-splash'),
    }));
    if (ready.menu && !ready.splashUp) return;
    await sleep(100);
  }
  throw new Error('menu/splash 超时');
}

async function seed(page) {
  await page.evaluate(async () => {
    const put = (key, val) => new Promise((res, rej) => {
      const req = indexedDB.open('sandboxworld', 2);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv'); };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(JSON.stringify(val), key);
        tx.oncomplete = () => { db.close(); res(true); };
        tx.onerror = () => rej(tx.error);
      };
    });
    const now = Date.now();
    const rgb = (r, g, b) => ({ r, g, b });
    const names = [
      '超长角色名字测试二十个字整二十字', 'Alexandra-Longname', '短', '星璇·月影·绯月之夜',
      'Bouldr', '探针勇者二号', 'WhimsicalWanderer', '老八',
    ];
    await put('sandboxworld.players.index', names.map((n, i) => ({ id: i + 1, name: n, difficulty: i % 4, createdAt: now - i })));
    for (let i = 0; i < names.length; i++) {
      await put(`sandboxworld.player.${i + 1}`, {
        name: names[i], hair: (i % 3) + 1, skinVariant: 0,
        hairColor: rgb(160, 60, 20), skinColor: rgb(255, 190, 150), eyeColor: rgb(60, 60, 120),
        shirtColor: rgb(200, 60, 50), undershirtColor: rgb(230, 230, 230),
        pantsColor: rgb(80, 90, 180), shoeColor: rgb(120, 80, 40), difficulty: i % 4,
      });
    }
    const wnames = ['超长世界名字测试二十个字整整二十', 'DrunkWorld-醉酒世界很长名字', '小世界', 'FTW-for-the-worthy-seed-long', '天空之岛', 'TheConstant-永恒', 'NotTheBees-蜂巢', 'Remix-混音'];
    await put('sandboxworld.worlds.index', wnames.map((n, i) => ({
      id: i + 1, name: n, seed: '05162020', w: [4200, 6400, 8400][i % 3], h: [1200, 1800, 2400][i % 3],
      difficulty: i % 4, evil: i % 3 === 0 ? 0 : 1, createdAt: now - i, lastPlayed: now, playTimeMs: i * 60000 * 37,
      favorite: i === 1,
    })));
  });
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
try {
  for (const { name, vp } of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    // 显式仿真触屏媒体特征(C 档断点)——emulateMediaFeatures 不支持 hover/pointer,
    // 直发 CDP Emulation.setEmulatedMedia
    const client = await page.createCDPSession();
    await client.send('Emulation.setEmulatedMedia', {
      features: [
        { name: 'hover', value: 'none' },
        { name: 'pointer', value: 'coarse' },
      ],
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitMenuReady(page);
    await seed(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitMenuReady(page);
    await page.mouse.click(6, 6); // 音频门
    await sleep(700);
    await page.screenshot({ path: `${OUT}-${name}-1title.png` });

    // 角色列表
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.sw-title-btn')].find((b) => /单人|Single/.test(b.textContent ?? ''));
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
    await sleep(600);
    await page.screenshot({ path: `${OUT}-${name}-2charlist.png` });
    const overflow1 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

    // 角色创建 info 页
    await page.evaluate(() => {
      document.querySelector('.sw-vsel [data-act=new]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
    await sleep(800);
    await page.screenshot({ path: `${OUT}-${name}-3cc-info.png` });
    // 名字输入超长文本
    await page.evaluate(() => {
      const inp = document.querySelector('.sw-cc-nameval input[type=text]');
      if (inp) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(inp, '超长角色名字测试二十个字整');
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await sleep(300);
    await page.screenshot({ path: `${OUT}-${name}-4cc-longname.png` });
    // 发型页
    await page.evaluate(() => {
      document.querySelector('.sw-cc-tab[data-tab=hair]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(500);
    await page.screenshot({ path: `${OUT}-${name}-5cc-hair.png` });
    // 颜色页
    await page.evaluate(() => {
      document.querySelector('.sw-cc-tab[data-tab=hairColor]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(500);
    await page.screenshot({ path: `${OUT}-${name}-6cc-color.png` });

    // 回列表 → 世界列表
    await page.evaluate(() => {
      document.querySelector('.sw-char-panel [data-act=back]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(600);
    // 点首行 Play → 世界列表 → 新建 → 世界创建
    await page.evaluate(() => {
      document.querySelector('.sw-vsel .sw-vitem .sw-vitem-btns .sw-vico')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(1500);
    for (let i = 0; i < 40 && !(await page.evaluate(() =>
      (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'))); i++) await sleep(200);
    await page.evaluate(() => {
      document.querySelector('.sw-vsel [data-act=new]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
    await sleep(500);
    await page.screenshot({ path: `${OUT}-${name}-7wc.png` });
    // 世界创建横屏:测 Create 是否可见(压缩后)
    const wcReachable = await page.evaluate(() => {
      const b = document.querySelector('.sw-wc-panel [data-act=create]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === b || b.contains(at));
    });
    // back ×2 → 世界列表
    await page.evaluate(() => {
      document.querySelector('.sw-wc-panel [data-act=back]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await sleep(600);
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
    await sleep(400);
    await page.screenshot({ path: `${OUT}-${name}-8worldlist.png` });
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // 世界列表滚到底(验证滚动)
    const scrollInfo = await page.evaluate(() => {
      const l = document.querySelector('.sw-vsel-list');
      l.scrollTop = 99999;
      return { scrolled: l.scrollTop, max: l.scrollHeight - l.clientHeight };
    });
    await sleep(200);
    await page.screenshot({ path: `${OUT}-${name}-9worldlist-bottom.png` });
    console.log(`${name}: overflowChar=${overflow1} overflowWorld=${overflow2} wcCreateReachable=${wcReachable} worldScroll=${JSON.stringify(scrollInfo)}`);
    await page.close();
  }
  console.log('AUDIT SHOTS DONE');
} finally {
  await browser.close();
}
