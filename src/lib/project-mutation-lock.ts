export class ProjectMutationLock {
  private readonly tails = new Map<string, Promise<void>>();

  run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const operation = previous.then(action, action);
    const tail = operation.then(() => undefined, () => undefined);
    this.tails.set(key, tail);
    void tail.finally(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return operation;
  }

  runMany<T>(keys: readonly string[], action: () => Promise<T>): Promise<T> {
    const ordered = [...new Set(keys)].sort();
    const acquire = (index: number): Promise<T> => {
      const key = ordered[index];
      return key === undefined ? action() : this.run(key, () => acquire(index + 1));
    };
    return acquire(0);
  }
}
