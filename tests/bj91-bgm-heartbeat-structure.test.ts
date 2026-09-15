// ★BJ91 2026-09-15 RB18 R6 债清偿（BJ75 接线时登记未做）：bgm 环心跳结构锁。
// 背景：AudioSystem.snapshotTrace（周期快照→trace,10s 节流）是 bgm 环唯一活体心跳
//   ——RB18 定谳：接线上线前 startLoop rAF step 内无该调用,trace 环只收事件类
//   （sel/start/stop/fail/mute）,静止期（如长曲循环中段零事件窗）行为日志
//   eventCount=0 与「坏通道」（rAF 环死/上下文丢失）不可区分。BJ75 已把
//   this.snapshotTrace() 接进 startLoop step（Audio.ts,10s 节流自含）。
// 本锁：①step 内调用在位（整缺=回归红,心跳哑=RB18 原病灶复现且不可判读）；
//   ②全文件恰一调用点（搬家不许可——移出 step 即失义,双份=节流互相掩蔽）；
//   ③snapshotTrace 本体节流+snap 事件在位（调用在而体被掏空=同 eventCount=0 症,
//    一样过不了本锁）。结构锁与 bgm-loop-end-guard.test.ts ④ 结构面同法（源码切片）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const AUDIO_SRC = readFileSync(join(dirname(__dirname), 'src', 'core', 'Audio.ts'), 'utf8');

/** 方法体切片（签名行→配平闭括号） */
function bodyOf(src: string, sig: string): string {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  const open = src.indexOf('{', i);
  if (open < 0) return '';
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(open + 1, j); }
  }
  return '';
}

describe('BJ91 RB18 R6 bgm 环心跳结构锁（AudioSystem.snapshotTrace 接线在位）', () => {
  it('startLoop rAF step 内 this.snapshotTrace() 调用在位（心跳哑=RB18 病灶复现）', () => {
    const stepBody = bodyOf(AUDIO_SRC, 'private startLoop()');
    expect(stepBody, 'startLoop 方法体可定位').not.toBe('');
    expect(stepBody).toMatch(/this\.snapshotTrace\(\)/);
  });

  it('全文件恰一调用点（移出 step / 双份节流互掩均红）', () => {
    const calls = [...AUDIO_SRC.matchAll(/this\.snapshotTrace\(\)/g)].length;
    expect(calls).toBe(1);
  });

  it('snapshotTrace 本体：10s 节流 + snap 事件落 trace（体被掏空=同 eventCount=0 症）', () => {
    const body = bodyOf(AUDIO_SRC, 'private snapshotTrace(): void');
    expect(body, 'snapshotTrace 方法体可定位').not.toBe('');
    expect(body).toMatch(/10000/);            // 10s 节流
    expect(body).toMatch(/tracePush/);        // 快照落环
    expect(body).toMatch(/e:\s*'snap'/);      // 事件类型名（诊断读数判据）
  });
});
