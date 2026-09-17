// ★FX57 信息栏文本「离屏 12px 烘焙+最近邻放大」探针(2026-09-16 用户 Windows 实报:
// 信息栏灰字在背景越亮处越模糊,Mac 较轻——像素字体非整数倍字号 fillText 必然
// 抗锯齿,Windows DirectWrite 灰度 AA 与 macOS CoreText 差异放大;灰字(100,100,100)
// 低对比+黑描边贴软边=糊)。
// 断言:
//  ① webfont 就绪(12px/14px 像素字体真实解析);
//  ② 实机信息行不再走 fillText(烘焙路径生效)且出现 5 参 canvas 源 drawImage(剪影+染色位图);
//  ③ 悬停行标签(drawMouseTextLayer)同样不再走 fillText;
//  ④ 亮背景(纯白)模拟 A/B:同信息行集,旧直绘(fillText 14px+四向±2,FX57 前逐字节
//     复刻) vs 新烘焙(真实 InfoAccsLayer.draw 路由)——逐行「调色板外像素数」
//     (软边/fringe 计数):新路径 ≈0(覆盖率 0/1+NN 二值),旧路径显著>0(AA 灰阶
//     过渡);覆盖 白字/灰字(grayed 100,100,100)/压暗行(×0.34)三态;
//  ⑤ 旧直绘 vs 新烘焙像素 diff 记录(一致率/均值|Δ|/最大|Δ|);
//  ⑥ 截图:/tmp/fx57-bake.png(亮背景 A/B 合成:上=旧直绘 下=新烘焙)、
//     /tmp/fx57-bake-live.png(实机信息列亮天空域)、/tmp/fx57-bake-live-zoom.png(行区放大)、
//     /tmp/fx57-bake-label-zoom.png(悬停标签)。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 120000 });
  await page.keyboard.type('FX57烘焙');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 120000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 120000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 600000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// ① webfont 就绪(烘焙门 fontReady 的实机前提)
const fontState = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    bake12: document.fonts.check('12px "Fusion Pixel 12px"'),
    draw14: document.fonts.check('14px "Fusion Pixel 12px"'),
  };
});
check('webfont 就绪:12px/14px "Fusion Pixel 12px" 均命中', fontState.bake12 && fontState.draw14, JSON.stringify(fontState));

// ② fillText/drawImage 全局录制(5 参 canvas 源 drawImage = 烘焙位图特征)
await page.evaluate(() => {
  const log = [];
  const origF = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
    if (log.length > 6000) log.splice(0, 3000);
    log.push({ s: String(s), font: this.font, x, y });
    return origF.call(this, s, x, y);
  };
  const origD = CanvasRenderingContext2D.prototype.drawImage;
  let n5 = 0;
  CanvasRenderingContext2D.prototype.drawImage = function (img, a, b, c, d, ...rest) {
    if (a !== undefined && d !== undefined && rest.length === 0 && img instanceof HTMLCanvasElement) n5++;
    return origD.call(this, img, a, b, c, d, ...rest);
  };
  window.__fx57 = { log, n5: () => n5 };
});

// 入包信息族:常规(表/深度/罗盘/DPS/秒表)+ 灰字行源(雷达/金属探测器/生命体分析仪)
// 域:__swVANILLA_ITEM_KEY_BY_ID(原版 vid→键) → __swItems(键→内部 id)(main.ts enterGameHooks)
await page.evaluate(() => {
  const g = window.__swGame;
  const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
  const it = window.__swItems ?? {};
  const want = [17, 18, 393, 3119, 3099, 3084, 3102, 3118];
  want.forEach((vid, i) => {
    const k = vk[vid];
    if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
  });
});
await new Promise((r) => setTimeout(r, 1200));

const rows = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    n: g.renderer.infoAccs.state.rows.length,
    texts: g.renderer.infoAccs.state.rows.map((r) => r.text),
  };
});
check('信息行渲染中(八件饰品)', rows.n >= 5, JSON.stringify({ n: rows.n, texts: rows.texts }));

// ② 实机:信息行文本零 fillText(烘焙路径)+ 5 参 canvas drawImage 出现
await page.evaluate(() => { window.__fx57.log.length = 0; });
await new Promise((r) => setTimeout(r, 200));
const live = await page.evaluate((texts) => {
  const log = window.__fx57.log;
  const rowFills = log.filter((f) => texts.includes(f.s));
  return { rowFillCount: rowFills.length, n5: window.__fx57.n5() };
}, rows.texts);
check('实机信息行走烘焙:行文本 fillText = 0(旧直绘已退役)', live.rowFillCount === 0, JSON.stringify(live));
check('实机出现烘焙位图 drawImage(5 参 canvas 源)> 0', live.n5 > 0, `n5=${live.n5}`);

// ③ 悬停行标签(drawMouseTextLayer)同管线
const speedIdx = rows.texts.findIndex((t) => /速度|mph|mi\/h/i.test(t));
check('速度行存在', speedIdx >= 0, JSON.stringify(rows.texts));
if (speedIdx >= 0) {
  const rects = await page.evaluate(() => window.__swGame.renderer.infoAccs.state.iconRects.map((r) => ({ x: r.x, y: r.y })));
  const rect = rects[speedIdx];
  await page.mouse.move(rect.x + 5, rect.y + 5);
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => { window.__fx57.log.length = 0; });
  await new Promise((r) => setTimeout(r, 200));
  const label = await page.evaluate(() => {
    const g = window.__swGame;
    const text = g.player.cursorItemIconText;
    return { text, fills: window.__fx57.log.filter((f) => f.s === text).length };
  });
  check('悬停行标签走烘焙:标签 fillText = 0', label.text !== '' && label.fills === 0, JSON.stringify(label));
  await page.screenshot({ path: '/tmp/fx57-bake-label-zoom.png', clip: {
    x: Math.max(0, rect.x - 40), y: Math.max(0, rect.y - 30), width: 320, height: 150,
  } });
  await page.mouse.move(rect.x - 300, rect.y + 260);
  await new Promise((r) => setTimeout(r, 300));
}

// ④⑤ 亮背景(白底 255)A/B:旧直绘复刻(FX57 前逐字节同形) vs 真实 InfoAccsLayer.draw
// hoveredRow=1 → 行 2 压暗 ×0.34(:46629-46632 i>num2 && i<num2+2);grayed 行=灰字(100,100,100)
const ab = await page.evaluate(() => {
  const g = window.__swGame;
  // H=800 ⇒ pitch 22(矮屏 <650 为 20,InfoAccsLayer :129)——与实机 800p 同构,
  // 行带度量按 22 对齐
  const W = 460, H = 800, X = W - 280, Y = -32, pitch = 22;
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
  const oldCv = mk(), newCv = mk();
  const infoCtx = {
    gates: { accWatch: 3, accDepthMeter: 3, accCompass: 3, accFishFinder: false, accWeatherRadio: true,
      accCalendar: true, accThirdEye: true, accJarOfSouls: false, accCritterGuide: true, accStopwatch: true,
      accOreFinder: true, accDreamCatcher: false },
    mainTime: 27000, dayTime: true,
    weather: { storming: false, maxRaining: 0, cloudBGActive: 0, numClouds: 0, windSpeedCurrent: 2, sandstorm: false, globalTimeSec: 0 },
    moonPhase: 0, bloodMoon: false, eclipse: false,
    fishingText: null, oreText: null, rareText: null, rareVid: null,
    enemyCount: 0, killText: null, dps: -1, mph: 42,
    centerX: 2100, bottomY: 331 * 16, worldSurface: 331, rockLevel: 427, maxTilesX: 4200, maxTilesY: 1200,
  };
  const colorOf = (r) => r.gold ? '#FFE745' : r.grayed ? '#646464' : '#e8e4f0';
  // 新:真实渲染层(路由 MouseTextBake 烘焙管线)——先铺白底再 draw
  const nctx = newCv.getContext('2d');
  nctx.fillStyle = '#fff'; nctx.fillRect(0, 0, W, H);
  g.renderer.infoAccs.draw(nctx, W, H, infoCtx, [], false, false, 1, 0, 0, () => {});
  const rowsN = g.renderer.infoAccs.state.rows.map((r) => ({ text: r.text, grayed: !!r.grayed, gold: !!r.gold }));
  // 旧:FX57 前直绘逐字节复刻(同 rows/几何/215 钳制/压暗;InfoAccsLayer.draw 旧字形块)
  const octx = oldCv.getContext('2d');
  octx.fillStyle = '#fff'; octx.fillRect(0, 0, W, H);
  octx.imageSmoothingEnabled = false;
  octx.textAlign = 'left'; octx.textBaseline = 'middle';
  octx.font = '14px "Fusion Pixel 12px", monospace';
  rowsN.forEach((r, i) => {
    const ty = Y + 74 + pitch * i + 48;
    const m = octx.measureText(r.text);
    const w = m.width;
    let scaleX = 1; if (w > 215) scaleX = 215 / w;
    let scaleY = 1; if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
    const dim = i === 2 ? 0.34 : 1;
    octx.save();
    octx.translate(X + 20, ty);
    octx.scale(scaleX, scaleY);
    octx.globalAlpha = dim;
    for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { octx.fillStyle = '#000'; octx.fillText(r.text, ox, oy); }
    octx.fillStyle = colorOf(r);
    octx.fillText(r.text, 0, 0);
    octx.restore();
  });
  // 度量:每行带 [ty-11,ty+11)×[200,455) 的调色板外像素数(软边/fringe)
  // 调色板 = {白底, 描边黑(α 暗行合成 over 白), 字形(α=1 直出色 / 暗行 over 黑剪影
  //  = color×dim——旧直绘与新烘焙同式:彩色本体都叠在黑描边拷贝之上)}
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const overWhite = (c, a) => c.map((v) => Math.round(v * a + 255 * (1 - a)));
  const overBlack = (c, a) => c.map((v) => Math.round(v * a));
  const bandFringe = (cv, ty, pal, samples) => {
    // 带 ±9(墨盒 ±7+环 1,收进 22 行距内,防邻行下降部/环尖溢入计 fringe)
    const d = cv.getContext('2d').getImageData(200, ty - 9, 255, 18).data;
    let fringe = 0;
    for (let p = 0; p < d.length; p += 4) {
      let best = 1e9;
      for (const q of pal) {
        const dist = Math.abs(d[p] - q[0]) + Math.abs(d[p + 1] - q[1]) + Math.abs(d[p + 2] - q[2]);
        if (dist < best) best = dist;
      }
      if (best > 36) {
        fringe++;
        if (samples && samples.length < 6) {
          const pi = p / 4;
          samples.push([(pi % 255), Math.floor(pi / 255), d[p], d[p + 1], d[p + 2]]);
        }
      }
    }
    return fringe;
  };
  const perRow = rowsN.map((r, i) => {
    const ty = Y + 74 + pitch * i + 48;
    const dim = i === 2 ? 0.34 : 1;
    const tc = hex2rgb(colorOf(r));
    // 字形合成底:彩字叠在黑描边拷贝上——α=1 直出色;暗行 backdrop=暗化剪影
    // round(0×dim+255×(1−dim)),合成=round(c×dim+backdrop×(1−dim))(新旧行为同式)
    const dimBack = Math.round(255 * (1 - dim));
    const glyph = dim < 1 ? tc.map((v) => Math.round(v * dim + dimBack * (1 - dim))) : tc;
    const pal = [[255, 255, 255], overWhite([0, 0, 0], dim), glyph];
    const sOld = [], sNeu = [];
    const fr = {
      i, text: r.text.slice(0, 14), grayed: r.grayed, dim: dim < 1,
      old: bandFringe(oldCv, ty, pal, sOld), neu: bandFringe(newCv, ty, pal, sNeu),
      sOld, sNeu,
    };
    return fr;
  });
  // 旧 vs 新整域像素 diff(文本列)
  const a = oldCv.getContext('2d').getImageData(195, 60, 265, 230).data;
  const b = newCv.getContext('2d').getImageData(195, 60, 265, 230).data;
  let same = 0, n2 = 0, sum = 0, max = 0;
  for (let p = 0; p < a.length; p += 4) {
    n2++;
    const d = Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);
    if (d === 0) same++; else { sum += d; if (d > max) max = d; }
  }
  window.__fx57ab = { oldCv, newCv };
  return {
    rows: rowsN, perRow,
    diff: { samePct: +(100 * same / n2).toFixed(2), meanDiff: +(sum / (n2 - same) || 0).toFixed(2), maxDiff: max },
  };
});
check('A/B 行集非空且含灰字行', ab.rows.length >= 5 && ab.rows.some((r) => r.grayed), JSON.stringify(ab.rows.map((r) => ({ t: r.text.slice(0, 10), g: r.grayed }))));
const oldTotal = ab.perRow.reduce((s, r) => s + r.old, 0);
const newTotal = ab.perRow.reduce((s, r) => s + r.neu, 0);
console.log(`[fx57] 逐行软边像素(旧→新): ${ab.perRow.map((r) => `#${r.i}${r.grayed ? '(灰)' : ''}${r.dim ? '(暗)' : ''} ${r.old}→${r.neu}${r.neu > 0 ? ' 样本' + JSON.stringify(r.sNeu) : ''}`).join(', ')}`);
console.log(`[fx57] 软边像素合计: 旧直绘=${oldTotal} 新烘焙=${newTotal}`);
console.log(`[fx57] 旧vs新像素 diff: 一致率=${ab.diff.samePct}% 差异像素均值|Δ|=${ab.diff.meanDiff} 最大|Δ|=${ab.diff.maxDiff}`);
check('新烘焙软边 ≈ 0(原生网格 0/1 覆盖率+NN 二值)', newTotal <= 5, `new=${newTotal}`);
check('旧直绘软边显著(AA 灰阶过渡实证)', oldTotal >= Math.max(20, newTotal * 3), `old=${oldTotal}`);

// ⑥ 截图:A/B 合成(上=旧直绘 下=新烘焙,文本列裁剪)+ 实机信息列
await page.evaluate(() => {
  const { oldCv, newCv } = window.__fx57ab;
  const disp = document.createElement('canvas');
  disp.id = 'fx57-ab';
  disp.width = 300; disp.height = 580;
  const c = disp.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 300, 580);
  c.fillStyle = '#333'; c.font = '12px monospace'; c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText('OLD direct fillText 14px (AA soft, pre-FX57)', 8, 6);
  c.drawImage(oldCv, 195, 60, 265, 230, 8, 22, 265, 230);
  c.fillText('NEW bake 12px + nearest x1.17 (FX57)', 8, 268);
  c.drawImage(newCv, 195, 60, 265, 230, 8, 284, 265, 230);
  disp.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#fff;';
  document.body.appendChild(disp);
});
await page.screenshot({ path: '/tmp/fx57-bake.png', clip: { x: 0, y: 0, width: 300, height: 560 } });
await page.evaluate(() => document.getElementById('fx57-ab')?.remove());
await page.screenshot({ path: '/tmp/fx57-bake-live.png', clip: { x: 1280 - 420, y: 0, width: 420, height: 420 } });
const zoomAt = await page.evaluate(() => {
  const r = window.__swGame.renderer.infoAccs.state.iconRects[0];
  return r ? { x: r.x, y: r.y } : { x: 1000, y: 42 };
});
await page.screenshot({ path: '/tmp/fx57-bake-live-zoom.png', clip: {
  x: Math.max(0, zoomAt.x - 30), y: Math.max(0, zoomAt.y - 24), width: 340, height: 260,
} });

check('无页面错误', errors.filter((e) => !e.includes('[worldGen]')).length === 0, errors.join('|').slice(0, 200));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
