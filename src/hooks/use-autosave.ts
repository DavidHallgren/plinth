import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "saved" | "pending" | "saving" | "error";

type AutosaveOptions<T> = {
  value: T | null;
  enabled: boolean;
  delayMs: number;
  save: (value: T) => Promise<void>;
};

export function useDebouncedAutosave<T>({ value, enabled, delayMs, save }: AutosaveOptions<T>) {
  const [state, setState] = useState<AutosaveState>("saved");
  const saveRef = useRef(save);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const saveValue = useCallback(async (snapshot: T): Promise<void> => {
    const operation = saveQueueRef.current.then(async () => {
      setState("saving");
      try {
        await saveRef.current(snapshot);
        setState("saved");
      } catch (error) {
        setState("error");
        throw error;
      }
    });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    await operation;
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!value || !enabled) {
      return;
    }

    setState("pending");
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

  const saveNow = useCallback(async (snapshot?: T): Promise<void> => {
    const nextValue = snapshot ?? value;
    if (!nextValue) {
      return;
    }
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await saveValue(nextValue);
  }, [saveValue, value]);

  return { state, saveNow };
}
