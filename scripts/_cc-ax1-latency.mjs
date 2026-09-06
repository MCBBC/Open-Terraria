// SW-AX1 2026-09-06 角色创建"随机"延迟定谳探针:
//   look 页 10 格 randomize 点击→缩略图换图的全链分段计时 + hair 页首开/重烘计时。
//   证据项:双烘(toDataURL 计数)、ensure miss、setTimeout(0) 4ms 钳制、longtask、
//   点击 handler 同步耗时、合成段(ensure resolve→首张 sheet toDataURL)、编码耗时。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: process.env.SW_USERDIR ?? ('/tmp/cc-ax1-' + (Date.now() % 100000)),
  args: ['--no-proxy-server'],   // 禁 throttling 系参数(headless rAF 节流坑)
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

// 等揭幕(splash 移除+菜单可点)
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
}

await page.click('[data-act=sp]');
for (let i = 0; i < 20; i++) { if (await page.$('[data-act=new]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('[data-act=new]');
for (let i = 0; i < 20; i++) { if (await page.$('.sw-cc-tab[data-tab=look]')) break; await new Promise((r) => setTimeout(r, 250)); }

// ---- 页内插桩(与应用共享同一模块实例:vite 同 URL 去重) ----
await page.evaluate(() => {
  const W = window;
  W.__ax1 = { tdu: [], tob: [], ensure: [], st0: [], lt: [], bib: 0, bibMs: 0 };
  const A = W.__ax1;
  // toDataURL / toBlob 计时(带画布尺寸;440×80=look sheet,440×968=hair sheet)
  const oTDU = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL = function (...a) {
    const t = performance.now();
    const r = oTDU.apply(this, a);
    A.tdu.push({ t, ms: performance.now() - t, w: this.width, h: this.height });
    return r;
  };
  const oTB = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    const t = performance.now();
    return oTB.call(this, (b) => {
      A.tob.push({ t, ms: performance.now() - t, w: this.width, h: this.height });
      cb(b);
    }, ...a);
  };
  // ensureUiBatch(共享实例原型补丁):miss 数+耗时
  return import('/src/assets/SpriteAtlas.ts').then(({ SpriteAtlas }) => {
    const oEUB = SpriteAtlas.prototype.ensureUiBatch;
    SpriteAtlas.prototype.ensureUiBatch = function (names, c) {
      const keys = names.map((n) => (n.endsWith('.png') ? n : n + '.png'));
      const miss = keys.filter((k) => !this.uiimages.has(this.uiFiles[k] ?? k));
      const t = performance.now();
      const rec = { t, n: names.length, miss: miss.length, missNames: miss.slice(0, 6), ms: -1 };
      A.ensure.push(rec);
      const p = oEUB.call(this, names, c);
      p.then(() => { rec.ms = performance.now() - t; });
      return p;
    };
    // createImageBitmap 全局补丁(模块内裸引用走 window)
    const oCIB = W.createImageBitmap.bind(W);
    W.createImageBitmap = (...a) => {
      const t = performance.now();
      A.bib++;
      return oCIB(...a).then((r) => { A.bibMs += performance.now() - t; return r; },
        (e) => { A.bibMs += performance.now() - t; throw e; });
    };
    // setTimeout(0) 实际间隔(嵌套钳制取证)
    const oST = W.setTimeout.bind(W);
    W.setTimeout = (fn, d = 0, ...rest) => {
      if (d === 0) {
        const ts = performance.now();
        return oST(() => { A.st0.push({ sched: ts, fired: performance.now() }); fn(); }, 0, ...rest);
      }
      return oST(fn, d, ...rest);
    };
    // longtask
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) A.lt.push({ t: e.startTime, ms: e.duration }); })
        .observe({ entryTypes: ['longtask'] });
    } catch { /* 无 longtask 支持 */ }
  });
});
await new Promise((r) => setTimeout(r, 300));

// 预热:进 look 页等首张 sheet 挂上(冷缓存路径一并记录)
const warm = await page.evaluate(async () => {
  const tab = document.querySelector('.sw-cc-tab[data-tab=look]');
  const t0 = performance.now();
  tab.click();
  const firstBg = async () => {
    for (let i = 0; i < 600; i++) {
      const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
      if (th && (th.style.backgroundImage || '').includes('url')) return performance.now() - t0;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return -1;
  };
  const ms = await firstBg();
  return { ms, tdu: window.__ax1.tdu.slice(), ensure: window.__ax1.ensure.slice(), st0: window.__ax1.st0.length };
});
console.log('== 预热(look 页首开,含冷载) ==');
console.log(`首张 sheet 上屏 ${warm.ms.toFixed(0)}ms | setTimeout(0) 次数=${warm.st0}`);
for (const e of warm.ensure) console.log(`  ensure: n=${e.n} miss=${e.miss} [${e.missNames.join(',')}] ${e.ms.toFixed(1)}ms`);
for (const d of warm.tdu.slice(0, 12)) console.log(`  toDataURL ${d.w}x${d.h} ${d.ms.toFixed(2)}ms @+${d.t.toFixed(0)}`);

// ---- look 页连点随机 6 次,逐次分段 ----
const clicks = [];
for (let i = 0; i < 6; i++) {
  const r = await page.evaluate(async () => {
    const A = window.__ax1;
    const mark = { tduLen: A.tdu.length, tobLen: A.tob.length, ensureLen: A.ensure.length, st0Len: A.st0.length, bib: A.bib };
    const btn = [...document.querySelectorAll('.sw-cc-looklow .sw-cc-small')].find((b) => (b.querySelector('img')?.src ?? '').includes('Randomize'));
    const thumb = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    const before = thumb?.style.backgroundImage ?? '';
    const t0 = performance.now();
    // 同步派发=handler 内含 buildContent+bake 同步前缀
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const handlerMs = performance.now() - t0;
    // MutationObserver 抓 style 换图时刻 + 下一 rAF(渲染帧)
    const changed = await new Promise((res) => {
      const mo = new MutationObserver(() => {
        const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
        if (th && th.style.backgroundImage !== before) {
          const tc = performance.now();
          requestAnimationFrame(() => res({ tc, raf: performance.now() }));
          mo.disconnect();
        }
      });
      mo.observe(document.querySelector('.sw-cc-styles'), { subtree: true, attributes: true, attributeFilter: ['style'] });
      setTimeout(() => { mo.disconnect(); res(null); }, 5000);
    });
    await new Promise((r) => setTimeout(r, 350));   // 让双烘第二波/图标重烘全落账
    // 逐格内容验证:把格子引用的 sheet 图画进离屏 canvas,数 10 格各自 α>16 像素
    const filled = await (async () => {
      const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
      const m = /url\("?([^")]+)"?\)/.exec(th?.style.backgroundImage ?? '');
      if (!m) return -1;
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = m[1]; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let cells = 0;
      for (let i = 0; i < 10; i++) {
        let on = 0;
        for (let y = 0; y < 80; y += 2) {
          for (let x = 0; x < 44; x += 2) {
            if (d[(y * c.width + i * 44 + x) * 4 + 3] > 16) on++;
          }
        }
        if (on > 10) cells++;
      }
      return cells;
    })();
    const seg = (arr, len) => arr.slice(len);
    return {
      handlerMs,
      bgMs: changed ? changed.tc - t0 : -1,
      rafMs: changed ? changed.raf - t0 : -1,
      cellsFilled: filled,
      tdu: seg(A.tdu, mark.tduLen).map((d) => ({ w: d.w, h: d.h, ms: +d.ms.toFixed(2), t: +(d.t - t0).toFixed(1) })),
      tob: seg(A.tob, mark.tobLen).map((d) => ({ w: d.w, h: d.h, ms: +d.ms.toFixed(2), t: +(d.t - t0).toFixed(1) })),
      ensure: seg(A.ensure, mark.ensureLen).map((e) => ({ n: e.n, miss: e.miss, ms: +e.ms.toFixed(1), t: +(e.t - t0).toFixed(1), missNames: e.missNames })),
      st0: seg(A.st0, mark.st0Len).map((s) => +(s.fired - s.sched).toFixed(2)),
      bib: A.bib - mark.bib,
      lt: A.lt.length ? A.lt.filter((e) => e.t >= t0 - 5).map((e) => ({ at: +(e.t - t0).toFixed(0), ms: +e.ms.toFixed(1) })) : [],
    };
  });
  clicks.push(r);
  console.log(`\n== look 随机 #${i + 1} == handler=${r.handlerMs.toFixed(1)}ms 缩略图换图=${r.bgMs.toFixed(1)}ms 下一渲染帧=${r.rafMs.toFixed(1)}ms 有内容格=${r.cellsFilled}/10 bib=${r.bib}`);
  for (const e of r.ensure) console.log(`   ensure n=${e.n} miss=${e.miss} ${e.ms}ms @+${e.t} [${e.missNames.join(',')}]`);
  for (const d of r.tdu) console.log(`   toDataURL ${d.w}x${d.h} ${d.ms}ms @+${d.t}`);
  for (const d of r.tob) console.log(`   toBlob ${d.w}x${d.h} ${d.ms}ms @+${d.t}`);
  if (r.st0.length) console.log(`   setTimeout(0) 实际间隔: ${r.st0.join(', ')}ms`);
  if (r.lt.length) console.log(`   longtask: ${r.lt.map((e) => `@+${e.at}:${e.ms}ms`).join(' ')}`);
}

// ---- hair 页:重烘(随机后)计时 + 转圈遮罩时序 ----
const hair = await page.evaluate(async () => {
  const A = window.__ax1;
  const mark = { tduLen: A.tdu.length, tobLen: A.tob.length, st0Len: A.st0.length };
  const t0 = performance.now();
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  const maskOn = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    if (!el) return res(-1);
    if (el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      if (el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 8000);
  });
  // 等换图(baking 撤除=applySheetUrls)
  const maskOff = await new Promise((res) => {
    const el = document.querySelector('.sw-cc-hair');
    const mo = new MutationObserver(() => {
      if (!el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 20000);
  });
  const tdu = A.tdu.slice(mark.tduLen).map((d) => ({ w: d.w, h: d.h, ms: +d.ms.toFixed(2), t: +(d.t - t0).toFixed(1) }));
  const tob = (A.tob ?? []).slice(mark.tobLen ?? 0).map((d) => ({ w: d.w, h: d.h, ms: +d.ms.toFixed(2), t: +(d.t - t0).toFixed(1) }));
  const st0 = A.st0.slice(mark.st0Len).map((s) => +(s.fired - s.sched).toFixed(2));
  // hair sheet 内容抽查:前 30 格 α>16 像素(单帧行模式正确性)
  const filled = await (async () => {
    const th = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
    const m = /url\("?([^")]+)"?\)/.exec(th?.style.backgroundImage ?? '');
    if (!m) return -1;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = m[1]; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let cells = 0;
    for (let i = 0; i < 30; i++) {
      const cx = (i % 10) * 44, cy = Math.floor(i / 10) * 44;
      let on = 0;
      for (let y = 0; y < 44; y += 2) {
        for (let x = 0; x < 44; x += 2) {
          if (d[((cy + y) * c.width + cx + x) * 4 + 3] > 16) on++;
        }
      }
      if (on > 10) cells++;
    }
    return cells;
  })();
  return { maskOn, maskOff, filled, tdu, tob, st0, lt: A.lt.filter((e) => e.t >= t0 - 5).map((e) => ({ at: +(e.t - t0).toFixed(0), ms: +e.ms.toFixed(1) })) };
});
console.log(`\n== hair 页(随机后重烘) == 遮罩挂=${hair.maskOn?.toFixed(1)}ms 摘=${hair.maskOff?.toFixed(1)}ms 前30格有内容=${hair.filled} longtask=[${hair.lt.map((e) => `@+${e.at}:${e.ms}ms`).join(' ')}]`);
for (const d of hair.tdu) console.log(`   toDataURL ${d.w}x${d.h} ${d.ms}ms @+${d.t}`);
for (const d of hair.tob) console.log(`   toBlob ${d.w}x${d.h} ${d.ms}ms @+${d.t}`);
if (hair.st0.length) console.log(`   setTimeout(0) 实际间隔(${hair.st0.length}次): 前 12 个= ${hair.st0.slice(0, 12).join(', ')}ms`);
const clampAvg = hair.st0.length ? hair.st0.reduce((a, b) => a + b, 0) / hair.st0.length : 0;
console.log(`   setTimeout(0) 平均实际间隔=${clampAvg.toFixed(2)}ms × ${hair.st0.length} 次 = 纯让出开销 ${(clampAvg * hair.st0.length).toFixed(0)}ms`);

await browser.close();
process.exit(0);
