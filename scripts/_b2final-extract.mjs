// B2 终局裁决·trace 深提取:主线程 rAF 链+FunctionCall+真帧锚+GC,输出 /tmp/b2final-data.json
import fs from 'node:fs';
import readline from 'node:readline';

const TRACE = '/Users/vinlic/Downloads/Trace-20261006T033001.json';
const MAIN = { pid: 42978, tid: 30326041 };
const COMP = { pid: 42978, tid: 30326053 };

const fnIdx = new Map();  // functionName -> idx
const fnNames = [];
function fnId(name) {
  let i = fnIdx.get(name);
  if (i === undefined) { i = fnNames.length; fnNames.push(name); fnIdx.set(name, i); }
  return i;
}

const rafFires = [];      // [ts, dur, id]
const funcCalls = [];     // [ts, dur, fnIdx, insideRaf(0/1)]
const pageAnim = [];      // [ts, dur]
const beginMain = [];     // [ts]
const presentation = [];  // [ts]
const drawFrames = [];    // [ts] (compositor)
const gcEvents = [];      // [ts, dur, name]
const stackSamples = [];  // RequestAnimationFrame stackTrace top frames (chain provenance), sampled
const otherTasks = [];    // non-rAF main-thread X events with dur>2ms (ts, dur, name) — top-level workload census

let n = 0;
const rl = readline.createInterface({ input: fs.createReadStream(TRACE, 'utf8'), crlfDelay: Infinity });
for await (const line of rl) {
  if (++n % 300000 === 0) console.error(`...${n}`);
  const t = line.trim();
  if (!t.startsWith('{"args"') && !t.startsWith('{"cat"')) continue;
  let e;
  try { e = JSON.parse(t.replace(/,$/, '')); } catch { continue; }
  if (e.pid !== 42978) continue;
  if (e.tid === MAIN.tid) {
    switch (e.name) {
      case 'FireAnimationFrame':
        rafFires.push([e.ts, e.dur || 0, e.args?.data?.id ?? -1]);
        break;
      case 'FunctionCall': {
        const fn = e.args?.data?.functionName ?? '<anon>';
        funcCalls.push([e.ts, e.dur || 0, fnId(fn), e.args?.data?.lineNumber ?? -1]);
        break;
      }
      case 'PageAnimator::serviceScriptedAnimations':
        pageAnim.push([e.ts, e.dur || 0]);
        break;
      case 'BeginMainThreadFrame':
        beginMain.push(e.ts);
        break;
      case 'AnimationFrame::Presentation':
        presentation.push(e.ts);
        break;
      case 'RequestAnimationFrame': {
        const st = e.args?.data?.stackTrace?.[0];
        if (st && stackSamples.length < 40) stackSamples.push({ id: e.args.data.id, fn: st.functionName, line: st.lineNumber, url: st.url?.split('/').pop() });
        break;
      }
      default:
        if (e.ph === 'X' && (e.dur || 0) > 2000 && e.cat !== 'disabled-by-default-v8.inspector') {
          if (e.name.startsWith('V8.') || e.name.startsWith('CppGC')) gcEvents.push([e.ts, e.dur || 0, fnId(e.name)]);
          else otherTasks.push([e.ts, e.dur || 0, fnId(e.name)]);
        }
    }
  } else if (e.tid === COMP.tid && e.name === 'DrawFrame') {
    drawFrames.push(e.ts);
  }
}

// FunctionCall 归属:按 ts 二分落入哪个 rAF fire(事件按 ts 单调?trace 大体单调,用 sweep)
funcCalls.sort((a, b) => a[0] - b[0]);
rafFires.sort((a, b) => a[0] - b[0]);
let fi = 0;
const callsInFire = new Array(rafFires.length).fill(null).map(() => []);
for (const c of funcCalls) {
  while (fi < rafFires.length && rafFires[fi][0] + rafFires[fi][1] < c[0]) fi++;
  let j = fi;
  while (j < rafFires.length && rafFires[j][0] <= c[0]) {
    if (c[0] <= rafFires[j][0] + rafFires[j][1]) { callsInFire[j].push(c); break; }
    j++;
  }
}

const out = {
  windowUs: [rafFires[0]?.[0] ?? 0, rafFires[rafFires.length - 1]?.[0] ?? 0],
  fnNames,
  rafFires,
  callsInFire,
  pageAnim,
  beginMain,
  presentation,
  drawFrames,
  gcEvents,
  otherTasks,
  stackSamples,
};
fs.writeFileSync('/tmp/b2final-data.json', JSON.stringify(out));
console.log('fnNames:', fnNames.filter(n => !n.startsWith('V8.') && !n.startsWith('CppGC')).slice(0, 40));
console.log('stackSamples:', JSON.stringify(stackSamples.slice(0, 20)));
console.log('counts: rafFires', rafFires.length, 'funcCalls', funcCalls.length, 'pageAnim', pageAnim.length,
  'beginMain', beginMain.length, 'presentation', presentation.length, 'drawFrames', drawFrames.length,
  'gc', gcEvents.length, 'otherTasks', otherTasks.length);
