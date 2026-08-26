import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[PAGEERROR]', e.stack ?? e.message));
p.on('console', (m) => { if (m.type() === 'error') console.log('[CONSOLE]', m.text().slice(0, 300)); });
await p.goto('http://localhost:5241/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 15000));
await b.close();
