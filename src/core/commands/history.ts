/**
 * Snapshot-based command history: every edit captures the whole "before" and "after"
 * document state, so do()/undo() are trivially correct by construction. Cheap enough
 * for a document this size (a handful of KB of JSON), and it means individual edit
 * functions never need to hand-write an inverse operation.
 */
export interface Command<T> {
  readonly label: string
  readonly before: T
  readonly after: T
}

export function createCommand<T>(label: string, before: T, after: T): Command<T> {
  return { label, before, after }
}

export class CommandHistory<T> {
  private undoStack: Command<T>[] = []
  private redoStack: Command<T>[] = []

  push(command: Command<T>): void {
    this.undoStack.push(command)
    this.redoStack = []
  }

  undo(): T | undefined {
    const command = this.undoStack.pop()
    if (!command) return undefined
    this.redoStack.push(command)
    return command.before
  }

  redo(): T | undefined {
    const command = this.redoStack.pop()
    if (!command) return undefined
    this.undoStack.push(command)
    return command.after
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
