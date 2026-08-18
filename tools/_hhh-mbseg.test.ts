// HHHH 批一次性探针：链内 MicroBiomes __swSeg 段事件捕获 → /tmp/hhhh-js-mbseg.log
//（对拍 oracle MB_TRACE 段摘要，定位首个分歧段）。用后即删。
import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';

const log: string[] = [];
(globalThis as Record<string, unknown>).__swSeg = (name: string, detail?: unknown) => {
  log.push(`${name} ${detail === undefined ? '' : JSON.stringify(detail)}`);
};

it('mb segment trace', () => {
  chainCheckpoints('9293480', 0);
  writeFileSync('/tmp/hhhh-js-mbseg.log', log.join('\n') + '\n');
  console.log(`seg events: ${log.length}`);
}, 600000);
