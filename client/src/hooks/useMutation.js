import { useCallback, useRef, useState } from "react";

// Runs ONE change at a time (save, delete, change status ...), so a double click can never send it twice.
//   const { busy, run } = useMutation();
//   const result = await run(() => deleteProductRequest(id));
//   result.ok ? result.data : result.error (an ApiError with .message and .status)
// While it runs, `busy` is true: use it to disable the button. A second run() during that time does nothing.
export const useMutation = () => {
  const [busy, setBusy] = useState(false);
  const running = useRef(false); // a ref, so the guard works even before React has redrawn the button

  const run = useCallback(async (action) => {
    if (running.current) return { ok: false, skipped: true };
    running.current = true;
    setBusy(true);
    try {
      return { ok: true, data: await action() };
    } catch (error) {
      return { ok: false, error };
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
};
