import { useCallback, useEffect, useRef, useState } from 'react';

const UNDO_WINDOW_MS = 5000;

export interface PendingDelete<T> {
  item: T;
  index: number;
  label: string;
}

interface UseUndoDeleteOptions<T> {
  /** Returns the actual API delete promise. Called after the undo window expires. */
  apiDelete: (item: T) => Promise<void>;
  /** Optimistically remove from the local list. */
  removeFromList: (item: T) => void;
  /** Restore item to local list at original index (used on undo or if API fails). */
  restoreToList: (item: T, index: number) => void;
  /** Human label for the inline strip ("Marketing has been deleted."). */
  getLabel: (item: T) => string;
  /** Optional error handler — gets called if the deferred API call fails. */
  onError?: (err: unknown) => void;
}

/**
 * Manage Harvest-style 5-second-undo deletes:
 * - Click delete → optimistic remove + show inline strip
 * - 5-second timer scheduled to fire actual API call
 * - Click Undo → cancel timer + restore item
 * - On API failure → restore item + invoke onError
 */
export function useUndoDelete<T>({
  apiDelete,
  removeFromList,
  restoreToList,
  getLabel,
  onError,
}: UseUndoDeleteOptions<T>) {
  const [pending, setPending] = useState<PendingDelete<T> | null>(null);
  const timerRef = useRef<number | null>(null);

  // cancel any in-flight timer when component unmounts so the API call
  // doesn't fire after the page is gone
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleDelete = useCallback(
    (item: T, index: number) => {
      // If a previous undo window is open, fire that one immediately so we
      // don't lose track of it (no overlapping pending deletes).
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      removeFromList(item);
      setPending({ item, index, label: getLabel(item) });

      timerRef.current = window.setTimeout(async () => {
        try {
          await apiDelete(item);
        } catch (err) {
          restoreToList(item, index);
          onError?.(err);
        } finally {
          // Clear the strip if it's still ours; race-safe by id check via getLabel keying
          setPending((cur) => (cur?.item === item ? null : cur));
          timerRef.current = null;
        }
      }, UNDO_WINDOW_MS);
    },
    [apiDelete, getLabel, onError, removeFromList, restoreToList],
  );

  const undo = useCallback(() => {
    if (!pending) return;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    restoreToList(pending.item, pending.index);
    setPending(null);
  }, [pending, restoreToList]);

  return { pending, scheduleDelete, undo };
}
