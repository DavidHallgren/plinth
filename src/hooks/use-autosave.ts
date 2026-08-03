import { useCallback, useEffect, useRef } from "react";

type AutosaveOptions<T> = {
  value: T | null;
  enabled: boolean;
  delayMs: number;
  save: (value: T) => Promise<T>;
};

export function useDebouncedAutosave<T>({ value, enabled, delayMs, save }: AutosaveOptions<T>) {
  const saveRef = useRef(save);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const saveValue = useCallback(async (snapshot: T): Promise<T> => {
    const operation = saveQueueRef.current.then(() => saveRef.current(snapshot));
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!value || !enabled) {
      return;
    }

    const snapshot = value;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void saveValue(snapshot).catch(() => undefined);
    }, delayMs);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [delayMs, enabled, saveValue, value]);

  const saveNow = useCallback(async (snapshot?: T): Promise<T> => {
    const nextValue = snapshot ?? value;
    if (!nextValue) {
      throw new Error("Cannot save without a project snapshot.");
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return saveValue(nextValue);
  }, [saveValue, value]);

  return { saveNow };
}
