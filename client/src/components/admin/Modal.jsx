import { useEffect, useId, useRef } from "react";

// Things the keyboard can reach (for the Tab loop inside the dialog)
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const WIDTHS = { md: "max-w-md", lg: "max-w-xl" };

// An accessible dialog. Show it by rendering it ({open && <Modal ...>}); it is "closed" when it is not rendered.
//  - when it opens, the focus moves INTO it (to the element with data-autofocus, else the first focusable one)
//  - Tab and Shift+Tab stay inside it
//  - Escape calls onClose (not while `busy`, so a running save cannot be interrupted)
//  - when it closes, the focus goes back to the element that opened it
//  - the page behind does not scroll
export default function Modal({ title, onClose, busy = false, size = "md", children }) {
  const panel = useRef(null);
  const titleId = useId();

  // the newest onClose / busy, so the effect below can run only once (when the dialog opens)
  const latest = useRef({ onClose, busy });
  useEffect(() => {
    latest.current = { onClose, busy };
  });

  useEffect(() => {
    const node = panel.current;
    const opener = document.activeElement; // remember who opened the dialog
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () => [...node.querySelectorAll(FOCUSABLE)];
    (node.querySelector("[data-autofocus]") ?? focusable()[0] ?? node).focus();

    const onKey = (event) => {
      if (event.key === "Escape") {
        if (!latest.current.busy) latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!node.contains(active) || (event.shiftKey && (active === first || active === node))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = oldOverflow;
      if (opener instanceof HTMLElement) opener.focus(); // focus goes back
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-full w-full overflow-y-auto rounded-xl bg-white p-5 shadow-xl ${WIDTHS[size]}`}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
