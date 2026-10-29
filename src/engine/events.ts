export type EventId = number;

interface Entry<T> {
  id: EventId;
  atMs: number;
  payload: T;
}

/**
 * Priority queue ordered by ascending atMs; ties pop in insertion order.
 * Binary min-heap with lazy cancellation. Event ids are issued in
 * insertion order, so the id doubles as the tie-break sequence number.
 */
export class EventQueue<T> {
  private heap: Entry<T>[] = [];
  private live = new Set<EventId>();
  private nextId: EventId = 1;

  get size(): number {
    return this.live.size;
  }

  schedule(atMs: number, payload: T): EventId {
    const id = this.nextId++;
    this.heap.push({ id, atMs, payload });
    this.live.add(id);
    this.siftUp(this.heap.length - 1);
    return id;
  }

  cancel(id: EventId): boolean {
    return this.live.delete(id);
  }

  peekTime(): number | undefined {
    this.dropCancelledRoot();
    return this.heap[0]?.atMs;
  }

  pop(): { id: EventId; atMs: number; payload: T } | undefined {
    this.dropCancelledRoot();
    const top = this.heap[0];
    if (top === undefined) return undefined;
    this.removeRoot();
    this.live.delete(top.id);
    return { id: top.id, atMs: top.atMs, payload: top.payload };
  }

  private dropCancelledRoot(): void {
    for (let top = this.heap[0]; top !== undefined && !this.live.has(top.id); top = this.heap[0]) {
      this.removeRoot();
    }
  }

  private removeRoot(): void {
    const last = this.heap.pop();
    if (last !== undefined && this.heap.length > 0) {
      this.heap[0] = last;
      this.siftDown(0);
    }
  }

  private less(a: Entry<T>, b: Entry<T>): boolean {
    return a.atMs < b.atMs || (a.atMs === b.atMs && a.id < b.id);
  }

  private siftUp(i: number): void {
    const h = this.heap;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const node = h[i];
      const p = h[parent];
      if (node === undefined || p === undefined || !this.less(node, p)) break;
      h[i] = p;
      h[parent] = node;
      i = parent;
    }
  }

  private siftDown(i: number): void {
    const h = this.heap;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      const lv = h[l];
      const rv = h[r];
      let mv = h[m];
      if (lv !== undefined && mv !== undefined && this.less(lv, mv)) {
        m = l;
        mv = lv;
      }
      if (rv !== undefined && mv !== undefined && this.less(rv, mv)) {
        m = r;
      }
      if (m === i) break;
      const a = h[i];
      const b = h[m];
      if (a === undefined || b === undefined) break;
      h[i] = b;
      h[m] = a;
      i = m;
    }
  }
}
