// 临时:子级计时(测完删)
import { it } from 'vitest';
import { generateWorld } from '../src/world/gen/WorldGen';
it('子级', async () => {
  await generateWorld({ width: 4200, height: 1200, seedText: '9293480', name: 't', evil: -1 }, () => {});
}, 900000);
