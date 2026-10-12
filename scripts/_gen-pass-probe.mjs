// gen pass 注册探针:装载 mod 后检查 genPasses 是否在主线程 WorldGen 里
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
await page.evaluate(async () => {
  const buf = await fetch('mods/dist/calamity.swmod').then((r) => r.arrayBuffer());
  await window.__swMods.install(new Uint8Array(buf));
});
await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 12000));
const r = await page.evaluate(async () => {
  // 通过动态 import 读 WorldGen 模块(与主 bundle 同 URL=同实例)
  const wg = await import('/src/world/gen/WorldGen.ts');
  const passes = wg.getModGenPasses();
  const names = passes.map(p => p.name);
  const errs = window.__swMods?.result?.()?.errors ?? [];
  return { passCount: passes.length, names, errs };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
