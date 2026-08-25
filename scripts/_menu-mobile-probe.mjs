// 探针：菜单手机竖屏/横屏适配回归（2026-08-25，配合菜单适配改动）。
//  三档视口循环：390×844 竖屏 / 844×390 横屏（isMobile+hasTouch）/ 1280×800 桌面对照。
//  断言：
//   1. 无横向溢出（scrollWidth ≤ innerWidth+1）且逐屏根元素 rect 在视口内
//   2. 全流程走通：标题→单人→角色列表→点行→世界列表→新建→世界创建→back→
//      角色列表→新建→角色创建
//   3. 可点性：footer back/create、页签中心 elementFromPoint 命中自身或后代
//      （缩放后真实坐标命中——触屏可达性）
//   4. 列表/发型网格滚动能力（scrollTop 可设可读）
//   5. HSL 滑杆在 scale<1 下拖动有效（knob left 变化 + HEX 变化）
//   6. 世界生成加载页（__swFlow.newWorld）：过程无 pageerror + 截图目检进度条居中
//   7. 桌面对照组锁基础几何：bodySize [500,230]、tabLefts 首项 10 步进 48 ×10、
//      行图标 img 24×24（防手滑改坏基础样式）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const VIEWPORTS = [
  { name: 'portrait', vp: { width: 390, height: 844, isMobile: true, hasTouch: true } },
  { name: 'landscape', vp: { width: 844, height: 390, isMobile: true, hasTouch: true } },
  { name: 'desktop', vp: { width: 1280, height: 800 } },
];

/** 播种两条世界索引+一条角色（新 profile 无存档；面板列表需有行可断言） */
async function seedWorlds(page) {
  return page.evaluate(async () => {
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
    const metas = [
      { id: 1, name: '种子测试世界', seed: '05162020', w: 6400, h: 1800, difficulty: 0, evil: 0,
        createdAt: now, lastPlayed: now, playTimeMs: 0, favorite: false },
      { id: 2, name: '重命名测试世界', seed: '12345', w: 4200, h: 1200, difficulty: 0, evil: 1,
        createdAt: now, lastPlayed: now, playTimeMs: 0, favorite: false },
    ];
    await put('sandboxworld.players.index', [{ id: 1, name: '探针角色', difficulty: 0, createdAt: now }]);
    const rgb = (r, g, b) => ({ r, g, b });
    await put('sandboxworld.player.1', {
      name: '探针角色', hair: 1, skinVariant: 0,
      hairColor: rgb(160, 60, 20), skinColor: rgb(255, 190, 150), eyeColor: rgb(60, 60, 120),
      shirtColor: rgb(200, 60, 50), undershirtColor: rgb(230, 230, 230),
      pantsColor: rgb(80, 90, 180), shoeColor: rgb(120, 80, 40), difficulty: 0,
    });
    await put('sandboxworld.worlds.index', metas);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 等主菜单挂载且 splash 完全退场。★不能只查 splash 不存在——reload 后
 *  splash 有约 1-2s 未挂载窗口期（kv/音频门先跑），过早判定会让后续真实
 *  鼠标点击（page.click）全被 splash 层吃掉 */
async function waitSplashGone(page) {
  for (let i = 0; i < 600; i++) {
    const ready = await page.evaluate(() => ({
      menu: !!document.querySelector('.sw-title-menu'),
      splashUp: !!document.querySelector('#sw-splash'),
    }));
    if (ready.menu && !ready.splashUp) break;
    await sleep(100);
  }
  await sleep(500);
  // 音频门（z-10001 全屏黑幕，window pointerdown once 解锁）会吃掉后续真实
  // 鼠标点击（page.click）——先在左上角点一下真实事件解锁并等其退场
  await page.mouse.click(6, 6);
  await sleep(700);
}

/** 点击含指定文本的标题按钮并等角色列表出现（最多重试 5 次） */
async function openCharSelect(page) {
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('.sw-title-btn')].find((b) => /单人|Single/.test(b.textContent ?? ''));
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    try {
      await page.waitForSelector('.sw-vsel', { timeout: 3000 });
      return;
    } catch { /* 菜单未就绪或首次点击被吞——重试 */ }
  }
  throw new Error('openCharSelect: 重试后仍未打开角色列表');
}

/** 点击含指定文本的标题按钮（evaluate 合成，与现役探针同款） */
async function clickTitleBtn(page, re) {
  await page.evaluate((src) => {
    const btn = [...document.querySelectorAll('.sw-title-btn')].find((b) => new RegExp(src).test(b.textContent ?? ''));
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }, re.source);
}

const results = [];
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  for (const { name, vp } of VIEWPORTS) {
    const page = await browser.newPage();
    await page.setViewport(vp);
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
    // 首开播种 → 重载让 WorldStore 重读（同 _world-select-probe 流程）
    await waitSplashGone(page);
    await seedWorlds(page);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitSplashGone(page);
    await sleep(600);

    const R = { viewport: name };
    const overflowCheck = () => page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    }));
    const rectWithin = (sel) => page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { sel, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
        w: Math.round(r.width), h: Math.round(r.height), innerW: window.innerWidth, innerH: window.innerHeight,
        withinX: r.left >= -1 && r.right <= window.innerWidth + 1,
        withinY: r.top >= -1 && r.bottom <= window.innerHeight + 1 };
    }, sel);
    /** 中心命中：elementFromPoint 命中目标自身或后代 */
    const hitCenter = (sel) => page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!at && (at === el || el.contains(at));
    }, sel);

    // ---- 标题 ----
    Object.assign(R, await overflowCheck());
    R.titleOverflowOk = R.scrollW <= R.innerW + 1;
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-title.png` });

    // ---- 角色列表 ----
    await openCharSelect(page);
    await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
    await sleep(500);
    Object.assign(R, await overflowCheck());
    R.charListPanel = await rectWithin('.sw-vsel');
    R.charListHitBack = await hitCenter('.sw-vsel [data-act=back]');
    R.iconImg = await page.evaluate(() => {
      const r = document.querySelector('.sw-vsel .sw-vitem-btns .sw-vico img')?.getBoundingClientRect();
      return r ? [Math.round(r.width), Math.round(r.height)] : null;
    });
    R.charListScroll = await page.evaluate(() => {
      const l = document.querySelector('.sw-vsel-list');
      // 行数少内容不满一屏时本就无需滚——视为通过
      if (l.scrollHeight <= l.clientHeight + 1) return 'no-scroll-needed';
      l.scrollTop = 40;
      return l.scrollTop > 0;
    });
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-charlist.png` });

    // 点首行 Play 图标（span.sw-vico 包装层冒泡路径）
    await page.evaluate(() => {
      document.querySelector('.sw-vsel .sw-vitem .sw-vitem-btns .sw-vico')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForSelector('.sw-vsel-title', { timeout: 10000 });
    await sleep(400);
    for (let i = 0; i < 40 && !(await page.evaluate(() =>
      (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'))); i++) await sleep(200);

    // ---- 世界列表 ----
    Object.assign(R, await overflowCheck());
    R.worldListPanel = await rectWithin('.sw-vsel');
    R.worldListHitNew = await hitCenter('.sw-vsel [data-act=new]');
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-worldlist.png` });

    // ---- 世界创建 ----
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
    await sleep(400);
    Object.assign(R, await overflowCheck());
    R.wcPanel = await rectWithin('.sw-wc-panel');
    R.wcHitCreate = await hitCenter('.sw-wc-panel [data-act=create]');
    R.wcStacked = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.sw-wc-body')).flexDirection);
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-worldcreation.png` });

    // ---- 回角色列表（wc back → 世界列表 → 再 back）→ 新建 → 角色创建 ----
    await page.click('.sw-wc-panel [data-act=back]');
    await sleep(600);   // onCancel → showWorldSelect（回到的是世界列表）
    for (let i = 0; i < 40 && (await page.$('.sw-wc-panel')); i++) await sleep(200);
    await page.click('.sw-vsel [data-act=back]');
    await sleep(600);   // onBack → showCharacterSelect
    await page.click('.sw-vsel [data-act=new]');
    await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
    await sleep(700); // fitPanel rAF 首测
    Object.assign(R, await overflowCheck());
    R.ccPanel = await rectWithin('.sw-char-panel');
    R.ccFit = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.sw-char-panel')).getPropertyValue('--cc-fit').trim() || 'unset');
    R.ccTabsAllHit = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.sw-cc-tab')];
      return tabs.map((t) => {
        const r = t.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!at && (at === t || t.contains(at));
      });
    });
    R.ccHitBack = await hitCenter('.sw-char-panel [data-act=back]');
    // 发型页签 → 网格出现 + 可滚
    await page.click('.sw-cc-tab[data-tab=hair]');
    await sleep(400);
    R.hairGridScroll = await page.evaluate(() => {
      const g = document.querySelector('.sw-cc-hairgrid');
      if (!g) return null;
      g.scrollTop = 40;
      return g.scrollTop > 0 ? true : g.scrollHeight <= g.clientHeight ? 'no-scroll-needed' : false;
    });
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-charcreation-hair.png` });

    // ---- HSL 滑杆（scale<1 下 rect 化取值）----
    await page.click('.sw-cc-tab[data-tab=hairColor]');
    await sleep(400);
    R.hslDrag = await page.evaluate(() => {
      const track = document.querySelectorAll('.sw-cc-slider')[0];
      const bar = track.querySelector('.sw-cc-sliderbar');
      const knob = track.querySelector('.sw-cc-sliderknob');
      const hexEl = document.querySelector('.sw-cc-hex');
      const hexBefore = hexEl?.textContent;
      const knobBefore = knob.style.left;
      const r = bar.getBoundingClientRect();
      const y = r.top + r.height / 2;
      const x80 = r.left + r.width * 0.8;
      track.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x80, clientY: y, buttons: 1 }));
      track.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x80, clientY: y, buttons: 1 }));
      return {
        barW: Math.round(r.width), panelScaleApplied: r.width < 178,
        knobChanged: knob.style.left !== knobBefore, knobLeft: knob.style.left,
        hexAfter: hexEl?.textContent, hexChanged: hexEl?.textContent !== hexBefore,
      };
    });
    await page.screenshot({ path: `/tmp/mobile-menu-${name}-charcreation-color.png` });

    // ---- 桌面对照组：锁基础几何（须在面板仍在场时采样）----
    if (name === 'desktop') {
      R.control = await page.evaluate(() => {
        const bodyRect = document.querySelector('.sw-char-body').getBoundingClientRect();
        // 页签 left 取相对面板体坐标（与 _charcreation-remaster-probe 同语义）
        const tabs = [...document.querySelectorAll('.sw-cc-tab')]
          .map((t) => Math.round(t.getBoundingClientRect().left - bodyRect.left));
        const step = tabs.slice(1).map((v, i) => v - tabs[i]);
        return {
          tabCount: tabs.length, tabFirst: tabs[0], tabStepUniform: step.every((d) => d === 48),
          bodySize: [Math.round(bodyRect.width), Math.round(bodyRect.height)],
          iconSize24: (() => {
            // 行图标几何在列表页采样(R.iconImg)——此处仅以断点反证:窄屏/触控规则不应命中
            return !matchMedia('(max-width: 560px)').matches
              && !matchMedia('(hover: none) and (pointer: coarse)').matches;
          })(),
          ccFitVar: getComputedStyle(document.querySelector('.sw-char-panel')).getPropertyValue('--cc-fit').trim() || 'unset',
        };
      });
    }

    // ---- 世界生成加载页 ----
    await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
    await sleep(1200);   // 小世界生成很快,趁进度条阶段先截一张
    await page.screenshot({ path: `/tmp/mobile-load-${name}.png` });
    await sleep(2300);
    if (name === 'portrait') {
      await page.screenshot({ path: `/tmp/mobile-load-${name}-late.png` });
    }
    for (let i = 0; i < 12; i++) {
      await sleep(3000);
      const done = await page.evaluate(() => !!window.__swGame?.world?.store?.w);
      if (done) break;
    }
    R.loadPageErrors = errors.slice(0, 4);
    R.errors = errors.length;

    // ---- 汇总判定 ----
    R.ok =
      R.titleOverflowOk &&
      ['charListPanel', 'worldListPanel', 'wcPanel', 'ccPanel'].every((k) => R[k]?.withinX) &&
      (name === 'landscape' || ['charListPanel', 'worldListPanel', 'wcPanel', 'ccPanel'].every((k) => R[k]?.withinY)) &&
      R.charListHitBack === true && R.worldListHitNew === true && R.wcHitCreate === true && R.ccHitBack === true &&
      Array.isArray(R.ccTabsAllHit) && R.ccTabsAllHit.every(Boolean) &&
      (R.charListScroll === true || R.charListScroll === 'no-scroll-needed') &&
      R.hairGridScroll !== false && R.hairGridScroll !== null &&
      R.hslDrag?.knobChanged === true && R.hslDrag?.hexChanged === true &&
      R.loadPageErrors.length === 0;

    if (name === 'desktop') {
      // 对照组判定（采样在面板在场时已完成）：媒体查询全不应命中
      R.ok = R.ok && !!R.control && R.control.tabStepUniform && R.control.tabFirst === 10
        && JSON.stringify(R.control.bodySize) === '[500,230]'
        && JSON.stringify(R.iconImg) === '[24,24]'
        && (R.control.ccFitVar === '1' || R.control.ccFitVar === '' || R.control.ccFitVar === 'unset');
    }

    results.push(R);
    console.log(`\n===== ${name} =====`);
    console.log(JSON.stringify(R, null, 1));
    await page.close();
  }
  const allOk = results.every((r) => r.ok);
  console.log(allOk ? '\nPROBE OK' : '\nPROBE FAILED');
  process.exitCode = allOk ? 0 : 1;
} finally {
  await browser?.close();
}
