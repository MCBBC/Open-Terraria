import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args:['--no-sandbox'], defaultViewport:{width:988,height:862} });
const page = await browser.newPage();
page.on('pageerror', e => console.log('[pageerror]', String(e.message).slice(0,300)));
page.on('console', m => { if(['error'].includes(m.type())) console.log('[console.error]', m.text().slice(0,200)); });
await page.evaluateOnNewDocument(() => {
  const C = HTMLCanvasElement.prototype.getContext;
  window.__wrapOn = true;
  // @ts-expect-error
  HTMLCanvasElement.prototype.getContext = function (...a) { return C.apply(this, a); };
});
await page.goto('http://localhost:5201', { waitUntil:'domcontentloaded' });
for (let i=0;i<15;i++){
  const has = await page.evaluate(()=>!!document.querySelector('.sw-title-menu'));
  if(has){console.log('menu mounted (~'+(i*10)+'s mark)');break;}
  await new Promise(r=>setTimeout(r,10000));
}
await browser.close();
