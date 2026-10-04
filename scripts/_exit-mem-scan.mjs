// _exit-mem-scan.mjs — 流式扫描 DevTools 导出 trace(逐事件回调,不整载)
// v2: Buffer 字节层逐行切分(避免大字符串 rope 展平,快 ~10×)
// 用法: import { scanTrace } from './_exit-mem-scan.mjs'; scanTrace(path, ev => {...})
import fs from 'node:fs';

export function scanTrace(path, onEvent) {
  const fd = fs.openSync(path, 'r');
  const size = fs.fstatSync(fd).size;
  const CHUNK = 16 * 1024 * 1024;
  const buf = Buffer.alloc(CHUNK);
  let tail = null; // 跨块不完整行(字节)
  let pos = 0;
  let inEvents = false;
  let done = false;
  let acc = null; // 跨行不平衡事件兜底
  let n = 0;

  const handleLine = (lineStr) => {
    if (done) return;
    if (!inEvents) {
      if (lineStr.includes('"traceEvents"')) inEvents = true;
      return;
    }
    let s = lineStr.trim();
    if (!s || !s.startsWith('{')) {
      if (s.startsWith(']')) done = true;
      return;
    }
    if (s.endsWith(',')) s = s.slice(0, -1);
    if (acc === null) {
      try { onEvent(JSON.parse(s), n++); return; } catch (e) { acc = s; return; }
    }
    acc += '\n' + s;
    try { onEvent(JSON.parse(acc), n++); acc = null; } catch (e) { /* 继续累积 */ }
  };

  while (pos < size && !done) {
    const len = fs.readSync(fd, buf, 0, CHUNK, pos);
    if (len <= 0) break;
    pos += len;
    let lineStart = 0;
    for (let i = 0; i < len; i++) {
      if (buf[i] === 10) {
        let lineStr;
        if (tail) {
          lineStr = Buffer.concat([tail, buf.subarray(lineStart, i)]).toString('utf8');
          tail = null;
        } else {
          lineStr = buf.toString('utf8', lineStart, i);
        }
        handleLine(lineStr);
        lineStart = i + 1;
      }
    }
    const rest = buf.subarray(lineStart, len);
    tail = tail ? Buffer.concat([tail, rest]) : Buffer.from(rest);
  }
  if (tail && !done) handleLine(tail.toString('utf8'));
  if (acc) { try { onEvent(JSON.parse(acc), n++); } catch (e) {} }
  fs.closeSync(fd);
  return n;
}
