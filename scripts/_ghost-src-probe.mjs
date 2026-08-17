import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:1280,height:800}});
const p=await b.newPage();
p.on('pageerror',e=>console.log('[pageerr]',String(e).slice(0,150)));
p.on('console',m=>{ if(m.type()==='error') console.log('[err]',m.text().slice(0,120)); });
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await p.goto('http://localhost:5311/?play=small',{waitUntil:'domcontentloaded',timeout:120000});
for(let i=0;i<240;i++){ await sleep(2000); if(i%30===0) console.log("wait",i*2,"s"); if(await p.evaluate(()=>!!window.__swGame).catch(()=>false)) break; }
await sleep(6000);
if(!(await p.evaluate(()=>!!window.__swGame).catch(()=>false))){ console.log('SKIP:未进世界'); await b.close(); process.exit(0); }
const r=await p.evaluate(async()=>{
  const ui=window.__swUI;
  ui.openInventory();
  await new Promise(r2=>setTimeout(r2,500));
  const img=document.querySelector('[class*=ghost] img');
  if(!img) return {err:'no ghost img'};
  let count=0;
  const desc=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
  Object.defineProperty(img,'src',{set(){count++;},get(){return '';},configurable:true});
  const move=new MouseEvent('mousemove',{clientX:100,clientY:100,bubbles:true});
  for(let i=0;i<100;i++) document.dispatchEvent(move);
  Object.defineProperty(img,'src',desc);
  return {moves:100,srcSets:count};
});
console.log(JSON.stringify(r));
console.log(r.srcSets===0?'PASS':'FAIL');
await b.close(); process.exit(r.srcSets===0?0:1);
