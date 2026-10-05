// B2 终局裁决·trace 普查:事件面计数 + console 签名 + 时间窗
import fs from 'node:fs';
import readline from 'node:readline';

const TRACE = '/Users/vinlic/Downloads/Trace-20261006T033001.json';

const nameCount = new Map();       // name -> count (renderer main tid 30326041)
const catCount = new Map();        // cat -> count
const tidName = new Map();         // tid -> set of names (top few)
const consoleMsgs = [];            // console messages ([beat] etc.)
let minTs = Infinity, maxTs = -Infinity;
let n = 0;
let metaPid = null;

const rl = readline.createInterface({ input: fs.createReadStream(TRACE, 'utf8'), crlfDelay: Infinity });
for await (const line of rl) {
  if (n++ % 200000 === 0) console.error(`...${n} lines`);
  const t = line.trim();
  if (!t.startsWith('{"args"') && !t.startsWith('{"cat"')) continue;
  let e;
  try { e = JSON.parse(t.replace(/,$/, '')); } catch { continue; }
  if (e.cat === '__metadata' && e.name === 'process_name') { if (!e.args?.name?.includes('Renderer')) continue; }
  if (e.ph === 'M') {
    if (e.name === 'thread_name') {
      const k = `${e.pid}/${e.tid}`;
      if (!tidName.has(k)) tidName.set(k, new Set());
      tidName.get(k).add(e.args?.name);
    }
    continue;
  }
  if (e.ts < minTs) minTs = e.ts; if (e.ts > maxTs) maxTs = e.ts;
  if (e.pid === 42978 && e.tid === 30326041) {  // CrRendererMain
    nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1);
    catCount.set(e.cat, (catCount.get(e.cat) || 0) + 1);
  }
  if (e.name === 'console-message' || e.cat === 'disabled-by-default-devtools.console') {
    consoleMsgs.push(e);
  }
}
console.log('== lines:', n, 'window(ms):', ((maxTs - minTs) / 1000).toFixed(0));
console.log('== threads:');
for (const [k, names] of tidName) console.log(' ', k, [...names].slice(0, 4).join('|'));
console.log('== renderer main top names:');
const sorted = [...nameCount.entries()].sort((a, b) => b[1] - a[1]);
for (const [nm, c] of sorted.slice(0, 40)) console.log(`  ${nm}: ${c}`);
console.log('== renderer main cats:', [...catCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
console.log('== console messages:', consoleMsgs.length);
for (const m of consoleMsgs.slice(0, 60)) {
  const txt = m.args?.data?.message ?? m.args?.message ?? JSON.stringify(m.args).slice(0, 120);
  console.log(`  ts=${(m.ts / 1000).toFixed(0)} ${String(txt).slice(0, 160)}`);
}
