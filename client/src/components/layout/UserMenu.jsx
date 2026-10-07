import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";

// The user menu on desktop: a button that opens a small list (Profile, Log out).
// Keyboard: Tab to the button, Enter/Space opens it, Escape closes it and gives the focus back to the button.
export default function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const button = useRef(null);

  // close when the user clicks outside or presses Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapper.current && !wrapper.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-48 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span className="truncate">{user.name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {user.role === "ADMIN" && (
            <Link to="/admin" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Admin
            </Link>
          )}
          <Link to="/orders" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            My orders
          </Link>
          <Link to="/profile" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Profile
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
