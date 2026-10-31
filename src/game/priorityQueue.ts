/** Stable binary min-heap. Entries carry their own priority; stale Dijkstra entries are skipped. */
export class MinHeap<T> {
  private values: { value: T; priority: number; order: number }[] = [];
  private sequence = 0;
  get size() { return this.values.length; }
  private before(a: (typeof this.values)[number], b: (typeof this.values)[number]) {
    return a.priority < b.priority || a.priority === b.priority && a.order < b.order;
  }
  push(value: T, priority: number) {
    const entry = { value, priority, order: this.sequence++ };
    let i = this.values.length;
    this.values.push(entry);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(entry, this.values[parent])) break;
      this.values[i] = this.values[parent]; i = parent;
    }
    this.values[i] = entry;
  }
  pop() {
    if (!this.values.length) return undefined;
    const first = this.values[0], last = this.values.pop()!;
    if (this.values.length) {
      let i = 0;
      while (i * 2 + 1 < this.values.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.values.length && this.before(this.values[child + 1], this.values[child])) child++;
        if (!this.before(this.values[child], last)) break;
        this.values[i] = this.values[child]; i = child;
      }
      this.values[i] = last;
    }
    return first;
  }
}
