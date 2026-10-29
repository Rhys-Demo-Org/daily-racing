// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { NO_TIME, formatOptionalTime, formatPosition, formatTime } from '../../src/ui/format.ts';

describe('formatTime (m:ss.cc)', () => {
  it('formats zero and sub-minute times', () => {
    expect(formatTime(0)).toBe('0:00.00');
    expect(formatTime(6120)).toBe('0:06.12');
    expect(formatTime(40370)).toBe('0:40.37');
  });

  it('formats minutes without padding them', () => {
    expect(formatTime(84360)).toBe('1:24.36');
    expect(formatTime(134800)).toBe('2:14.80');
  });

  it('rounds to the nearest centisecond, carrying into seconds and minutes', () => {
    expect(formatTime(1234)).toBe('0:01.23');
    expect(formatTime(1235)).toBe('0:01.24');
    expect(formatTime(1239.9)).toBe('0:01.24');
    expect(formatTime(59994)).toBe('0:59.99');
    expect(formatTime(59995)).toBe('1:00.00');
    expect(formatTime(119999)).toBe('2:00.00');
  });

  it('keeps going past 10 minutes', () => {
    expect(formatTime(600000)).toBe('10:00.00');
    expect(formatTime(754321)).toBe('12:34.32');
    expect(formatTime(6000000)).toBe('100:00.00');
  });

  it('clamps negative values to zero', () => {
    expect(formatTime(-50)).toBe('0:00.00');
  });

  it('shows dashes for a missing time', () => {
    expect(formatOptionalTime(null)).toBe(NO_TIME);
    expect(NO_TIME).toBe('–:––.––');
    expect(formatOptionalTime(40370)).toBe('0:40.37');
  });
});

describe('formatPosition (x/n)', () => {
  it('formats position over car count', () => {
    expect(formatPosition(2, 6)).toBe('2/6');
    expect(formatPosition(1, 2)).toBe('1/2');
    expect(formatPosition(10, 12)).toBe('10/12');
  });
});
