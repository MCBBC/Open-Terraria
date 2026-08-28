// vf 斜坡/半砖 A/B 截图探针:同存档同机位,分别以 ?vf=1 / ?vf=0 渲染截图。
// VFP_MODE=1|0 决定链开关;输出 PNG 到 VFP_OUT(缺省 job tmp)。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const MODE = process.env.VFP_MODE ?? '1';
const OUT = process.env.VFP_OUT ?? `/Users/vinlic/.claude/jobs/4a66e745/tmp/vf-slope-${MODE}.png`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wldB64 = fs.readFileSync(WLD).toString('base64');
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1200, height: 800 } });
const p = await b.newPage();
await p.goto(`${ORIGIN}/?vf=${MODE}&nosw`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 180000 });
const conv = await p.evaluate(async (b64) => {
  const m = await import('/src/wld/WldImport.ts');
  const bin = atob(b64); const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return JSON.stringify(m.parseWldToSave(buf).save);
}, wldB64);
await p.evaluate((t) => window.__swLoadJson(t), conv);
for (let i = 0; i < 120; i++) { await sleep(1000); if (await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player))) break; }
await sleep(3000);
// 防真幕确认门(不点则全屏遮罩,截图全黑)
await p.evaluate(() => {
  const btn = [...document.querySelectorAll('button, .btn, [class*=button]')].find((el) => (el.textContent ?? '').includes('我已知晓'));
  if (btn) btn.click();
});
await sleep(1000);
// 机位:用户截图同地貌(梯田土坡+斜坡阶地);固定玩家与速度防漂移
await p.evaluate(() => { const g = window.__swGame; g.player.x = 3997 * 16; g.player.y = 455 * 16; g.player.vx = 0; g.player.vy = 0; });
await sleep(7000);
await p.evaluate(() => { const g = window.__swGame; g.player.vx = 0; g.player.vy = 0; });
await sleep(600);
// 关掉 UI 覆盖层干扰?保留原样(与用户截图同条件)。连拍 2 张取后一张(防首帧撕裂)
await p.screenshot({ path: OUT.replace('.png', '-raw.png') });
await sleep(400);
await p.screenshot({ path: OUT });
console.log(JSON.stringify({ mode: MODE, out: OUT }));
await b.close();
