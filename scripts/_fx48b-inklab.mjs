// 墨级几何实验:白 cnt(现役 .cnt 近似) vs 绿候选位(原版 (3,32)·num 公式/含 DOM 行盒补偿)
// 只读实验页,零源码改动。SW_ORIGIN=http://localhost:5249 node tools/run-diag.mjs scripts/_fx48b-inklab.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5249';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 900, height: 700 } });
const page = await browser.newPage();
await page.setContent(`<!doctype html><meta charset="utf8">
<style>
  body{background:#3a3a5e;margin:0;padding:20px;font-family:"Fusion Pixel 12px","Microsoft YaHei",sans-serif}
  .slot{position:relative;width:52px;height:52px;transform:scale(0.7);transform-origin:top left;
    background:#0a3a4a;outline:1px solid #000; margin:60px 40px; display:inline-block; vertical-align:top}
  .slot .cnt{position:absolute;left:4px;bottom:0;font-size:11px;font-weight:bold;color:#fff;text-shadow:1px 1px 0 #000}
  .green{position:absolute;color:rgb(144,238,144);text-shadow:1px 1px 0 #000;pointer-events:none}
  .lab{position:absolute;left:60px;top:-34px;color:#ff0;font-size:14px;width:220px}
</style>
<div class="slot" id="a"><span class="cnt">10</span><div class="lab">a: formula 32 (3,32)num</div></div>
<div class="slot" id="b"><span class="cnt">10</span><div class="lab">b: 32+2.5 asc-comp</div></div>
<div class="slot" id="c"><span class="cnt">10</span><div class="lab">c: 36.4 slot-bottom</div></div>
<div class="slot" id="d"><span class="cnt">10</span><div class="lab">d: 40 vanilla-ink-est</div></div>
<script>
  // 绿数渲染器:top = 32·num + δ,字号 0.8·num 换算(≈10px),num=1
  const put = (id, topPx, fs) => {
    const s = document.getElementById(id);
    const g = document.createElement('div');
    g.className = 'green'; g.textContent = '300';
    g.style.cssText = 'left:' + 3 + 'px; top:' + topPx + 'px; font-size:' + fs + 'px; line-height:normal;';
    s.appendChild(g);
  };
  put('a', 32, 10);
  put('b', 34.5, 10);
  put('c', 36.4, 10);
  put('d', 40, 10);
  // 量测:白 span 墨盒(用 Range bbox)与绿 div bbox
  window.__measure = () => {
    const out = {};
    for (const id of ['a','b','c','d']) {
      const s = document.getElementById(id);
      const span = s.querySelector('.cnt');
      const green = s.querySelector('.green');
      const rg = document.createRange(); rg.selectNodeContents(span);
      const wb = rg.getBoundingClientRect();
      const rg2 = document.createRange(); rg2.selectNodeContents(green);
      const gb = rg2.getBoundingClientRect();
      const sb = s.getBoundingClientRect();
      const rel = (b) => ({ t: +(b.y - sb.y).toFixed(1), b: +(b.bottom - sb.y).toFixed(1), l: +(b.x - sb.x).toFixed(1) });
      const w = rel(wb), g0 = rel(gb);
      out[id] = { white: w, green: g0, inkGap: +(g0.t - w.b).toFixed(1) };
    }
    return out;
  };
</script>`);
await page.waitForSelector('#a .green');
const m = await page.evaluate('window.__measure()');
console.log(JSON.stringify(m, null, 1));
// 放大截图(3x)供目检
const el = await page.$('body');
await page.evaluate(() => { document.body.style.zoom = '2.2'; });
await new Promise((r) => setTimeout(r, 120));
await page.screenshot({ path: '/tmp/fx48b-inklab.png' });
await browser.close();
