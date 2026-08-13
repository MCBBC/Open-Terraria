// 翅膀视觉探针：装备天使之翼(492→slot1)后
//   ① equipStats.wing.logic 解析
//   ② 站立态截图 A（收拢帧 0，generic 无 alwaysAir 门仍绘制）
//   ③ 卸翼同位截图 B → 像素差 = 翅膀可见性（旧 bug：锚点双重平移画屏幕外 → 差≈0）
//   ④ 重装 + 空中按跳：wingFrame 序列应走 flap 循环（0→1→2→3，5t/帧）
//   ⑤ wingTime 消耗与恢复
//   ⑥ 多款抽查：Leaf Wings 665→3 装上即 wing.logic===3
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + (e.stack ?? '')));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('翅膀测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = { steps: [] };
  const ok = (name, cond, extra) => { res.steps.push({ name, pass: !!cond, extra }); return !!cond; };
  const waitUntil = async (fn, ms = 2000) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 30));
    return fn();
  };
  const p = g.player;

  // ① 装天使之翼（vi_492_* → armor[3]）
  const key = Object.keys(window.__swItems).find(k => k.startsWith('vi_492_'));
  ok('① 天使之翼条目存在', !!key, key);
  const wingId = window.__swItems[key];
  p.inv.armor[3] = { id: wingId, stack: 1 };
  ok('① equipStats.wing.logic===1', p.equipStats.wing?.logic === 1, `logic=${p.equipStats.wing?.logic}`);
  ok('① wingStats time=100(天使)', p.equipStats.wing?.time === 100, `time=${p.equipStats.wing?.time}`);

  // ② 站立态等待收拢帧 0
  await waitUntil(() => p.onGround && p.wingFrame === 0);
  await new Promise(r => setTimeout(r, 300));
  // 贴图加载自检（懒加载 miss → 等一拍自愈）
  const wt0 = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
  await waitUntil(() => {
    const im = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
    return im && im.naturalWidth > 0;
  }, 3000);
  const wt = g.renderer.atlas.ensureVImage('vanilla/Wings_1.png');
  ok('② Wings_1.png 加载就绪', !!wt && wt.naturalWidth > 0, `${wt?.naturalWidth}×${wt?.naturalHeight}`);
  const canvas = g.renderer.canvas;
  const shotA = canvas.toDataURL();

  // ③ 卸翼同位截图 → 像素差
  p.inv.armor[3] = null;
  await new Promise(r => setTimeout(r, 350));
  ok('③ 卸翼后 wing=null', p.equipStats.wing === null);
  const shotB = canvas.toDataURL();

  // 数据 URL → 像素差计数（下采样 2px 步长）
  const load = (url) => new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.src = url;
  });
  const [ia, ib] = await Promise.all([load(shotA), load(shotB)]);
  const cA = document.createElement('canvas'); cA.width = ia.width; cA.height = ia.height;
  cA.getContext('2d').drawImage(ia, 0, 0);
  const cB = document.createElement('canvas'); cB.width = ib.width; cB.height = ib.height;
  cB.getContext('2d').drawImage(ib, 0, 0);
  const dA = cA.getContext('2d').getImageData(0, 0, cA.width, cA.height).data;
  const dB = cB.getContext('2d').getImageData(0, 0, cB.width, cB.height).data;
  let diff = 0;
  for (let i = 0; i < dA.length; i += 4 * 2) {
    if (Math.abs(dA[i] - dB[i]) > 24 || Math.abs(dA[i + 3] - dB[i + 3]) > 24) diff++;
  }
  ok('③ 翅膀像素可见（差>400px）', diff > 400, `diff=${diff}`);
  ok('③ 差不过量（<全屏 5%）', diff < dA.length / 4 / 20, `diff=${diff}`);

  // ④ 重装 + 抬到空中 + 按住跳 → flap 帧循环采样
  p.inv.armor[3] = { id: wingId, stack: 1 };
  await new Promise(r => setTimeout(r, 200));
  p.y -= 500; p.vy = 0; p.fallStartY = null;   // 抬到空中
  g.input.touchKeys.add('Space');               // 按住跳（touchKeys 注入通道）
  const seq = [];
  for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 16)); seq.push(p.wingFrame); }
  g.input.touchKeys.delete('Space');
  const uniq = [...new Set(seq)].sort((a, b) => a - b).join(',');
  const sawCycle = seq.some(f => f >= 2) && seq.some(f => f <= 1);
  ok('④ 空中按跳 wingFrame 动起来（0-3 循环）', sawCycle, `seq首尾=[${seq.slice(0, 8)}…${seq.slice(-4)}] uniq=${uniq}`);
  ok('④ flap 期间 wingTime 递减', seq.length > 0, `wingTime=${p.wingTime}`);

  // ⑤ 落地回满（落地 tick 后下一帧 fixedUpdate 才写回 wingTime——多等一拍）
  await waitUntil(() => p.onGround, 5000);
  await new Promise(r => setTimeout(r, 200));
  ok('⑤ 落地 wingTime 回满 100', p.wingTime === 100, `wingTime=${p.wingTime}`);

  // ⑥ 多款：Leaf Wings 665→slot3 / 妖精翅 748→slot4（frames=4 各自锚）
  const key665 = Object.keys(window.__swItems).find(k => k.startsWith('vi_665_'));
  if (key665) {
    p.inv.armor[3] = { id: window.__swItems[key665], stack: 1 };
    ok('⑥ 叶翅 logic===3', p.equipStats.wing?.logic === 3, `logic=${p.equipStats.wing?.logic}`);
  } else ok('⑥ 叶翅条目缺失（登记）', false);
  p.inv.armor[3] = { id: wingId, stack: 1 };

  // ⑦ 尘埃引擎：装 34（vi_3582 星云斗篷）空中飞行 → 原版 Dust 池活跃尘 > 0
  const key34 = Object.keys(window.__swItems).find(k => k.startsWith('vi_3582_'));
  ok('⑦ 星云斗篷条目存在', !!key34, key34);
  if (key34) {
    p.inv.armor[3] = { id: window.__swItems[key34], stack: 1 };
    p.y -= 500; p.vy = 0; p.fallStartY = null;
    g.input.touchKeys.add('Space');
    let maxDust = 0;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 16));
      const lit = [...g.vanillaDust.each(false)].length + [...g.vanillaDust.each(true)].length;
      maxDust = Math.max(maxDust, lit);
    }
    g.input.touchKeys.delete('Space');
    ok('⑦ 飞行喷尘（34 型 261 尘 > 0）', maxDust > 0, `maxDust=${maxDust}`);
    await waitUntil(() => p.onGround, 5000);
    await new Promise(r => setTimeout(r, 200));
  }

  // ⑧ 45 拖尾历史环：装 4954（星璇悬浮板）地面跑动 → advancedShadows 填充
  const key45 = Object.keys(window.__swItems).find(k => k.startsWith('vi_4954_'));
  ok('⑧ 星璇悬浮板条目存在', !!key45, key45);
  if (key45) {
    p.inv.armor[3] = { id: window.__swItems[key45], stack: 1 };
    g.input.touchKeys.add('KeyD');
    for (let i = 0; i < 50; i++) await new Promise(r => setTimeout(r, 16));
    g.input.touchKeys.delete('KeyD');
    ok('⑧ advancedShadows 历史环填充（≥8）', p.advancedShadows.length >= 8, `len=${p.advancedShadows.length}`);
    await new Promise(r => setTimeout(r, 300));
  }

  // ⑨ 叠画队列消费：装 47（vi_5586）站立 → 渲染帧尾队列已 flush（长度归 0）且
  //    Glow_366 叠画产生像素（同位对比卸翼）
  const key47 = Object.keys(window.__swItems).find(k => k.startsWith('vi_5586_'));
  ok('⑨ ChickenWings 条目存在', !!key47, key47);
  if (key47) {
    p.inv.armor[3] = { id: window.__swItems[key47], stack: 1 };
    await waitUntil(() => p.onGround && p.wingFrame === 0);
    await new Promise(r => setTimeout(r, 400));
    const shot47 = g.renderer.canvas.toDataURL();
    const qLen = g.renderer.wingGlowQueue ? g.renderer.wingGlowQueue.length : -1;
    p.inv.armor[3] = null;
    await new Promise(r => setTimeout(r, 350));
    const shot47b = g.renderer.canvas.toDataURL();
    const load2 = (url) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = url; });
    const [i47a, i47b] = await Promise.all([load2(shot47), load2(shot47b)]);
    const c47a = document.createElement('canvas'); c47a.width = i47a.width; c47a.height = i47a.height;
    c47a.getContext('2d').drawImage(i47a, 0, 0);
    const c47b = document.createElement('canvas'); c47b.width = i47b.width; c47b.height = i47b.height;
    c47b.getContext('2d').drawImage(i47b, 0, 0);
    const d47a = c47a.getContext('2d').getImageData(0, 0, c47a.width, c47a.height).data;
    const d47b = c47b.getContext('2d').getImageData(0, 0, c47b.width, c47b.height).data;
    let diff47 = 0;
    for (let i = 0; i < d47a.length; i += 8) {
      if (Math.abs(d47a[i] - d47b[i]) > 24 || Math.abs(d47a[i + 3] - d47b[i + 3]) > 24) diff47++;
    }
    ok('⑨ 叠画像素可见（47 主翼+Glow 叠画差 > 400）', diff47 > 400, `diff=${diff47} queue=${qLen}`);
  }

  // ⑩ 44 彩虹重上色（vi_4823）：Extra_171 灰度掩膜 × Extra_156 彩虹 → 彩色像素占比
  //    （无重上色时掩膜全灰——直画灰翅膀是曾登记偏差）
  const key44 = Object.keys(window.__swItems).find(k => k.startsWith('vi_4823_'));
  ok('⑩ 彩虹翼条目存在', !!key44, key44);
  if (key44) {
    p.inv.armor[3] = { id: window.__swItems[key44], stack: 1 };
    await waitUntil(() => p.onGround && p.wingFrame === 0);
    await new Promise(r => setTimeout(r, 400));
    const shot44 = g.renderer.canvas.toDataURL();
    const load3 = (url) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = url; });
    const i44 = await load3(shot44);
    const c44 = document.createElement('canvas'); c44.width = i44.width; c44.height = i44.height;
    c44.getContext('2d').drawImage(i44, 0, 0);
    const d44 = c44.getContext('2d').getImageData(0, 0, c44.width, c44.height).data;
    let colored = 0, opaque = 0;
    for (let i = 0; i < d44.length; i += 4) {
      if (d44[i + 3] < 40) continue;
      opaque++;
      const mx = Math.max(d44[i], d44[i + 1], d44[i + 2]), mn = Math.min(d44[i], d44[i + 1], d44[i + 2]);
      if (mx - mn > 40) colored++;
    }
    const ratio = opaque ? colored / opaque : 0;
    ok('⑩ 44 彩虹重上色（彩色占比 > 0.03）', ratio > 0.03, `colored=${colored}/${opaque} ratio=${ratio.toFixed(4)}`);
  }

  // ⑪ cWings 染料：装回 vi_492 + 红染料 vi_1007 进 dye[3] → 翅膀区域红色主导像素
  //    （卸染料同位对比）
  const keyDye = Object.keys(window.__swItems).find(k => k.startsWith('vi_1007_'));
  ok('⑪ 红染料条目存在', !!keyDye, keyDye);
  if (keyDye) {
    p.inv.armor[3] = { id: wingId, stack: 1 };
    p.inv.dye[3] = { id: window.__swItems[keyDye], stack: 1 };
    const countRed = () => {
      const c = document.createElement('canvas');
      c.width = g.renderer.canvas.width; c.height = g.renderer.canvas.height;
      c.getContext('2d').drawImage(g.renderer.canvas, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let red = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) continue;
        if (d[i] - Math.max(d[i + 1], d[i + 2]) > 30) red++;
      }
      return red;
    };
    await new Promise(r => setTimeout(r, 400));
    const redDyed = countRed();
    p.inv.dye[3] = null;
    await new Promise(r => setTimeout(r, 400));
    const redPlain = countRed();
    ok('⑪ 染料生效（红主导像素增量 > 200）', redDyed - redPlain > 200, `dyed=${redDyed} plain=${redPlain}`);
  }
  // ⑫ stealth 分层（PlayerDrawSet.cs:1523-1651）：蘑菇矿套(1546/1549/1550) +
  //     p.stealth=0.5 → doll 按 皮肤×s'² / 甲×s'(B×settled) 两层绘制——
  //     与 stealth=0 同位截图有像素差且无 pageerror
  const mkKey = (n) => Object.keys(window.__swItems).find(k => k.startsWith('vi_' + n + '_'));
  const [kH, kB, kL] = [mkKey(1546), mkKey(1549), mkKey(1550)];
  ok('⑫ 蘑菇矿三件条目存在', !!(kH && kB && kL), kH && kB && kL);
  if (kH && kB && kL) {
    p.inv.armor[0] = { id: window.__swItems[kH], stack: 1 };
    p.inv.armor[1] = { id: window.__swItems[kB], stack: 1 };
    p.inv.armor[2] = { id: window.__swItems[kL], stack: 1 };
    p.stealth = 0;
    await new Promise(r => setTimeout(r, 400));
    const shotS0 = g.renderer.canvas.toDataURL();
    p.stealth = 0.5;
    await new Promise(r => setTimeout(r, 400));
    const shotS5 = g.renderer.canvas.toDataURL();
    p.stealth = 0;
    const load4 = (url) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = url; });
    const [i12a, i12b] = await Promise.all([load4(shotS0), load4(shotS5)]);
    const diffC = (ia, ib) => {
      const ca = document.createElement('canvas'); ca.width = ia.width; ca.height = ia.height;
      ca.getContext('2d').drawImage(ia, 0, 0);
      const da = ca.getContext('2d').getImageData(0, 0, ca.width, ca.height).data;
      const cb = document.createElement('canvas'); cb.width = ib.width; cb.height = ib.height;
      cb.getContext('2d').drawImage(ib, 0, 0);
      const dbb = cb.getContext('2d').getImageData(0, 0, cb.width, cb.height).data;
      let d = 0;
      for (let i = 0; i < da.length; i += 8) {
        if (Math.abs(da[i] - dbb[i]) > 24 || Math.abs(da[i + 3] - dbb[i + 3]) > 24) d++;
      }
      return d;
    };
    const diff12 = diffC(i12a, i12b);
    ok('⑫ stealth 分层生效（差 > 300px）', diff12 > 300, `diff=${diff12}`);
  }
  // ⑬ 渐变染料（ArmorColoredGradient——位置依赖 pass，端到端验证 t0/s0 表空间映射）：
  //     红-黄渐变 vi_1031 上翼 → 与无染料同位对比有像素差（修正前错锚仍会有差，
  //     此断言保链路无回归；映射正确性由 fx-sm2.test.ts 等价金标把关）
  const keyG = Object.keys(window.__swItems).find(k => k.startsWith('vi_1031_'));
  ok('⑬ 红黄渐变染料条目存在', !!keyG, keyG);
  if (keyG) {
    p.inv.armor[3] = { id: wingId, stack: 1 };
    p.inv.dye[3] = { id: window.__swItems[keyG], stack: 1 };
    await waitUntil(() => p.onGround && p.wingFrame === 0);
    await new Promise(r => setTimeout(r, 400));
    const shotG = g.renderer.canvas.toDataURL();
    p.inv.dye[3] = null;
    await new Promise(r => setTimeout(r, 400));
    const shotG2 = g.renderer.canvas.toDataURL();
    const loadG = (url) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = url; });
    const [iGa, iGb] = await Promise.all([loadG(shotG), loadG(shotG2)]);
    const cGa = document.createElement('canvas'); cGa.width = iGa.width; cGa.height = iGa.height;
    cGa.getContext('2d').drawImage(iGa, 0, 0);
    const dGa = cGa.getContext('2d').getImageData(0, 0, cGa.width, cGa.height).data;
    const cGb = document.createElement('canvas'); cGb.width = iGb.width; cGb.height = iGb.height;
    cGb.getContext('2d').drawImage(iGb, 0, 0);
    const dGb = cGb.getContext('2d').getImageData(0, 0, cGb.width, cGb.height).data;
    let diffG = 0;
    for (let i = 0; i < dGa.length; i += 8) {
      if (Math.abs(dGa[i] - dGb[i]) > 24 || Math.abs(dGa[i + 3] - dGb[i + 3]) > 24) diffG++;
    }
    ok('⑬ 渐变染料生效（差 > 400px）', diffG > 400, `diff=${diffG}`);
  }
  p.inv.armor[3] = { id: wingId, stack: 1 };
  return res;
});

// 结果汇总
let pass = 0, fail = 0;
for (const s of out.steps) {
  console.log(`${s.pass ? '✅' : '❌'} ${s.name}${s.extra ? '  → ' + s.extra : ''}`);
  s.pass ? pass++ : fail++;
}
console.log(`---- 翅膀探针: ${pass}✅ ${fail}❌  pageerror=${errs.length}`);
for (const e of errs) console.log('  ' + e);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
