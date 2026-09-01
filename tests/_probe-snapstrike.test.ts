import { describe, it, expect } from 'vitest';
import { snapStrikeDust, trySnapStrike } from '../src/stats/SnapStrike';
describe('probe', () => {
  it('direct import sanity', () => {
    expect(typeof snapStrikeDust).toBe('function');
    expect(typeof trySnapStrike).toBe('function');
  });
});
