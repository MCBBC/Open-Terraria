// BJ115 装备面板两问取证探针：
// ①空槽幽灵帧普查（vanilla builder 装备页 dye|vanity|equip 三列逐格 ghost 有无 + 截图）
// ②右键/眼睛可见性语义现状（eye 域 3-9 + hide 翻转回读 + tick 帧切换）
// 只读+触发 UI 内建事件，不改任何游戏状态链。
import { writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';


const browser = await puppeteer.launch({
  protocolTimeout: 600000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 160)));
console.log('STEP:goto');
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5214') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
// SW 缓存清扫（保证最新源码）
{
  const cleared = await page.evaluate(async () => {
    try {
      const ks = await caches.keys();
      await Promise.all(ks.map((k) => caches.delete(k)));
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      return ks.length;
    } catch { return -1; }
  });
  if (cleared > 0) {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 500));
  }
}
console.log('STEP:wait-sp');
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
console.log('STEP:click-sp');
await page.click('[data-act=sp]');
try { await page.waitForSelector('.sw-vsel', { timeout: 15000 }); }
catch { await page.click('[data-act=sp]'); await page.waitForSelector('.sw-vsel', { timeout: 45000 }); }
await new Promise((r) => setTimeout(r, 600));
console.log('STEP:char/world-create');
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('CH');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
console.log('STEP:world-boot');
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0 && window.__swGame?.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
console.log('STEP:in-world');
// 首进世界欢迎浮层（#sw-welcome-announce z=60 全屏遮挡）——点「我已知晓」关掉
{
  const ack = await page.$('#sw-welcome-announce button');
  if (ack) { await ack.click(); await new Promise((r) => setTimeout(r, 400)); }
}

const out = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, ui = window.__swUI;
  const r = {};
  // 恶魔之心段显示（9 行面板）：经典世界 gateExpert 每帧被 Game 回写=false →
  // 走 Shown 的【占格】臂（Player.cs:4279 shown=解锁∨占格）——armor[8] 塞任意真物品。
  // 优先 vid 904=Aglet；键缺省则回退任意 vi_ 物品（hasAt 只查非空）
  const byKey = window.__swItems ?? {};
  const agletKey = Object.keys(byKey).find((k) => /^vi_904_/.test(k))
    ?? Object.keys(byKey).find((k) => /^vi_\d+_/.test(k));
  r.itemKey = agletKey ?? 'NONE';
  if (agletKey != null) g.player.inv.armor[8] = { id: byKey[agletKey], stack: 1 };
  if (typeof ui.refreshAll === 'function') ui.refreshAll();
  await wait(400);
  if (typeof ui.refreshAll === 'function') ui.refreshAll();
  await wait(400);
  // 打开背包
  ui.openInventory(true);
  await wait(600);
  r.layout = ui['_builtLayout'] ?? null;
  r.panelDisplay = ui.invPanel?.style?.display ?? 'NO-INV PANEL';
  r.whereTotal = document.querySelectorAll('[data-where]').length;
  r.whereVisible = [...document.querySelectorAll('[data-where]')]
    .filter((el) => el.getBoundingClientRect().width > 0).length;
  r.vinvRootDisplay = document.querySelector('.sw-vinv')?.style?.display ?? 'none';
  r.paused = !!g.paused;
  r.layoutOpt = (window.__swOptions ?? null) ? undefined : undefined;
  // 装备页可见（vanilla builder pageEquip 是默认页）
  // ---- 幽灵帧普查：装备页三列 + 杂项列，逐格 ghost 有无 ----
  const cells = [...document.querySelectorAll('[data-where]')]
    .filter((el) => ['armor', 'dye', 'misc', 'miscDye'].includes(el.dataset.where))
    .filter((el) => {
      const rc = el.getBoundingClientRect();
      return rc.width > 0 && rc.height > 0 && rc.right > 0;
    });
  r.census = cells.map((el) => {
    const rc = el.getBoundingClientRect();
    const ghost = el.querySelector('.sw-slot-ghost');
    let ghostBg = null;
    if (ghost) {
      const m = (ghost.getAttribute('style') ?? '').match(/background:url\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px/);
      ghostBg = m ? { img: m[1], x: +m[2], y: +m[3] } : (ghost.getAttribute('style') ?? '').slice(0, 80);
    }
    return {
      where: el.dataset.where,
      idx: +el.dataset.idx,
      x: Math.round(rc.x), y: Math.round(rc.y), w: Math.round(rc.width), h: Math.round(rc.height),
      ghost: !!ghost, ghostBg,
    };
  });
  // ---- 眼睛（tick）普查：装备页勾选框 3-9 ----
  r.eyes = [...document.querySelectorAll('.vinv-btn')]
    .map((el) => {
      const m = (el.getAttribute('style') ?? '').match(/Inventory_Tick_(On|Off)/);
      const rc = el.getBoundingClientRect();
      return m ? { x: Math.round(rc.x), y: Math.round(rc.y), w: Math.round(rc.width), tex: m[1] } : null;
    })
    .filter(Boolean);
  // 截图锚点：装备页区域（三列+眼列）——只取有限坐标（display:none 盒可为 NaN/0）
  const rects = cells.map((el) => {
    const rc = el.getBoundingClientRect();
    return { x: rc.x, y: rc.y, w: rc.width };
  });
  const fin = rects.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && c.w > 0);
  const xs = fin.map((c) => c.x);
  const ys = fin.map((c) => c.y);
  const minX = Math.min(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  r.region = {
    x: Math.max(0, minX - 60), y: Math.max(0, minY - 40),
    w: Math.min(420, window.innerWidth - Math.max(0, minX - 60)),
    h: Math.min(760, maxY + 90 - Math.max(0, minY - 40)),
  };
  r.sw = window.innerWidth; r.sh = window.innerHeight;
  return r;
});
console.log(JSON.stringify({ layout: out.layout, sw: out.sw, region: out.region, eyes: out.eyes.length }, null, 1));
writeFileSync('/tmp/bj115-census.json', JSON.stringify(out, null, 1));
const { x, y, width, height } = await page.evaluate(({ region }) => {
  const el = document.documentElement;
  return { x: region.x, y: region.y, width: region.w, height: region.h, dpr: el.clientWidth };
}, out);
await page.screenshot({ path: '/tmp/bj115-equip-page.png', clip: { x: out.region.x, y: out.region.y, width: out.region.w, height: out.region.h } });

// ---- ② 眼睛翻转行为（vanilla builder 勾选框 mousedown）+ 回读 ----
const behavior = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, ui = window.__swUI;
  const p = g.player;
  const before = [...p.hideVisibleAccessory];
  const dbg = {
    vinvDisplay: document.querySelector('.sw-vinv')?.style?.display ?? 'none',
    panel: ui.invPanel?.style?.display ?? '?',
    page: ui.vinvPageCurrent ?? '?',
  };
  const eyeBtns = [...document.querySelectorAll('.vinv-btn')].filter((el) => /Inventory_Tick_(On|Off)/.test(el.getAttribute('style') ?? ''));
  // 只取可见眼（display:none 眼 rect=0,y=0 会排最前误中）——杂项页眼在 pageMisc 隐藏态
  const visEyes = eyeBtns.filter((el) => el.getBoundingClientRect().width > 0);
  visEyes.sort((a, b) => a.getBoundingClientRect().y - b.getBoundingClientRect().y);
  const res = { eyes: visEyes.length, total: eyeBtns.length };
  if (eyeBtns.length) {
    const target = visEyes[0];
    const rect = target.getBoundingClientRect();
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    res.hit = hit ? hit.tagName + '.' + String(hit.className ?? '').slice(0, 50) : 'null';
    res.hitIsEye = hit === target;
    res.eyeRect = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    res.eyePE = getComputedStyle(target).pointerEvents;
    res.eyeVisible = target.offsetParent !== null;
    {
      const chain = [];
      let n = target;
      for (let i = 0; i < 8 && n; i++, n = n.parentElement) {
        chain.push(n.tagName + (n.id ? '#' + n.id : '') + '.' + String(n.className ?? '').slice(0, 24)
          + ':d=' + getComputedStyle(n).display);
      }
      res.eyeChain = chain;
    }
    res.stack = document.elementsFromPoint(cx, cy).slice(0, 6).map((n) => n.tagName + '.' + String(n.className ?? '').slice(0, 30));
    if (hit && hit !== target) {
      const chain = [];
      let n = hit;
      for (let i = 0; i < 5 && n; i++, n = n.parentElement) {
        chain.push(n.tagName + '#' + (n.id ?? '') + '.' + String(n.className ?? '').slice(0, 40)
          + ' pe=' + getComputedStyle(n).pointerEvents + ' z=' + getComputedStyle(n).zIndex);
      }
      res.hitChain = chain;
      res.hitHTML = hit.outerHTML.slice(0, 160);
    }
    window.__bj115EyeRect = { x: cx, y: cy };
  }
  res.before = before;
  res.dbg = dbg;
  await wait(200);
  return res;
});
console.log('EYES', JSON.stringify(behavior));
if (behavior.eyes && behavior.hitIsEye) {
  const ex = await page.evaluate(() => window.__bj115EyeRect);
  if (ex) {
    await page.mouse.click(ex.x, ex.y);
    await new Promise((r) => setTimeout(r, 300));
    const after = await page.evaluate(() => {
      const p = window.__swGame.player;
      const ticks = [...document.querySelectorAll('.vinv-btn')]
        .map((el) => ((el.getAttribute('style') ?? '').match(/Inventory_Tick_(On|Off)/) ?? [])[1])
        .filter(Boolean);
      return { hv: [...p.hideVisibleAccessory], ticks };
    });
    console.log('AFTER-CLICK', JSON.stringify(after));
  }
} else {
  console.log('EYE-CLICK-SKIPPED hit=', behavior.hit);
}
await browser.close();
console.log('PROBE-DONE');
