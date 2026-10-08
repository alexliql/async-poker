import { describe, expect, it } from 'vitest';
import { ago, duration, initial, money, signedMoney, timeLeft, timerLabel } from '../src/lib/format';

describe('format', () => {
  it('formats money with separators', () => {
    expect(money(0)).toBe('$0');
    expect(money(1234)).toBe('$1,234');
    expect(money(12.6)).toBe('$13');
  });
  it('signs nets with a real minus', () => {
    expect(signedMoney(212)).toBe('+$212');
    expect(signedMoney(-40)).toBe('−$40');
    expect(signedMoney(0)).toBe('$0');
  });
  it('shows time left compactly', () => {
    expect(timeLeft(-5)).toBe('0s');
    expect(timeLeft(45_000)).toBe('45s');
    expect(timeLeft(18 * 60_000)).toBe('18m');
    expect(timeLeft(5 * 60_000)).toBe('5m');
    expect(timeLeft(7 * 3_600_000)).toBe('7h');
    expect(timeLeft(3 * 3_600_000 + 42 * 60_000)).toBe('3h 42m');
    expect(timeLeft(11 * 3_600_000 + 42 * 60_000)).toBe('11h');
  });
  it('shows how long ago', () => {
    expect(ago(10_000)).toBe('now');
    expect(ago(4 * 60_000)).toBe('4m');
    expect(ago(3 * 3_600_000)).toBe('3h');
    expect(ago(50 * 3_600_000)).toBe('2d');
  });
  it('labels timers and durations', () => {
    expect(timerLabel(12 * 3_600_000)).toBe('12h');
    expect(timerLabel(30 * 60_000)).toBe('30m');
    expect(duration(2 * 86_400_000)).toBe('2 days');
    expect(duration(3_600_000)).toBe('1 hour');
    expect(duration(10_000)).toBe('1 minute');
  });
  it('takes the first letter of a name', () => {
    expect(initial(' kai')).toBe('K');
    expect(initial('')).toBe('?');
  });
});
