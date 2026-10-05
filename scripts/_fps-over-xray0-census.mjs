// fps-over 裁决 xray0:trace 事件普查(行级切片,47MB)
// 目标:确认 trace 结构/线程表/关键锚事件名(FireAnimationFrame/DrawFrame/BeginFrame/
// PageAnimator profile 节点)的存在性与数量,为后续帧率对账定锚。
import { readFileSync } from 'node:fs';

const TRACE = '/Users/vinlic/Downloads/Trace-20261005T153007.json';
const buf = readFileSync(TRACE);
const NL = 0x0a;
const lineSlice = (pos) => {
  const start = buf.lastIndexOf(NL, pos) + 1;
  let end = buf.indexOf(NL, pos);
  if (end === -1) end = buf.length;
  let s = buf.toString('utf8', start, end);
  if (s.endsWith(',')) s = s.slice(0, -1);
  return s;
};

// 1) 线程表
const threadNames = new Map(); // pid:tid -> name
const procNames = new Map();
let pos = buf.indexOf(Buffer.from(',"name":"thread_name"'));
while (pos !== -1) {
  try {
    const ev = JSON.parse(lineSlice(pos));
    threadNames.set(ev.pid + ':' + ev.tid, ev.args?.name ?? '?');
  } catch {}
  pos = buf.indexOf(Buffer.from(',"name":"thread_name"'), pos + 1);
}
pos = buf.indexOf(Buffer.from(',"name":"process_name"'));
while (pos !== -1) {
  try {
    const ev = JSON.parse(lineSlice(pos));
    procNames.set(ev.pid, ev.args?.name ?? '?');
  } catch {}
  pos = buf.indexOf(Buffer.from(',"name":"process_name"'), pos + 1);
}
console.log('== 进程/线程表 ==');
for (const [pk, pn] of procNames) {
  const tids = [...threadNames.entries()].filter(([k]) => k.startsWith(pk + ':'));
  console.log(`pid=${pk} ${pn}: ` + tids.map(([k, v]) => `${k.split(':')[1]}=${v}`).join(' '));
}

// 2) 事件名普查(逐行一次扫描,顺序 JSON parse 太贵——只对关键名字做 indexOf 定位计数)
const names = [
  'FireAnimationFrame', 'RequestAnimationFrame', 'FunctionCall', 'DrawFrame',
  'BeginMainThreadFrame', 'BeginFrame', 'Animate', 'Animation', 'EventDispatch',
  'ProfileChunk', 'RunTask', 'ThreadControllerImpl::RunTask', 'FrameLoadingFrame',
  'Layerize', 'ActivateLayerTree', 'DrawLazyPixelRef', 'ThreadPool',
  'PageAnimator', 'serviceScriptedAnimations', 'needsBeginFrame',
];
const counts = new Map();
for (const n of names) {
  const needle = Buffer.from(`,"name":"${n}"`);
  let p = buf.indexOf(needle), c = 0;
  while (p !== -1) { c++; p = buf.indexOf(needle, p + 1); }
  counts.set(n, c);
}
console.log('== 关键事件名计数 ==');
for (const [n, c] of counts) console.log(`  ${n}: ${c}`);

// 3) 时间跨度(用 FireAnimationFrame 与 DrawFrame 的首尾)
for (const n of ['FireAnimationFrame', 'DrawFrame']) {
  const needle = Buffer.from(`,"name":"${n}"`);
  const ts = [];
  let p = buf.indexOf(needle);
  while (p !== -1 && ts.length < 1e9) {
    try { const ev = JSON.parse(lineSlice(p)); ts.push(ev.ts); } catch {}
    p = buf.indexOf(needle, p + 1);
  }
  if (ts.length) {
    ts.sort((a, b) => a - b);
    console.log(`${n}: n=${ts.length} span=${((ts[ts.length - 1] - ts[0]) / 1e6).toFixed(2)}s first=${ts[0]}`);
  }
}
