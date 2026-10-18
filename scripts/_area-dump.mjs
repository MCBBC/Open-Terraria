// 案发区高精度剖面 dump:type/slope/half/wall/platform — (594,328)周边
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';
const path=needInput(join(DOWNLOADS, 'map-Starter_World (23).json'));
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'new'});
const page=await browser.newPage();
page.on('pageerror',e=>console.log('ERR:',e.message));
await page.goto((process.env.SW_ORIGIN??'http://localhost:5199'),{waitUntil:'networkidle0',timeout:120000});
const json=readFileSync(path,'utf8');
const out=await page.evaluate(async(j)=>{
  const { loadSave }=await import('/src/save/SaveFile.ts');
  const w=loadSave(j).world; const st=w.store;
  const X0=580,X1=616,Y0=315,Y1=342;
  // 图例: 数字=slope(1..4) . =空气 H=half P=平台 #=实心(slope0)
  const lines=[];
  for(let y=Y0;y<=Y1;y++){
    let row='';
    for(let x=X0;x<=X1;x++){
      const i=st.idx(x,y);
      if(!st.isActive(x,y)){ row+=' '; continue; }
      if(st.slope[i]>0){ row+=String(st.slope[i]); continue; }
      if(st.half[i]){ row+='H'; continue; }
      if(st.isPlatform(x,y)){ row+='P'; continue; }
      if(st.isSolid(x,y)) row+='#';
      else row+='o';
    }
    lines.push(String(y).padStart(3)+row);
  }
  return {lines, X0};
},[json]);
console.log('cols:',out.X0,'..;',`x从左到右, 每列1字符`);
console.log(out.lines.join('\n'));
await browser.close();
