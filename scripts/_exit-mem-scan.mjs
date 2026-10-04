// _exit-mem-scan.mjs — 流式扫描 DevTools 导出 trace(逐事件回调,不整载)
// 用法: import { scanTrace } from './_exit-mem-scan.mjs'; scanTrace(path, ev => {...})
export function scanTrace(path, onEvent) {
  const fd = fs.openSync(path, 'r');
  const size = fs.fstatSync(fd).size;
  const CHUNK = 8 * 1024 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let carry = '';
  let pos = 0;
  let inEvents = false;
  let done = false;
  let acc = null; // 跨行不平衡事件累积
  let n = 0;

  const emit = (s) => {
    s = s.trim();
    if (s.endsWith(',')) s = s.slice(0, -1);
    if (!s.startsWith('{')) return;
    try { onEvent(JSON.parse(s), n++); }
    catch (e) { /* 不平衡行由 acc 兜底 */ }
  };

  const handleLine = (raw) => {
    if (done) return;
    if (!inEvents) {
      if (raw.includes('"traceEvents"')) { inEvents = true; }
      return;
    }
    const line = raw.trim();
    if (!line) return;
    if (line.startsWith(']')) { done = true; return; }
    if (!line.startsWith('{')) return;
    // 平衡性兜底:先试单行解析
    let s = line.endsWith(',') ? line.slice(0, -1) : line;
    if (acc === null) {
      try { onEvent(JSON.parse(s), n++); return; }
      catch (e) { acc = s; return; }
    }
    acc += '\n' + s;
    try { onEvent(JSON.parse(acc), n++); acc = null; } catch (e) { /* 继续累积 */ }
  };

  while (pos < size && !done) {
    const len = fs.readSync(fd, buf, 0, CHUNK, pos);
    if (len <= 0) break;
    pos += len;
    const text = carry + buf.toString('utf8', 0, len);
    const lines = text.split('\n');
    carry = lines.pop(); // 末尾不完整行
    for (const l of lines) handleLine(l);
  }
  if (carry) handleLine(carry);
  if (acc) { try { onEvent(JSON.parse(acc), n++); } catch (e) {} }
  fs.closeSync(fd);
  return n;
}
import fs from 'node:fs';
