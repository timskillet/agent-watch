import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

type PushFn = (id: string) => void;
type PopFn = (id: string) => void;

interface DrawerStackContextValue {
  push: PushFn;
  pop: PopFn;
  topId: string | null;
}

const DrawerStackContext = createContext<DrawerStackContextValue | null>(null);

export function DrawerStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<string[]>([]);

  // Stable callbacks — consumers can depend on these without re-running effects
  // on every stack update.
  const push = useCallback<PushFn>((id) => {
    setStack((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);
  const pop = useCallback<PopFn>((id) => {
    setStack((prev) => prev.filter((x) => x !== id));
  }, []);

  const topId = stack.length > 0 ? stack[stack.length - 1] : null;

  return (
    <DrawerStackContext.Provider value={{ push, pop, topId }}>
      {children}
    </DrawerStackContext.Provider>
  );
}

/**
 * Register an open drawer with the stack. When no provider wraps the component
 * tree, the hook degrades to "always top" so existing callers work unchanged.
 *
 * The effect depends on `push` and `pop` directly (they are stable callbacks),
 * NOT on the full context value — `topId` changes on every stack update and
 * would otherwise cause an infinite push/pop loop.
 */
export function useDrawerStackRegister(open: boolean): {
  isTop: boolean;
  id: string;
} {
  const id = useId();
  const ctx = useContext(DrawerStackContext);
  const push = ctx?.push;
  const pop = ctx?.pop;

  useEffect(() => {
    if (!open || push === undefined || pop === undefined) return;
    push(id);
    return () => pop(id);
  }, [open, id, push, pop]);

  const isTop = ctx === null ? true : ctx.topId === id;
  return { isTop, id };
}
