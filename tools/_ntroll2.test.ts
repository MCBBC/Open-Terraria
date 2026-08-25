// NTROLL2 一次性探针：神庙槽(21)逐掷调用栈归因（用完即删）
import { it } from 'vitest';
import { openSync, writeSync, closeSync } from 'node:fs';
import { UnifiedRandom } from '../src/core/rng';
import { generateWorld } from '../src/world/gen/WorldGen';

const RUN = process.env.SW_NTROLL === '1';
(RUN ? it : it.skip)('temple-slot roll attribution', async () => {
  const LO = 93_436_770, HI = 93_438_740;
  const proto = UnifiedRandom.prototype as unknown as Record<string, unknown>;
  const orig = proto.internalSample as (this: UnifiedRandom) => number;
  let n = 0;
  const h = openSync('/tmp/qqq-out/ntattr.txt', 'w');
  proto.internalSample = function (this: UnifiedRandom) {
    const v = orig.call(this);
    if (n >= LO && n <= HI) {
      const st = new Error().stack ?? '';
      const frames = st.split('\n')
        .filter((l) => l.includes('/src/') && !l.includes('/core/rng') && !l.includes('_ntroll'))
        .slice(0, 3)
        .map((l) => l.replace(/^.*?src\//, '').replace(/\)$/, ''))
        .join(' < ');
      writeSync(h, `${n} ${v} ${frames}\n`);
    }
    n++;
    return v;
  };
  try {
    await generateWorld({
      width: 4200, height: 1200, seedText: '1896728457', evil: 1,
      seedFlags: { noTraps: true },
    });
  } finally {
    proto.internalSample = orig;
    closeSync(h);
  }
}, 600_000);
