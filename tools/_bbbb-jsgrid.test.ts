// BBBB 一次性：种子 9293480 链内 dgLights 入口网格落盘（SW_DG_LIGHTS_GRID 消费）
import { it } from 'vitest';
import { chainCheckpoints } from '../tests/caves-checkpoint.test';
const RUN = process.env.SW_BBBB === 'jsgrid';
(RUN ? it : it.skip)('jsgrid seed 9293480', () => {
  const res = chainCheckpoints('9293480', 0);
  delete process.env.SW_DG_LIGHTS_GRID;   // 防 import 副作用的 describe 再跑时覆写 dump
  console.log('checkpoints:', res.grids.size, 'underworld:', res.grids.get('underworld'));
}, 600000);
