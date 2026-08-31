// IIII99c 一次性：候选流逐步对表（真重放 RNG vs 管线台账）
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RNG } from '../src/core/rng';

const RUN = process.env.SW_I112SIM === '1';
(RUN ? it : it.skip)('candidate stream ledger crosscheck', () => {
  // 1) 读管线台账（window 内 ab 序）
  const atts: Array<{i:number;j:number}> = [];
  {
    const lines = readFileSync('/tmp/iii112-out/win-attempts.txt','utf8').split('\n');
    let cur: [number,number]|null=null;
    for(const l of lines){
      const p=l.split('|');
      if(p[0]==='ab') cur=[Number(p[1]),Number(p[2])];
      else if(p[0]==='abx'&&cur){ atts.push({i:cur[0],j:cur[1]}); cur=null; }
    }
  }
  console.log(`ledger attempts=${atts.length}`);
  // 2) 台账分段：洞穴段=首个 j>=950 前的全部
  let bAt=-1;
  for(let k=0;k<atts.length;k++) if(atts[k].j>=950){ bAt=k; break; }
  console.log(`first deep(j>=950)=#${bAt} in=${atts[bAt]?.i},${atts[bAt]?.j}`);
  const caves=atts.slice(0,bAt);
  console.log(`caves-phase ledger len=${caves.length}`);
  // 3) 从种子重放的纯坐标抽取序列：
  const seed=1138154190;
  const rng=new RNG(seed);
  const area=(4200*1200)/5040000,wsc=1;
  rng.int(Math.trunc(35*area),Math.trunc(40*area));
  rng.int(Math.trunc(10*wsc),Math.trunc(15*wsc));
  const caveTarget=rng.int(Math.trunc(35*area),Math.trunc(40*area));
  rng.int(Math.trunc(2*area),Math.trunc(2*area));
  console.log(`caveTarget=${caveTarget}`);
  const W=4200,H=1200,wsInt=337;
  // 洞穴循环模拟：success/fail 采用台账真实结果驱动——第 k 次尝试在台账里已知成败，
  // 失败→continue(只消耗坐标 2 骰)，成功→成功后其 loot 耗骰数未知 ⇒ 用「台账下一成功
  // 输入序号差」近似不可行。改为纯检验：台账洞穴段前 min(len,caveTarget) 个输入是否等于
  // 「无失败重掷时的期望抽取」？不成立即说明真实重试交错。退而求其次：直接比对前 N 对
  // （N=2 的幂），打印第一个不等的位置。
  const simFirst: Array<[number,number]>=[];
  for(let k=0;k<200;k++){
    const x=rng.int(20,W-21); const y=rng.int(wsInt,H-401);
    simFirst.push([x,y]);
  }
  // 注意：这一段并非真实执行序（真实会因 loot 重排）——只作为“头骰一致性”检查。
  let ok=true;
  for(let k=0;k<Math.min(simFirst.length,caves.length);k++){
    if(simFirst[k][0]!==caves[k].i||simFirst[k][1]!==caves[k].j){
      console.log(`FIRST MISMATCH at k=${k}: sim=(${simFirst[k]}) ledger=(${caves[k].i},${caves[k].j})`);
      ok=false; break;
    }
  }
  if(ok) console.log('prefix fully aligned (no interleaved re-draw)');
}, 300_000);
