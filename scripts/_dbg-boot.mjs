import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args:['--no-sandbox'], defaultViewport:{width:988,height:862} });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', String(e.stack||e.message).slice(0,400)));
page.on('console', m => { if(m.type()==='error') console.log('[err]', m.text().slice(0,200)); });
await page.goto(process.env.SW_ORIGIN||'http://localhost:5205', { waitUntil:'domcontentloaded' });
for (let i=0;i<10;i++){ if(await page.evaluate(()=>!!document.querySelector('.sw-title-menu'))){console.log('menu ok ~'+(i*5)+'s');break;} await new Promise(r=>setTimeout(r,5000)); }
await browser.close();
