import { describe, expect, it } from 'vitest';
import { EventQueue } from '../../src/engine/events';

describe('EventQueue', () => {
  it('pops in time order', () => {
    const q = new EventQueue<string>();
    q.schedule(300, 'c');
    q.schedule(100, 'a');
    q.schedule(200, 'b');
    expect(q.size).toBe(3);
    expect(q.peekTime()).toBe(100);
    const out: string[] = [];
    for (let e = q.pop(); e; e = q.pop()) out.push(e.payload);
    expect(out).toEqual(['a', 'b', 'c']);
    expect(q.size).toBe(0);
  });

  it('ties pop in insertion order', () => {
    const q = new EventQueue<string>();
    q.schedule(100, 'first');
    q.schedule(100, 'second');
    q.schedule(50, 'earlier');
    q.schedule(100, 'third');
    const out: string[] = [];
    for (let e = q.pop(); e; e = q.pop()) out.push(e.payload);
    expect(out).toEqual(['earlier', 'first', 'second', 'third']);
  });

  it('cancelled event is skipped and cancel returns true once, false after', () => {
    const q = new EventQueue<string>();
    q.schedule(100, 'a');
    const id = q.schedule(200, 'b');
    q.schedule(300, 'c');
    expect(q.cancel(id)).toBe(true);
    expect(q.cancel(id)).toBe(false);
    expect(q.size).toBe(2);
    const out: string[] = [];
    for (let e = q.pop(); e; e = q.pop()) out.push(e.payload);
    expect(out).toEqual(['a', 'c']);
  });

  it('peekTime on empty is undefined', () => {
    const q = new EventQueue<string>();
    expect(q.peekTime()).toBeUndefined();
    expect(q.pop()).toBeUndefined();
    const id = q.schedule(10, 'x');
    q.cancel(id);
    expect(q.peekTime()).toBeUndefined();
  });
});
