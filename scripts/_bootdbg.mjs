import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',defaultViewport:{width:1280,height:800}});
const p=await b.newPage();
p.on('pageerror',e=>console.log('[pageerror]',e.message.slice(0,200)));
p.on('console',m=>{const t=m.text();if(/ERROR|error|Failed|failed/.test(t))console.log('[pg]',t.slice(0,180));});
await p.goto(process.env.SW_ORIGIN??'http://localhost:5199',{waitUntil:'domcontentloaded',timeout:60000});
console.log('[ok] dom loaded');
try{await p.waitForSelector('select',{timeout:45000});console.log('[ok] select');}
catch(e){console.log('[FAIL] select',e.message.slice(0,120));}
try{await p.evaluate(()=>{const s=document.querySelector('select');s.selectedIndex=0;s.parentElement.querySelector('button').click();});console.log('[ok] clicked');}catch(e){console.log('[FAIL] click',e.message.slice(0,120));}
const t0=Date.now();
try{
 await p.waitForFunction(()=>!!window.__swGame,{polling:500,timeout:240000});
 console.log('[ok] __swGame in',Date.now()-t0,'ms');
}catch(e){
 const last=await p.evaluate(()=>document.body.innerText.slice(0,300)).catch(e2=>'ctx-dead:'+e2.message.slice(0,80));
 console.log('[FAIL] game in',Date.now()-t0,'ms |body:',last);
}
const title=await p.title().catch(()=>'-');
console.log('[title]',title);
await b.close();
