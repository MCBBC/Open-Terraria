import puppeteer from 'puppeteer-core';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new',defaultViewport:{width:1280,height:800}});
const p=await b.newPage();
p.on('pageerror',e=>console.log('[pageerr]',String(e).slice(0,160)));
p.on('console',m=>{ const t=m.text(); if(m.type()==='error'||t.startsWith('[')) console.log(m.type()+':',t.slice(0,130)); });
await p.goto('http://localhost:5311/?play=large',{waitUntil:'domcontentloaded',timeout:120000});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(let i=0;i<90;i++){
  await sleep(4000);
  const st=await p.evaluate(()=>({
    game:!!window.__swGame, menu:!!document.querySelector('[data-act=sp]'),
    load:!!document.querySelector('[class*=load],[class*=progress]'),
    bodyCls:document.body.className.slice(0,40),
  })).catch(e=>({err:String(e).slice(0,60)}));
  if(i%5===0) console.log(i*4+'s', JSON.stringify(st));
  if(st.game) break;
}
await b.close();
