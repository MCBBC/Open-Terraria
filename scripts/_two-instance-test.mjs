// 双实例实验:两个独立 Chrome 实例各载存档世界跑 100s,数 IOSurface 失败。
// 对照基线(2026-08-18):单实例双 tab = 27 次失败。
import { HOME } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const N = 2;
const browsers = [];
const pages = [];
const stderrLines = { };
for (let i = 0; i < N; i++) {
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', userDataDir: `${HOME}/.claude/jobs/8405c930/tmp/twoinst-${i}`,
    args: ['--no-first-run', '--enable-logging', '--log-level=1',
      `--log-file=${HOME}/.claude/jobs/8405c930/tmp/twoinst-${i}/chrome.log`],
    defaultViewport: { width: 1280, height: 800 },
  });
  const p = await b.newPage();
  stderrLines[i] = [];
  p.on('console', () => {});
  browsers.push(b); pages.push(p);
}
await Promise.all(pages.map(async (p, i) => {
  p.setDefaultTimeout(200000);
  await p.goto('http://localhost:5201/debug-line.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
}));
await Promise.all(pages.map(async (p) => {
  await new Promise((r) => setTimeout(r, 2000));
  await p.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
  await p.evaluate(async () => { await window.__swFlow.loadJson(await (await fetch('/debug-save.sbw.json')).text()); });
  await p.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
}));
await Promise.all(pages.map((p, i) => p.evaluate((i) => {
  const g = window.__swGame;
  g.player.x = (380 + i * 60) * 16; g.player.y = 254 * 16;
  g.player.debugGod = true;
}, i)));
// 跑 100s;两个实例都动一动(移动镜头制造 chunk 烘焙)
await new Promise((r) => setTimeout(r, 100000));
const summary = await Promise.all(pages.map((p) => p.evaluate(() => {
  const g = window.__swGame;
  return { alive: !!g.__swGame || true, chunks: g.chunks.pageCount, maxChunks: g.chunks.constructor.MAX_CHUNKS,
    texs: g.renderer.glfx?.texs?.size ?? -1 };
})));
console.log('[实例状态]', JSON.stringify(summary));
for (const b of browsers) await b.close();
