/** The build label on the Main menu: the PST date of its commit, its number that day, and its short SHA. */
import { describe, expect, it } from 'vite-plus/test';
import { buildCommitUrl, buildInfo, buildLabel, pstDate } from '../../src/web/build-label.ts';

const SHA = '6b30ad3b58de6767719f2e25e68ea49c10a1ab63';

describe('GUI: build label', () => {
  it('dates a commit in PST, UTC−8 all year', () => {
    // 07:59 UTC is still the day before in PST, and 08:00 UTC is the new day.
    expect(pstDate('2026-11-24T07:59:00Z')).toBe('2026-11-23');
    expect(pstDate('2026-11-24T08:00:00Z')).toBe('2026-11-24');
    // No daylight saving time: in July too the day starts at 08:00 UTC.
    expect(pstDate('2026-07-01T07:30:00Z')).toBe('2026-06-30');
    expect(pstDate('2026-11-23T22:30:00-08:00')).toBe('2026-11-23');
  });

  it('numbers a commit among the commits of its PST day in its history', () => {
    const history = [
      '2026-11-23T22:30:00-08:00',
      '2026-11-23T14:00:00-08:00',
      '2026-11-24T07:00:00Z', // 2026-11-23 23:00 PST the day before, so it counts
      '2026-11-23T07:00:00Z', // 2026-11-22 in PST
    ];
    const info = buildInfo(SHA, history);
    expect(info).toEqual({ date: '2026-11-23', number: 3, sha: SHA });
    expect(buildLabel(info)).toBe('build 2026-11-23 PST #3 6b30ad3');
    expect(buildCommitUrl(info)).toBe(`https://github.com/konrad-jamrozik/game-v5-impl-web/commit/${SHA}`);
  });

  it('reads "build dev" without a link when the build knew no commit', () => {
    expect(buildInfo(SHA, [])).toBeNull();
    expect(buildLabel(null)).toBe('build dev');
    expect(buildCommitUrl(null)).toBeNull();
  });
});
