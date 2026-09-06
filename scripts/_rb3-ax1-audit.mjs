// SW-RB3 2026-09-06 红蓝审计探针:SW-AX1 角色创建烘焙管线重做 实机复核。
//   ① look/hair 两页逐格内容(每格 α>16 像素数,抓空槽/错位)
//   ② rows{0,0} 单帧模式 ≡ 整表 frame 0 的管线级像素对拍(PaperDoll 模块双路径直比)
//   ③ DelayedMask 时序:首访立即挂/快烘不闪(<120ms 无遮罩)/慢烘可见
//   ④ blob 生命周期台账(createObjectURL-revokeObjectURL 差值=存活 sheet 数,收敛 ≤2)
//   ⑤ 主线程底线:hair 213 格重烘期 longtask 分布(2026-08-27"不阻塞"不回退)
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: process.env.SW_USERDIR ?? ('/tmp/rb3-ax1-' + (Date.now() % 100000)),
  args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
}
await page.click('[data-act=sp]');
for (let i = 0; i < 20; i++) { if (await page.$('[data-act=new]')) break; await new Promise((r) => setTimeout(r, 250)); }
await page.click('[data-act=new]');
for (let i = 0; i < 20; i++) { if (await page.$('.sw-cc-tab[data-tab=look]')) break; await new Promise((r) => setTimeout(r, 250)); }
await new Promise((r) => setTimeout(r, 300));

// ---- 全局插桩:baking class 时序(body 委托 MutationObserver) + blob 台账 + longtask ----
await page.evaluate(() => {
  const W = window;
  W.__rb3 = { mask: [], blob: { created: 0, revoked: 0, live: [] }, lt: [] };
  const A = W.__rb3;
  const oCreate = W.URL.createObjectURL.bind(W.URL);
  W.URL.createObjectURL = (b) => { const u = oCreate(b); A.blob.created++; A.blob.live.push(u); return u; };
  const oRevoke = W.URL.revokeObjectURL.bind(W.URL);
  W.URL.revokeObjectURL = (u) => { A.blob.revoked++; const i = A.blob.live.indexOf(u); if (i >= 0) A.blob.live.splice(i, 1); return oRevoke(u); };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) A.lt.push({ t: e.startTime, ms: e.duration }); })
      .observe({ entryTypes: ['longtask'] });
  } catch { /* 无 longtask 支持 */ }
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target;
      if (el.classList?.contains('sw-cc-hair') || el.classList?.contains('sw-cc-look')) {
        A.mask.push({ t: performance.now(), on: el.classList.contains('baking'), page: el.classList.contains('sw-cc-hair') ? 'hair' : 'look' });
      }
    }
  });
  mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
});
await new Promise((r) => setTimeout(r, 200));

// ---- ① look 页首开:遮罩立即挂?逐格内容 ----
const lookFirst = await page.evaluate(async () => {
  const t0 = performance.now();
  document.querySelector('.sw-cc-tab[data-tab=look]').click();
  const el = document.querySelector('.sw-cc-look');
  const maskAt = await new Promise((res) => {
    if (el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      if (el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 3000);
  });
  const landed = await new Promise((res) => {
    const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      const t = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
      if (t && (t.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 20000);
  });
  // 逐格内容:格子 sheet 画进离屏 canvas,数 10 格各自 α>16 像素
  const th = document.querySelector('.sw-cc-stylebtn .sw-cc-thumb');
  const m = /url\("([^"]+)"\)/.exec(th.style.backgroundImage);
  const cells = [];
  if (m) {
    const img = new Image();
    img.src = m[1];
    await img.decode().catch(() => {});
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    for (let i = 0; i < 10; i++) {
      let n = 0;
      const x0 = i * 44 + 2, x1 = x0 + 40;
      for (let y = 12; y < 68; y++) for (let x = x0; x < x1; x++) if (d[(y * cv.width + x) * 4 + 3] > 16) n++;
      cells.push(n);
    }
  }
  return { maskAt, landed, cells };
});
console.log('== look 首开 ==');
console.log(`遮罩挂载=${lookFirst.maskAt}ms(首访应≈0 立即) | 首张 sheet 落地=${lookFirst.landed}ms`);
console.log(`10 格非透明像素: ${lookFirst.cells.join(',')}  ${lookFirst.cells.length === 10 && lookFirst.cells.every((n) => n > 100) ? 'OK 全格有内容' : '!! 有空格/缺格'}`);

// ---- ② 快烘不闪:暖缓存随机一击 → baking 全程从未挂? ----
await page.evaluate(() => { window.__rb3.mask.length = 0; });
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('.sw-cc-looklow .sw-cc-small')].find((b) => (b.querySelector('img')?.src ?? '').includes('Randomize'));
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await new Promise((r) => setTimeout(r, 500));
const fastMask = await page.evaluate(() => window.__rb3.mask.slice());
console.log('== look 快烘(暖缓存随机一击) ==');
console.log(`baking 事件=${JSON.stringify(fastMask)}  ${fastMask.length > 0 && fastMask.every((e) => !e.on) ? 'OK 快烘全程无遮罩' : fastMask.length === 0 ? 'OK 全程无 baking 事件' : '!! 快烘闪遮罩'}`);

// ---- ③ look 连击 3 次 → blob 台账(存活收敛 ≤2) ----
await page.evaluate(() => { window.__rb3.blob.created = 0; window.__rb3.blob.revoked = 0; });
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sw-cc-looklow .sw-cc-small')].find((b) => (b.querySelector('img')?.src ?? '').includes('Randomize'));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await new Promise((r) => setTimeout(r, 120));
}
await new Promise((r) => setTimeout(r, 1500));
const blobAfter = await page.evaluate(() => window.__rb3.blob);
console.log('== blob 台账(look 连击 3) ==');
console.log(`created=${blobAfter.created} revoked=${blobAfter.revoked} 存活=${blobAfter.live.length}  ${blobAfter.live.length <= 2 ? 'OK 收敛(≤hair+look 两张)' : '!! 泄漏'}`);

// ---- ④ hair 页首开(冷):遮罩 + longtask 分布 ----
await page.evaluate(() => { window.__rb3.mask.length = 0; window.__rb3.lt.length = 0; });
const hairFirst = await page.evaluate(async () => {
  const t0 = performance.now();
  document.querySelector('.sw-cc-tab[data-tab=hair]').click();
  const el = document.querySelector('.sw-cc-hair');
  const maskAt = await new Promise((res) => {
    if (el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      if (el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 3000);
  });
  const landed = await new Promise((res) => {
    const th = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
    if (th && (th.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) return res(performance.now() - t0);
    const mo = new MutationObserver(() => {
      const t = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
      if (t && (t.style.backgroundImage || '').includes('url') && !el.classList.contains('baking')) { res(performance.now() - t0); mo.disconnect(); }
    });
    mo.observe(el, { subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
    setTimeout(() => { mo.disconnect(); res(-1); }, 30000);
  });
  const lt = window.__rb3.lt.slice();
  return { maskAt, landed, ltMax: lt.length ? Math.max(...lt.map((e) => e.ms)) : 0, ltOver50: lt.filter((e) => e.ms > 50).length };
});
console.log('== hair 首开(213 格冷烘) ==');
console.log(`遮罩挂载=${hairFirst.maskAt}ms(首访应≈0 立即) | 落地=${hairFirst.landed}ms | longtask max=${hairFirst.ltMax.toFixed(1)}ms >50ms 次数=${hairFirst.ltOver50}`);

// ---- ⑤ hair 213 格逐格内容 ----
const hairCells = await page.evaluate(async () => {
  const th = document.querySelector('.sw-cc-hairbtn .sw-cc-thumb');
  const m = /url\("([^"]+)"\)/.exec(th.style.backgroundImage);
  if (!m) return null;
  const img = new Image();
  img.src = m[1];
  await img.decode().catch(() => {});
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  const empty = [];
  for (let i = 0; i < 213; i++) {
    const cx = (i % 10) * 44, cy = Math.floor(i / 10) * 44;
    let n = 0;
    for (let y = cy; y < cy + 44; y++) for (let x = cx + 2; x < cx + 42; x++) if (d[(y * cv.width + x) * 4 + 3] > 16) n++;
    if (n < 20) empty.push(i);
  }
  return { w: cv.width, h: cv.height, empty };
});
console.log('== hair 213 格逐格内容 ==');
if (!hairCells) console.log('!! sheet 未挂上');
else console.log(`sheet=${hairCells.w}x${hairCells.h} 空格(<20px)=${hairCells.empty.length ? hairCells.empty.join(',') : '无'}  ${hairCells.empty.length === 0 ? 'OK' : '!!'}`);

// ---- ⑥ 管线级对拍:rows{0,0} ≡ 整表 frame 0(同 appearance 双路径像素直比) ----
const parity = await page.evaluate(async () => {
  const { compositePaperDoll, dollFrame, IDLE_FRAME } = await import('/src/player/PaperDoll.ts');
  const { UITextures } = await import('/src/vui/assets/UITextures.ts');
  const names = [];
  for (const s of [0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 10, 11, 12]) names.push(`Player_0_${s}.png`);
  names.push('Player_Hair_9.png', 'Player_HairAlt_9.png');
  await UITextures.ensure(names);
  const a = {
    name: 'rb3', hair: 8, skinVariant: 0, difficulty: 1,
    hairColor: { r: 215, g: 90, b: 108 }, skinColor: { r: 255, g: 125, b: 125 },
    eyeColor: { r: 120, g: 90, b: 80 }, shirtColor: { r: 170, g: 85, b: 60 },
    undershirtColor: { r: 200, g: 170, b: 150 }, pantsColor: { r: 180, g: 140, b: 110 },
    shoeColor: { r: 150, g: 100, b: 70 },
  };
  const full = compositePaperDoll(a);
  if (!full) return { err: 'full composite null(贴图未就绪)' };
  const rowsDoll = compositePaperDoll(a, undefined, { rows: { body: 0, legs: 0 } });
  if (!rowsDoll) return { err: 'rows composite null' };
  const f = dollFrame(full, IDLE_FRAME);
  const cv = document.createElement('canvas');
  cv.width = 40; cv.height = 56;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingEnabled = false;
  g.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, 0, 0, 40, 56);
  const dFull = g.getImageData(0, 0, 40, 56).data;
  const g2 = cv.getContext('2d');
  g2.clearRect(0, 0, 40, 56);
  g2.drawImage(rowsDoll, 0, 0, 40, 56, 0, 0, 40, 56);
  const dRows = g.getImageData(0, 0, 40, 56).data;
  let diff = 0, diffPx = 0, opaque = 0;
  for (let i = 0; i < dFull.length; i += 4) {
    if (dRows[i + 3] > 16) opaque++;
    let same = true;
    for (let k = 0; k < 4; k++) if (Math.abs(dFull[i + k] - dRows[i + k]) > 1) same = false;
    if (!same) { diff++; if (dFull[i + 3] > 16 || dRows[i + 3] > 16) diffPx++; }
  }
  return { opaque, diffChannels: diff, diffPx };
});
console.log('== rows{0,0} ≡ 整表 frame 0 管线对拍(40×56) ==');
console.log(`不透明像素=${parity.opaque} 通道差=${parity.diffChannels ?? parity.err} 像素差=${parity.diffPx ?? ''}  ${parity.diffPx === 0 ? 'OK 像素级一致' : '!! 有差异'}`);

// 截图存证(hair 页当前态)
await page.screenshot({ path: '/tmp/rb3-ax1-hair.png' });
await browser.close();
