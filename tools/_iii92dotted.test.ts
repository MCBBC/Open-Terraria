import { it, expect } from 'vitest';
import { tryApplyingCopiedSeed } from '../src/world/gen/WorldGen';
import { translateSeed } from '../src/core/rng';

it('dotted recipe routing', () => {
  const r = tryApplyingCopiedSeed('1.1.1.0.doubledaringdangers|20260831');
  expect(r).not.toBeNull();
  expect(r!.effectiveSeedText).toBe('doubledaringdangers|20260831');
  expect(r!.flags.dualDungeons).toBe(true);
  expect(translateSeed(r!.effectiveSeedText)).toBe(translateSeed('doubledaringdangers|20260831'));
  const drunk = tryApplyingCopiedSeed('1.1.1.1.20260903');
  expect(drunk!.flags.drunkWorld).toBe(true);
  expect(drunk!.evil).toBe(0);
  expect(tryApplyingCopiedSeed('plain-seed-20260903')).toBeNull();
  expect(tryApplyingCopiedSeed('12345')).toBeNull();
});
