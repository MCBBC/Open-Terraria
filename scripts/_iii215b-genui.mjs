// ★IIIII215b 一次性验收探针：彩蛋种子生成界面表现面（文本/颜色/帧闪/音效接线）。
//   SW_ORIGIN=http://localhost:5273 node tools/run-diag.mjs --timeout=600000 scripts/_iii215b-genui.mjs
// 采样纪律：createWorldProbe 【不 await】（await=等到生成完才采样,首跑已证 0 样本——
//   小世界在页内 ~2s 生成完毕）；60ms 高频采样 + drunk 用中世界(size 1)拉长生成窗。
// 验收面：
//   ① drunk(05162020,size1)：头部=纯数字乱码逐帧变化；Traps pass 抑制帧=真实词条；
//      帧闪观测（lastDrawnCrimson/RandomEvil 序列）；提示条=乱码数字串。
//   ② zenith(getfixedboi)：蜜蜂文案被抑制（FTW 反写形态）、标题白。
//   ③ anniversary(celebrationmk10)：标题 HotPink(255,105,180)。
//   ④ bees(not the bees)：头部=蜜蜂词条整替。
//   ⑤ 音效接线：Menu_Open/Chat/menu_accept 资产 fetch 记录（Sfx→WAV_MAP→资产实体）。
// 产物：/tmp/iii215b-out/{genui-report.json(逐种子增量落盘), shot-<seed>-{a,b}.png}
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5273';
const OUT = '/tmp/iii215b-out';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => { const t = m.text(); if (/error|ERROR|缺失/.test(t)) errs.push(t.slice(0, 160)); });
page.on('pageerror', (e) => errs.push('PAGE:' + String(e).slice(0, 200)));
// 音效资产 fetch 间谍（Sfx.play → WAV_MAP → fetch(sounds/<file>.opus|mp3)）
await page.evaluateOnNewDocument(() => {
  const hits = [];
  globalThis.__swSfxFetch = hits;
  const of = globalThis.fetch;
  globalThis.fetch = function (u, ...rest) {
    try {
      const s = String(u);
      if (/\/sounds\/(Menu_Open|Menu_Close|menu_accept|Chat)\./.test(s)) {
        hits.push({ url: s.slice(-48), at: Math.round(performance.now()) });
      }
    } catch { /* 间谍不参与 */ }
    return of.call(this, u, ...rest);
  };
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 180000 });

const SEEDS = [
  { key: 'drunk', seed: '05162020', size: 1, sampleMs: 35000 },   // 中世界=长生成窗(帧闪/Trap 抑制可观测)
  { key: 'zenith', seed: 'get fixed boi', size: 0, sampleMs: 6000 },
  { key: 'anniversary', seed: 'celebrationmk10', size: 0, sampleMs: 6000 },
  { key: 'bees', seed: 'not the bees', size: 0, sampleMs: 6000 },
];

const report = { seeds: {}, errs, note: 'IIIII215b 生成屏表现面探针' };

for (const { key, seed, size, sampleMs } of SEEDS) {
  const entry = { seed, size, headerSamples: [], trapFrames: [], sfxFetch: [], done: false };
  report.seeds[key] = entry;
  const flush = () => writeFileSync(`${OUT}/genui-report.json`, JSON.stringify(report, null, 2));
  try {
    // 【火不await】createWorldFlow 内部 self-set __swGenUi 在构造后即刻可用
    await page.evaluate((cfg) => {
      void window.__swFlow.createWorldProbe(cfg)?.catch?.((e) => { globalThis.__swProbeErr = String(e).slice(0, 200); });
    }, { seed, size, name: 'iii215b', difficulty: 0, evil: 0 });
    const t0 = Date.now();
    let shotA = false;
    while (Date.now() - t0 < sampleMs) {
      const s = await page.evaluate(() => {
        const ui = globalThis.__swGenUi;
        if (!ui) return { noUi: true };
        const h = ui.header, b = ui.bar;
        return {
          text: h.text, color: h.textColor,
          crimson: b.lastDrawnCrimson, randomEvil: b.lastDrawnRandomEvil, drunk: b.drunkWorldGen,
          tipText: ui.tips?.[0] ? ui.tipDisplayText(ui.tips[0]) : null,
        };
      }).catch(() => null);
      if (s && !s.noUi) {
        s.t = Math.round((Date.now() - t0) / 100) / 10;
        entry.headerSamples.push(s);
        if (!shotA && Date.now() - t0 > 800) {
          await page.screenshot({ path: `${OUT}/shot-${key}-a.png` }).catch(() => {});
          shotA = true;
        }
      }
      if (s?.noUi && Date.now() - t0 > 15000) break;   // 句柄未出现(异常路径)——防死等
      await new Promise((r) => setTimeout(r, 60));
    }
    await page.screenshot({ path: `${OUT}/shot-${key}-b.png` }).catch(() => {});
    // Trap 抑制帧 + 生成收尾（≤120s 窗;traps pass 在生成中后段）
    const t1 = Date.now();
    while (Date.now() - t1 < 120000) {
      const st = await page.evaluate(() => {
        const ui = globalThis.__swGenUi;
        const inGame = !!globalThis.__swGame?.world;
        return { inGame, text: ui?.header?.text ?? null };
      }).catch(() => null);
      if (!st || st.inGame) { entry.done = st?.inGame === true; break; }
      if (st.text && !/^\d+$/.test(st.text) && entry.trapFrames.length < 6) {
        entry.trapFrames.push(st.text);
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    await page.screenshot({ path: `${OUT}/shot-${key}-c.png` }).catch(() => {});
    entry.sfxFetch = await page.evaluate(() => globalThis.__swSfxFetch.splice(0)).catch(() => []);
  } catch (e) {
    entry.error = String(e).slice(0, 200) + (globalThis.__swProbeErr ?? '');
  }
  flush();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 120000 });
}

writeFileSync(`${OUT}/genui-report.json`, JSON.stringify(report, null, 2));
const sum = (e) => e && ({
  done: e.done,
  samples: (e.headerSamples ?? []).length,
  texts: [...new Set((e.headerSamples ?? []).map((s) => s.text))].slice(0, 5),
  colors: [...new Set((e.headerSamples ?? []).map((s) => JSON.stringify(s.color)))].slice(0, 2),
  flickerC: [...new Set((e.headerSamples ?? []).map((s) => s.crimson))],
  flickerR: [...new Set((e.headerSamples ?? []).map((s) => s.randomEvil))],
  tip: (e.headerSamples ?? []).find((s) => s.tipText)?.tipText ?? null,
  trapFrames: (e.trapFrames ?? []).slice(0, 3),
  sfx: (e.sfxFetch ?? []).length,
  error: e.error ?? null,
});
console.log('SUMMARY', JSON.stringify({
  drunk: sum(report.seeds.drunk), zenith: sum(report.seeds.zenith),
  anniversary: sum(report.seeds.anniversary), bees: sum(report.seeds.bees),
  errs: errs.slice(0, 4),
}));
await browser.close();
