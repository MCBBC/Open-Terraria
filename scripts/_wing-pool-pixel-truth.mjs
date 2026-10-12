// ★翼池化混帧判决实验（2026-10-12 用户二报「clearRect 后仍扑动+间隔不一」）:
//   页内直驱 Renderer.wingTexSource——双帧切片交替×200 调,对每个键记录返回画布
//   像素指纹。判据:同键指纹必须恒定;错位=池/缓存真 bug 实锤;恒定=鬼影在别处。
//   同时钩原型记录真实消费端的 (键,画布身份) 流。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await sleep(1500);

const verdict = await page.evaluate(async () => {
  const r = window.__swGame?.renderer;
  if (!r || typeof r.wingTexSource !== 'function') return { ok: false, why: 'no-renderer' };
  const atlas = r.atlas;
  let img = null;
  for (let i = 0; i < 40; i++) {   // 懒加载窗:轮询至解码完成
    img = atlas?.ensureVImage?.('vanilla/Wings_3.png');
    if (img && img.width > 0) break;
    await new Promise((res) => setTimeout(res, 250));
  }
  if (!img || !(img.width > 0)) return { ok: false, why: 'no-wing-sheet' };
  const fh = Math.floor(img.height / 4);
  const tw = img.width;
  // 走真实染料面(dyeApplyOf 一件真实翼染料;没有则 tint 面)
  let dye = null;
  try {
    const { dyeApplyOf } = await import('/src/data/vanillaDyes.ts');
    dye = dyeApplyOf(3551);   // Justin 染料(任意有表项的)
  } catch { /* tint 面兜底 */ }
  const tint = dye ? null : [1, 0.8, 0.6];
  // 帧 A(sy=0)/帧 B(sy=fh) 交替 200 调;每调指纹(α>0 像素质心+count)
  const fp = (cv) => {
    const cx = cv.getContext('2d');
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let n = 0, sx = 0, sy = 0, hash = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 8) {
        n++; sx += ((i >> 2) % cv.width); sy += ((i >> 2) / cv.width) | 0;
        hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0;
      }
    }
    return { n, hash, cx: n ? +(sx / n).toFixed(1) : 0, cy: n ? +(sy / n).toFixed(1) : 0 };
  };
  const perKey = new Map();   // key → Set(指纹串)
  let flips = 0;
  for (let i = 0; i < 200; i++) {
    const sy = (i % 2) * fh;                    // A/B 交替
    const cv = r.wingTexSource(img, 0, sy, tw, fh, dye, tint);
    if (!cv) return { ok: false, why: 'null-return' };
    const f = fp(cv);
    const key = `${sy}`;
    if (!perKey.has(key)) perKey.set(key, new Map());
    const m = perKey.get(key);
    const sig = `${f.n}|${f.hash}|${f.cx},${f.cy}`;
    if (!m.has(sig)) {
      m.set(sig, (m.get(sig) ?? 0) + 1);
      if (m.size > 1) flips++;
    } else m.set(sig, m.get(sig) + 1);
  }
  const detail = {};
  for (const [k, m] of perKey) detail[`frame@sy${k}`] = [...m.entries()].map(([s, n]) => ({ sig: s.slice(0, 40), n }));
  // 同键多指纹=内容漂移(池/缓存 bug);单指纹=键-内容稳定
  const driftKeys = Object.values(detail).filter((a) => a.length > 1).length;
  return { ok: true, flips, driftKeys, detail, dyeUsed: dye ? dye.tech : 'tint-path', fh, tw };
});
console.log('VERDICT', JSON.stringify(verdict, null, 1));
await browser.close();
