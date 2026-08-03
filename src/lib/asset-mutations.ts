export type SerializedAssetMutation = <T>(flushCurrentProject: () => Promise<void>, mutation: () => Promise<T>) => Promise<T>;

/**
 * Asset endpoints reload project.json before changing files. Serialize each
 * operation and flush the editor snapshot immediately before it so unsaved
 * scene edits cannot be replaced by an older server snapshot.
 */
export function createAssetMutationQueue(): SerializedAssetMutation {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(flushCurrentProject: () => Promise<void>, mutation: () => Promise<T>): Promise<T> {
    const operation = tail.then(async () => {
      await flushCurrentProject();
      return mutation();
    });
    tail = operation.then(() => undefined, () => undefined);
    return operation;
  };
}
