export class RingBuffer<T> {
  private items: T[] = []

  constructor(private maxSize: number) {}

  push(item: T): void {
    this.items.push(item)
    if (this.items.length > this.maxSize) {
      this.items.shift()
    }
  }

  toArray(): T[] {
    return [...this.items]
  }

  clear(): void {
    this.items = []
  }
}
