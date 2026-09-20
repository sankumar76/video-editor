export class ConcurrencyQueue {
  private pending: Array<() => Promise<void>> = []
  private active = 0

  constructor(private readonly concurrency: number) {}

  add(task: () => Promise<void>): void {
    this.pending.push(task)
    this.pump()
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift()
      if (!task) return
      this.active += 1
      task().finally(() => {
        this.active -= 1
        this.pump()
      })
    }
  }
}
