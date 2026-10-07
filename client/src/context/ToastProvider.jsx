import { useCallback, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ToastContext } from "./toastContext.js";

const SHOW_MS = 4500;

// Small pop-up messages ("toasts"): toast.success("Saved") / toast.error("Something failed").
// They hide by themselves, can be closed with the button, and are announced to screen readers (aria-live).
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const remove = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const add = useCallback(
    (type, message, link) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { id, type, message, link }]); // at most 4 at a time
      setTimeout(() => remove(id), SHOW_MS);
    },
    [remove]
  );

  const api = useMemo(() => ({ success: (m, link) => add("success", m, link), error: (m, link) => add("error", m, link) }), [add]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.type === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
              t.type === "error" ? "bg-red-600" : "bg-emerald-600"
            }`}
          >
            <span className="flex-1 break-words">
              {t.message}
              {/* optional link, for example { to: "/cart", label: "View cart" } */}
              {t.link && (
                <>
                  {" "}
                  <Link to={t.link.to} onClick={() => remove(t.id)} className="font-semibold underline">
                    {t.link.label}
                  </Link>
                </>
              )}
            </span>
            <button type="button" onClick={() => remove(t.id)} aria-label="Close message" className="font-bold leading-none">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
