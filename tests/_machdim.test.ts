// ★一次性:216/227/228/218/306/97 真实尺寸与帧结构
import { describe, it } from 'vitest';
import { TILE_DEFS } from '../src/data/tiles';
describe('machdim', () => {
  it('dims', () => {
    for (const sheet of [220, 306, 218, 227, 228, 97]) {
      for (let i = 0; i < TILE_DEFS.length; i++) {
        const d = TILE_DEFS[i] as unknown as { vanilla?: { sheet?: number }; w?: number; h?: number; key?: string };
        if (d?.vanilla?.sheet === sheet) {
          console.log(`sheet${sheet}: id=${i} key=${d.key} w=${d.w} h=${d.h}`);
          break;
        }
      }
    }
  });
});
