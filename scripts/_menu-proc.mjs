// 真实菜单逐进程归因 v2:修复 ps 解析 + 资源计数随时间变化
import puppeteer from 'puppeteer-core';
import { execSync } from 'child_process';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const bpid = browser.process().pid;
const perProc = () => {
  const kids = execSync(`pgrep -P ${bpid}`).toString().trim().split('\n').filter(Boolean);
  const pids = [String(bpid), ...kids];
  const out = [];
  for (const pid of pids) {
    try {
      const line = execSync(`ps -o rss=,comm= -p ${pid} 2>/dev/null`).toString().trim();
      if (!line) continue;
      const [rss, ...rest] = line.split(/\s+/);
      out.push({ pid: +pid, mb: Math.round(+rss / 1024), name: rest.join(' ').replace(/.*Helpers\//, '').slice(0, 34) });
    } catch { /* 进程已退 */ }
  }
  return out.sort((a, b) => b.mb - a.mb);
};
const page = await browser.newPage();
await page.goto('http://localhost:5199/favicon.ico', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
const p0 = perProc();
console.log('A 基线:', p0.map(p => `${p.name}:${p.mb}`).join(' '), '| 总', p0.reduce((s, p) => s + p.mb, 0), 'MB');

await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (const t of [5, 10, 20, 40]) {
  await new Promise(r => setTimeout(r, t === 5 ? 5000 : t === 10 ? 5000 : t === 20 ? 10000 : 20000));
  const p = perProc();
  const res = await page.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('sprites/')).length);
  const m = await page.metrics();
  console.log(`t=${t}s sprites请求=${res} JS堆=${(m.JSHeapUsedSize / 1048576).toFixed(0)}MB 进程=[${p.map(x => `${x.name}:${x.mb}`).join(' ')}] 总${p.reduce((s, x) => s + x.mb, 0)}MB`);
}
await browser.close();
