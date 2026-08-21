// 一次性探针:Boss 血条数值文本位图字体(Item_Stack=FontAssets.ItemStack)渲染验证
//  方法:期望值全部由源贴图+字形表推导(非目测阈值)——
//  1) 字体纹理经 sprites/vanilla/Item_Stack_p0.png 就绪(READY 门)
//  2) 逐字形 1:1:drawItemStackBorderString 白色本体层 ink bbox === 源贴图字形
//     rect 内不透明像素 bbox(premultiplied 白 = r=g=b=a 分类)
//  3) DrawHealthText 整链锚点(drawBigProgressBar):三段串的 ink bbox ===
//     由 kerning 游走 + 源 ink 内缩推导的期望 bbox(cur 右对齐 center-5 /
//     slash 居中 / max 左对齐 center+5,行盒顶 = 锚点 y-12)
//  4) 四向黑边:黑 ink bbox 各轴比白 ink bbox 阔 ≥4px(±2 四向)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?probe=bossbar-font-' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });

const result = await page.evaluate(async () => {
  const out = {};
  const CTF = await import('/src/render/CombatTextFont.ts');
  const BB = await import('/src/render/BossBars.ts');
  for (let i = 0; i < 100 && !CTF.itemStackFontReady(); i++) await new Promise((r) => setTimeout(r, 50));
  out.fontReady = CTF.itemStackFontReady();
  if (!out.fontReady) return out;

  // 源贴图 + 字形表
  const srcImg = new Image();
  srcImg.src = '/sprites/vanilla/Item_Stack_p0.png';
  await new Promise((res, rej) => { srcImg.onload = res; srcImg.onerror = rej; });
  const srcC = document.createElement('canvas');
  srcC.width = srcImg.width; srcC.height = srcImg.height;
  const srcCtx = srcC.getContext('2d');
  srcCtx.drawImage(srcImg, 0, 0);
  const fontJson = await (await fetch('/src/data/combat-font.json')).json();
  const F = fontJson.Item_Stack;

  /** 源字形 rect 内实心像素扫描(α≥254,与渲染侧白/黑分类同阈值;字形 alpha
   *  近二值,软边/黑边混合像素双方一致排除):count + ink bbox(rect 内相对坐标) */
  function srcScan(g) {
    const d = srcCtx.getImageData(g.x, g.y, g.width, g.height).data;
    let n = 0; const bb = { minx: 999, maxx: -1, miny: 999, maxy: -1 };
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      if (d[(y * g.width + x) * 4 + 3] >= 254) {
        n++; bb.minx = Math.min(bb.minx, x); bb.maxx = Math.max(bb.maxx, x);
        bb.miny = Math.min(bb.miny, y); bb.maxy = Math.max(bb.maxy, y);
      }
    }
    return { n, ...bb };
  }
  const glyphIdx = new Map(F.characters.map((c, k) => [c, k]));
  const glyphScan = F.glyphs.map((g) => srcScan(g));

  // ---- 2) 逐字形:白体 ink bbox 对账(premultiplied 白: r=g=b≈a 且 a≥250;
  //      期望 = 锚点 + kerning.l + 源 ink 内缩——渲染侧 pen 游走含 l) ----
  out.perGlyph = [];
  for (let k = 0; k < F.characters.length; k++) {
    const ch = String.fromCharCode(F.characters[k]);
    const c = document.createElement('canvas');
    c.width = 260; c.height = 60;
    const cx = c.getContext('2d');
    CTF.drawItemStackBorderString(cx, ch, 130, 30, 0, 0);
    const d = cx.getImageData(0, 0, 260, 60).data;
    let white = 0, black = 0;
    const wb = { minx: 999, maxx: -1, miny: 999, maxy: -1 };
    const bb = { minx: 999, maxx: -1, miny: 999, maxy: -1 };
    for (let y = 0; y < 60; y++) for (let x = 0; x < 260; x++) {
      const i = (y * 260 + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 254) continue;
      const isWhite = Math.abs(r - a) <= 3 && Math.abs(g - a) <= 3 && Math.abs(b - a) <= 3;
      const isBlack = r < 30 && g < 30 && b < 30;
      if (isWhite) { white++; wb.minx = Math.min(wb.minx, x); wb.maxx = Math.max(wb.maxx, x); wb.miny = Math.min(wb.miny, y); wb.maxy = Math.max(wb.maxy, y); }
      if (isBlack) { black++; bb.minx = Math.min(bb.minx, x); bb.maxx = Math.max(bb.maxx, x); bb.miny = Math.min(bb.miny, y); bb.maxy = Math.max(bb.maxy, y); }
    }
    const s = glyphScan[k];
    const l = F.kerning[k][0];
    out.perGlyph.push({
      ch, srcN: s.n, white, black,
      // 期望白体 ink bbox = 锚点(130,30) + kerning.l + 源 ink 内缩
      expWhite: { minx: 130 + l + s.minx, maxx: 130 + l + s.maxx, miny: 30 + s.miny, maxy: 30 + s.maxy },
      gotWhite: wb, gotBlack: bb,
    });
  }

  // ---- 3) drawBigProgressBar 整链:三段串 ink bbox 对账 ----
  // 期望推导:kerning 游走 pen(逐字形 Math.round 同渲染侧);ink = 源内缩
  function expectedInk(text, runLeft, runTop) {
    let pen = runLeft;
    const bb = { minx: 999, maxx: -1, miny: 999, maxy: -1 };
    for (const ch of text) {
      const k = glyphIdx.get(ch.charCodeAt(0));
      if (k === undefined) { pen += 8; continue; }
      const [l, w, r] = F.kerning[k];
      pen += l;
      const gx = Math.round(pen);
      const s = glyphScan[k];
      bb.minx = Math.min(bb.minx, gx + s.minx); bb.maxx = Math.max(bb.maxx, gx + s.maxx);
      bb.miny = Math.min(bb.miny, runTop + s.miny); bb.maxy = Math.max(bb.maxy, runTop + s.maxy);
      pen += w + r + F.spacing;
    }
    return bb;
  }
  const VW = 1200, VH = 300;
  const c = document.createElement('canvas');
  c.width = VW; c.height = VH;
  const cx = c.getContext('2d');
  BB.drawBigProgressBar(cx, { bar: null, head: null }, VW, VH, { life: 1234, lifeMax: 45678, headIndex: -1 });
  const d = cx.getImageData(0, 0, VW, VH).data;
  const rect = { x: Math.round(VW / 2 - 228), y: Math.round(VH - 50 - 11), w: 456, h: 22 };
  const center = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2 + 1;         // area.Center + (0,1)
  const runTop = Math.round(cy - F.lineSpacing / 2);   // origin.y = 行盒高/2 = 12
  // 白像素三桶(分类同逐字形段:α≥254 premultiplied 白)。分界取 center±4 的
  // 纯黑间隙带:cur ink 右缘 ≤center-5、slash ink ∈[center-3,center+3]、
  // max ink 左缘 ≥center+5(l=0+ink 内缩 0 时恰为 center+5)——±6 分界会把
  // max 首字形 ink 首列切进 slash 桶造成假偏差
  const buckets = { cur: [], slash: [], max: [] };
  let blackN = 0;
  for (let y = rect.y - 10; y < rect.y + rect.h + 10; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * VW + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 254) continue;
      const isWhite = Math.abs(r - a) <= 3 && Math.abs(g - a) <= 3 && Math.abs(b - a) <= 3;
      if (r < 30 && g < 30 && b < 30) blackN++;
      if (!isWhite) continue;
      const p = x < center - 4 ? buckets.cur : x > center + 4 ? buckets.max : buckets.slash;
      p.push({ x, y });
    }
  }
  const bbox = (pts) => pts.length ? {
    n: pts.length,
    minx: Math.min(...pts.map((p) => p.x)), maxx: Math.max(...pts.map((p) => p.x)),
    miny: Math.min(...pts.map((p) => p.y)), maxy: Math.max(...pts.map((p) => p.y)),
  } : { n: 0 };
  // 期望:cur 右对齐 center-5(origin.x=w) / max 左对齐 center+5(origin.x=0) /
  // slash 居中(origin.x=w/2,7px 宽 → 3.5 半宽取整经 expectedInk 的 round)
  const mCur = CTF.itemStackMeasure('1234'), mMax = CTF.itemStackMeasure('45678'), mSl = CTF.itemStackMeasure('/');
  out.bar = {
    rect, center, runTop,
    got: { cur: bbox(buckets.cur), slash: bbox(buckets.slash), max: bbox(buckets.max) },
    exp: {
      cur: expectedInk('1234', center - 5 - mCur.w, runTop),
      slash: expectedInk('/', center - mSl.w / 2, runTop),
      max: expectedInk('45678', center + 5, runTop),
    },
    blackN,
  };
  return out;
}).catch((e) => ({ errors: [String(e)] }));

await page.screenshot({ path: '/tmp/sw-bossbar-font.png' });
await browser.close();

// ---- 断言 ----
const fail = [];
const ok = [];
if (result.errors?.length) { console.log('FAIL: ' + result.errors.join('; ')); process.exit(1); }
if (result.fontReady !== true) { console.log('FAIL: 字体未就绪'); process.exit(1); }
ok.push('Item_Stack 字体就绪');

const eqBox = (a, b) => a.minx === b.minx && a.maxx === b.maxx && a.miny === b.miny && a.maxy === b.maxy;
const boxStr = (b) => b ? `[${b.minx},${b.miny}..${b.maxx},${b.maxy}]` : '∅';
for (const g of result.perGlyph) {
  if (!eqBox(g.gotWhite, g.expWhite)) fail.push(`'${g.ch}' 白体 ink ${boxStr(g.gotWhite)} ≠ 期望 ${boxStr(g.expWhite)}`);
  const gw = g.gotWhite.maxx - g.gotWhite.minx, gb = g.gotBlack.maxx - g.gotBlack.minx;
  const gh = g.gotWhite.maxy - g.gotWhite.miny, gbh = g.gotBlack.maxy - g.gotBlack.miny;
  if (gb < gw + 2 || gbh < gh + 2) fail.push(`'${g.ch}' 黑边框 ${gb}×${gbh} 未比白体 ${gw}×${gh} 各轴阔 ≥2px`);
  if (g.black < g.srcN) fail.push(`'${g.ch}' 黑边像素 ${g.black} < 源实心 ${g.srcN}(四向边缺失)`);
}
ok.push(`11 字形形状/位置 1:1: ${result.perGlyph.every((g) => eqBox(g.gotWhite, g.expWhite)) ? 'PASS' : 'FAIL'}`);

const b = result.bar;
for (const seg of ['cur', 'slash', 'max']) {
  if (!eqBox(b.got[seg], b.exp[seg])) fail.push(`整链 ${seg} ink ${boxStr(b.got[seg])} ≠ 期望 ${boxStr(b.exp[seg])}`);
}
ok.push(`整链三段锚点(cur 右对齐/slash 居中/max 左对齐+行盒顶): ${['cur', 'slash', 'max'].every((s) => eqBox(b.got[s], b.exp[s])) ? 'PASS' : 'FAIL'}`);

console.log('==== PROBE RESULT ====');
console.log(`bar rect=${boxStr({ minx: b.rect.x, miny: b.rect.y, maxx: b.rect.x + b.rect.w, maxy: b.rect.y + b.rect.h })} runTop=${b.runTop} blackN=${b.blackN}`);
for (const seg of ['cur', 'slash', 'max']) console.log(`${seg}: got ${boxStr(b.got[seg])} exp ${boxStr(b.exp[seg])}`);
if (fail.length) {
  console.log('FAIL:\n  ' + fail.join('\n  '));
  process.exit(1);
}
console.log('PASS: ' + ok.join(' / '));
