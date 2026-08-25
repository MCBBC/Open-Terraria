// 发光层接线核查：MOUNT_DATA glow 键 + ensureVImage 命中 + 光照亮度采样
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 600000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[dbg]')) console.log(t); });
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 300000, polling: 500 });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 420000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));
await page.evaluate(async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const g = window.__swGame, p = g.player, inv = p.inv, items = window.__swItems;
  const key = Object.keys(items).find(k => /^vi_2768_/.test(k));
  inv.add(items[key], 1);
  for (let i = 0; i < inv.slots.length; i++) if (inv.slots[i] && inv.slots[i].id === items[key]) { inv.selected = i; break; }
  g.input.mouseDown = true; await sleep(300); g.input.mouseDown = false; await sleep(300);
  const m = await import('/src/entities/Mounts.ts');
  const d = m.MOUNT_DATA['8'];
  console.log('[dbg] glowKeys=' + JSON.stringify({ back: d.backTextureGlow, front: d.frontTextureGlow, diode: d.frontTextureExtraGlow }));
  const R = g.renderer;
  for (const f of [d.backTextureGlow, d.frontTextureGlow, d.frontTextureExtraGlow, 'vanilla/Mount_Glow_DrillDiode.png']) {
    const img = R.atlas.ensureVImage(f);
    await sleep(400);
    const img2 = R.atlas.ensureVImage(f);
    console.log(`[dbg] ${f}: first=${!!img} after400ms=${!!img2} wh=${img2 ? img2.width + 'x' + img2.height : '-'}`);
  }
  const lt = R.lighting?.lightAt(Math.floor(p.cx / 16), Math.floor(p.cy / 16));
  console.log(`[dbg] lightAt=(${lt?.[0]},${lt?.[1]},${lt?.[2]}) glowAlpha=${(0.25 * Math.max(lt?.[0] ?? 255, lt?.[1] ?? 255, lt?.[2] ?? 255) / 255 + 0.75).toFixed(3)}`);
});
await browser.close();
