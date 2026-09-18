// 取证三：状态矩阵 × 时间采样 × 逐行右缘剖面——"多出一截"能否在任何可达态复现。
// 每态量：offsetW/H、bg 固有尺寸（stale-bg 特征=bg.naturalWidth≠ceil(offsetW)）、
// bg 逐行最右不透明 x（中段行≠220=非圆角凸/咬）、最长可见段宽、delta。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5245';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

// 预解 bg dataURL 逐行右缘（供页面内直接调用）
await page.evaluate(() => {
  window.__bgProfile = () => {
    const tt = window.__swUI.tooltip;
    const m = /url\("data:image\/png;base64,([^"]+)"\)/.exec(tt.style.background || '');
    if (!m) return null;
    const img = new Image();
    img.src = 'data:image/png;base64,' + m[1];
    const c = document.createElement('canvas');
    return new Promise((res) => {
      img.onload = () => {
        c.width = img.width; c.height = img.height;
        const x = c.getContext('2d');
        x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        const prof = [];
        for (let y = 0; y < c.height; y++) {
          let rx = -1;
          for (let xx = c.width - 1; xx >= 0; xx--) {
            if (d[(y * c.width + xx) * 4 + 3] > 10) { rx = xx; break; }
          }
          prof.push(rx);
        }
        // 中段行（去顶/底 10px 圆角带）的右缘唯一值
        const mid = [...new Set(prof.slice(10, -10))];
        res({ w: img.width, h: img.height, midRight: mid, maxRight: Math.max(...prof) });
      };
    });
  };
  window.__segProfile = () => {
    const tt = window.__swUI.tooltip;
    const lines = tt.querySelector('.sw-tooltip-lines');
    const out = { offsetW: tt.offsetWidth, offsetH: tt.offsetHeight, segs: [] };
    if (!lines) return out;
    const range = document.createRange();
    let seg = [];
    const flush = () => {
      if (!seg.length) return;
      let w = 0, text = '';
      for (const n of seg) {
        range.selectNodeContents(n);
        w = Math.max(w, range.getBoundingClientRect().width);
        text += n.textContent ?? '';
      }
      out.segs.push({ w: +w.toFixed(2), text: text.slice(0, 36) });
      seg = [];
    };
    for (const n of lines.childNodes) {
      if (n.nodeType === 3) { seg.push(n); continue; }
      if (n.nodeType === 1) { if (n.tagName === 'BR') { flush(); continue; } seg.push(n); }
    }
    flush();
    const cs = getComputedStyle(tt);
    out.padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    out.maxSeg = out.segs.reduce((a, b) => (b.w > a.w ? b : a), { text: '', w: 0 });
    out.delta = +(out.offsetW - out.padX - out.maxSeg.w).toFixed(2);
    out.text = (tt.textContent ?? '').replace(/\s+/g, ' ').slice(0, 90);
    return out;
  };
});

const hoverSlot = async (sel) => {
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    return true;
  }, sel);
  if (!r) return null;
  await new Promise((r2) => setTimeout(r2, 250));
  return page.evaluate(async () => {
    const segs = window.__segProfile();
    const bg = await window.__bgProfile();
    return { segs, bg };
  });
};

const results = {};
const setup = async (fn) => { await page.evaluate(fn); await new Promise((r) => setTimeout(r, 250)); };

// S1 用户原态：armor3 共享源 → L1 空槽悬停（共享自配装1）
await setup(() => {
  const g = window.__swGame, ui = window.__swUI;
  const M = window.__M || null;
});
// 模块导入一次性缓存
await page.evaluate(async () => {
  window.__M = await import('/src/data/items.ts');
});
await page.evaluate(() => {
  const g = window.__swGame;
  const M = window.__M;
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const ram = idOf(5465);
  const inv = g.player.inv;
  window.__ramId = ram;
  inv.armor[3] = { id: ram, stack: 1, favorited: true };
  inv.trySwitchingLoadout(1, g.player.hideVisibleAccessory);
  window.__swUI.openInventory();
  window.__swUI.refreshAllNow?.();
});
results.S1_sharedFrom = await hoverSlot('.sw-slot[data-where="armor"][data-idx="3"]');

// S2 同槽但回 L0（本件在场+收藏=与其他配装共享行）
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.inv.trySwitchingLoadout(0, g.player.hideVisibleAccessory);
  window.__swUI.refreshAllNow?.();
});
results.S2_ownFavorited = await hoverSlot('.sw-slot[data-where="armor"][data-idx="3"]');

// S3 带词缀（+1%伤害 69）未收藏 → hint 行态
await page.evaluate(() => {
  const g = window.__swGame;
  const inv = g.player.inv;
  inv.armor[3] = { id: window.__ramId, stack: 1, prefix: 69 };
  window.__swUI.refreshAllNow?.();
});
results.S3_prefixed = await hoverSlot('.sw-slot[data-where="armor"][data-idx="3"]');

// S4 小窗口钳制右缘
await page.setViewport({ width: 700, height: 862 });
await new Promise((r) => setTimeout(r, 200));
results.S4_clamped = await hoverSlot('.sw-slot[data-where="armor"][data-idx="3"]');
await page.setViewport({ width: 1200, height: 862 });
await new Promise((r) => setTimeout(r, 200));

// S5 时间采样：stale-bg 检测（hover 后 0/0.8s/1.6s 三拍）
results.S5_time = [];
for (const wait of [0, 800, 1600]) {
  await page.evaluate(() => {
    const el = document.querySelector('.sw-slot[data-where="armor"][data-idx="3"]');
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  });
  if (wait) await new Promise((r) => setTimeout(r, wait));
  results.S5_time.push(await page.evaluate(async () => {
    const tt = window.__swUI.tooltip;
    const bg = await window.__bgProfile();
    return { offsetW: tt.offsetWidth, bgW: bg?.w, mismatch: bg ? Math.abs(bg.w - tt.offsetWidth) : -1 };
  }));
}

// S6 杂项槽（misc0 钩爪位）对照
await page.evaluate(() => {
  const g = window.__swGame;
  const idOf = (vid) => window.__M.ITEM_BY_KEY[window.__M.VANILLA_ITEM_KEY_BY_ID[vid]];
  g.player.inv.miscEquips[0] = { id: idOf(975), stack: 1 };   // 钉鞋
  window.__swUI.refreshAllNow?.();
});
results.S6_misc = await hoverSlot('.sw-slot[data-where="misc"][data-idx="0"]');

console.log(JSON.stringify(results, null, 1));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
