// 管线未启用警告弹窗 E2E 探针(2026-09-03):?swfail 调试旗模拟 SW 不可用,
// 验证四点——
// ① 正常路径(dev 无旗)不弹窗
// ② ?swfail 弹出 .sw-asset-pipe,reason 文本含"模拟",有"复制诊断信息/重试/仍要进入"三按钮
// ③ 点"复制诊断信息"回退路径(无剪贴板权限时)开诊断面板且 textarea 含报告头
// ④ 点"仍要进入"弹窗关闭;同页再触发不重复弹
// 用法:私有 vite 实例 + SW_ORIGIN 指给 run-diag(并行会话约定):
//   SW_PORT=5201 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5201 nohup npx vite > /tmp/vite-5201.log 2>&1 &
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_pipewarn-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- ① 正常路径:无旗不弹窗 ----
await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
check('①dev 无旗不弹窗', await page.$('.sw-asset-pipe') === null);

// ---- ② ?swfail 弹窗 + 结构 ----
await page.goto(`${origin}/?swfail`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(2500);
const dlg = await page.$('.sw-asset-pipe');
check('②swfail 弹窗出现', !!dlg);
if (dlg) {
  const reason = await page.$eval('.sw-asset-pipe .reason', (el) => el.textContent ?? '');
  check('②reason 含模拟标记', reason.includes('模拟'), reason.slice(0, 60));
  for (const label of ['复制诊断信息', '重试', '仍要进入']) {
    const btns = await page.$$eval('.sw-asset-pipe button', (els) => els.map((e) => e.textContent));
    check(`②按钮「${label}」在`, btns.some((t) => t?.includes(label)), btns.join('|'));
  }
}

// ---- ③ 复制诊断:主路径(剪贴板写成功可读回)+ 回退路径(无 API → 诊断面板) ----
if (dlg) {
  // ③-a 主路径:headless 授剪贴板权限 → 点复制 → 读回验证内容
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await page.click('.sw-asset-pipe [data-a=copy]');
  await sleep(1200);
  let clip = '';
  try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch { /* 权限竞态 */ }
  check('③a剪贴板含报告头/失败原因/trace', clip.includes('[SandboxWorld 资产管线诊断]')
    && clip.includes('模拟') && clip.includes('swTrace'), `len=${clip.length}`);
  // ③-b 回退路径:干掉 clipboard API → 点复制 → 自动开诊断面板(textarea 可手动复制)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { get: () => undefined, configurable: true });
  });
  await page.click('.sw-asset-pipe [data-a=copy]');
  await sleep(1200);
  const diag = await page.$('#sw-asset-diag');
  const txt = diag ? await page.$eval('#sw-asset-diag textarea', (el) => el.value) : '';
  check('③b无API回退开面板且含报告', !!diag && txt.includes('[SandboxWorld 资产管线诊断]')
    && txt.includes('模拟'), `panel=${!!diag} len=${txt.length}`);
  if (diag) await page.evaluate(() => document.querySelector('#sw-asset-diag [data-a=close]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await sleep(300);
}

// ---- ④ 仍要进入 → 关闭且不重复弹 ----
if (dlg) {
  await page.click('.sw-asset-pipe [data-a=go]');
  await sleep(400);
  check('④仍要进入后关闭', await page.$('.sw-asset-pipe') === null);
  // 二次触发(重放 init 不可能;直接再走一次同 URL 导航——pipeAck 是内存态会重置,
  // 同页不重复弹由 pipeAck 保证,此处验证刷新后可再弹=每会话一次语义)
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(2000);
  check('④刷新后可再弹(每会话一次)', !!(await page.$('.sw-asset-pipe')));
}

console.log(`\n结果: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
