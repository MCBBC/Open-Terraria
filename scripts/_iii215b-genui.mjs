// ★IIIII215b 一次性验收探针：彩蛋种子生成界面表现面（文本/颜色/帧闪/音效接线）。
//   SW_ORIGIN=http://localhost:5273 node tools/run-diag.mjs --timeout=600000 scripts/_iii215b-genui.mjs
// 验收面：
//   ① drunk(05162020)：头部=纯数字乱码且逐帧变化；Traps pass 抑制帧=真实词条；
//      进度条外框/填充帧闪观测（lastDrawnCrimson/RandomEvil 采样）；提示条=乱码数字串。
//   ② zenith(getfixedboi)：蜜蜂文案被抑制、标题白、FTW 反写形态。
//   ③ anniversary(celebrationmk10)：标题 HotPink(255,105,180)、提示条 HotPink。
//   ④ bees(not the bees)：头部=蜜蜂词条整替。
//   ⑤ 音效接线：Menu_Open 资产 fetch 记录（Sfx 通道 → WAV_MAP → 资产实体）。
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
  { key: 'drunk', seed: '05162020' },
  { key: 'zenith', seed: 'get fixed boi' },
  { key: 'anniversary', seed: 'celebrationmk10' },
  { key: 'bees', seed: 'not the bees' },
];

const report = { seeds: {}, errs, note: 'IIIII215b 生成屏表现面探针' };

for (const { key, seed } of SEEDS) {
  const entry = { seed, headerSamples: [], trapFrames: [], sfxFetch: [], done: false };
  report.seeds[key] = entry;
  const flush = () => writeFileSync(`${OUT}/genui-report.json`, JSON.stringify(report, null, 2));
  try {
    await page.evaluate((sd) => {
      globalThis.__swSfxFetch.length = 0;
      return window.__swFlow.createWorldProbe({ seed: sd, size: 0, name: 'iii215b', difficulty: 0, evil: 0 });
    }, seed);
    // 生成期采样 10s（每 350ms）+ 双截图（2s/7s——生成中画面）
    const t0 = Date.now();
    let shotA = false;
    while (Date.now() - t0 < 10000) {
      const s = await page.evaluate(() => {
        const ui = globalThis.__swGenUi;
        if (!ui) return null;
        const h = ui.header, b = ui.bar;
        return {
          t: Math.round((Date.now() - t0) / 100) / 10,
          text: h.text, color: h.textColor,
          crimson: b.lastDrawnCrimson, randomEvil: b.lastDrawnRandomEvil,
          drunk: b.drunkWorldGen,
          tipText: ui.tips?.[0] ? ui.tipDisplayText(ui.tips[0]) : null,
          tipColor: ui.tips?.length ? null : null,
        };
      }).catch(() => null);
      if (s) entry.headerSamples.push(s);
      if (!shotA && Date.now() - t0 > 2000) {
        await page.screenshot({ path: `${OUT}/shot-${key}-a.png` }).catch(() => {});
        shotA = true;
      }
      await new Promise((r) => setTimeout(r, 350));
    }
    await page.screenshot({ path: `${OUT}/shot-${key}-b.png` }).catch(() => {});
    flush();
    // Traps pass 抑制帧观测（≤90s;小世界生成全程 ~15-40s）
    const t1 = Date.now();
    while (Date.now() - t1 < 90000) {
      const st = await page.evaluate(() => {
        const ui = globalThis.__swGenUi;
        const inGame = !!globalThis.__swGame?.world;
        const text = ui?.header?.text ?? null;
        return { inGame, text, drunk: ui ? ui.bar.drunkWorldGen : false };
      }).catch(() => null);
      if (!st || st.inGame) { entry.done = st?.inGame === true; break; }
      if (st.text && !/^\d+$/.test(st.text) && entry.trapFrames.length < 4) {
        entry.trapFrames.push({ text: st.text, at: Math.round((Date.now() - t1) / 1000) });
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    entry.sfxFetch = await page.evaluate(() => globalThis.__swSfxFetch.splice(0)).catch(() => []);
  } catch (e) {
    entry.error = String(e).slice(0, 200);
  }
  flush();
  // 干净下一轮
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.createWorldProbe, { timeout: 120000 });
}

writeFileSync(`${OUT}/genui-report.json`, JSON.stringify(report, null, 2));
const sum = (e) => e && {
  done: e.done,
  texts: [...new Set((e.headerSamples ?? []).map((s) => s.text))].slice(0, 5),
  colors: [...new Set((e.headerSamples ?? []).map((s) => JSON.stringify(s.color)))].slice(0, 2),
  flickerC: [...new Set((e.headerSamples ?? []).map((s) => s.crimson))],
  flickerR: [...new Set((e.headerSamples ?? []).map((s) => s.randomEvil))],
  tip: (e.headerSamples ?? []).find((s) => s.tipText)?.tipText ?? null,
  trapFrames: e.trapFrames?.slice(0, 2) ?? [],
  sfx: e.sfxFetch?.length ?? 0,
  error: e.error ?? null,
};
console.log('SUMMARY', JSON.stringify({
  drunk: sum(report.seeds.drunk), zenith: sum(report.seeds.zenith),
  anniversary: sum(report.seeds.anniversary), bees: sum(report.seeds.bees),
  errs: errs.slice(0, 4),
}));
await browser.close();
