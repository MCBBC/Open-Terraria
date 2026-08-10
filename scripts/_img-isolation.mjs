// 隔离实验:仅 <img> 加载全部 vanilla PNG(不绘制)的 RSS 代价
import puppeteer from 'puppeteer-core';
import { readdirSync } from 'fs';
import { execSync } from 'child_process';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const bpid = browser.process().pid;
const rssMB = () => {
  try {
    const out = execSync(`ps -o rss= -p $(pgrep -P ${bpid} | tr '\\n' ',')${bpid} 2>/dev/null | awk '{s+=$1} END {print s}'`).toString().trim();
    return Math.round(Number(out) / 1024);
  } catch { return -1; }
};
const page = await browser.newPage();
await page.goto('http://localhost:5199/favicon.ico', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
await new Promise(r => setTimeout(r, 2000));
const base = rssMB();
console.log('A 空页基线 RSS:', base, 'MB');

const files = readdirSync('/Users/vinlic/Project/GLM/SandboxWorld/game/public/sprites/vanilla').filter(f => f.endsWith('.png'));
await page.evaluate(async (files) => {
  window.__imgs = [];
  await Promise.all(files.map(f => new Promise(res => {
    const img = new Image();
    img.onload = img.onerror = () => { window.__imgs.push(img); res(); };
    img.src = 'sprites/vanilla/' + f;
  })));
}, files);
await new Promise(r => setTimeout(r, 3000));
const afterLoad = rssMB();
console.log(`B 加载 ${files.length} 张 vanilla PNG 后 RSS:`, afterLoad, 'MB(增量', afterLoad - base, 'MB)');

// 强制全部绘制一遍(触发解码)
await page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 4;
  const ctx = cv.getContext('2d');
  for (const img of window.__imgs) ctx.drawImage(img, 0, 0);
});
await new Promise(r => setTimeout(r, 5000));
const afterDraw = rssMB();
console.log('C 全部绘制一次后 RSS:', afterDraw, 'MB(增量', afterDraw - base, 'MB)');
await browser.close();
