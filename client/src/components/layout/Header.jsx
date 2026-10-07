import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";
import SearchBox from "./SearchBox.jsx";
import CartLink from "./CartLink.jsx";
import UserMenu from "./UserMenu.jsx";
import { useAuth } from "../../hooks/useAuth.js";

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`;

// The top bar: logo, search, links and the login / user menu. On small screens the links go into a menu button.
export default function Header() {
  const { user, isLoggedIn, logout } = useAuth();
  const { pathname } = useLocation();
  // The mobile menu remembers the page it was opened on, so it closes by itself on another page.
  const [openAt, setOpenAt] = useState(null);
  const menuOpen = openAt === pathname;
  const setMenuOpen = (open) => setOpenAt(open ? pathname : null);

  // Escape closes the mobile menu
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Logo />

        {/* search: inside the bar on big screens, under the bar on small ones (see below) */}
        <SearchBox className="mx-4 hidden max-w-md flex-1 md:block" />

        <nav aria-label="Main" className="ml-auto hidden items-center gap-1 md:flex">
          <NavLink to="/" end className={linkClass}>
            Shop
          </NavLink>
          {isLoggedIn && <CartLink />}
          {/* the Admin link is shown only to admins (the server still checks the role on every admin call) */}
          {user?.role === "ADMIN" && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
          {isLoggedIn ? (
            <UserMenu />
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <Link to="/signup" className="ml-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Sign up
              </Link>
            </>
          )}
        </nav>

        <button
          type="button"
          className="ml-auto rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {menuOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div id="mobile-menu" className="border-t border-slate-200 px-4 pb-4 pt-3 md:hidden">
          <SearchBox className="mb-3" />
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            <NavLink to="/" end className={linkClass}>
              Shop
            </NavLink>
            {isLoggedIn ? (
              <>
                <CartLink withText className="w-full" />
                {user.role === "ADMIN" && (
                  <NavLink to="/admin" className={linkClass}>
                    Admin
                  </NavLink>
                )}
                <NavLink to="/orders" className={linkClass}>
                  My orders
                </NavLink>
                <NavLink to="/profile" className={linkClass}>
                  Profile ({user.name})
                </NavLink>
                <button type="button" onClick={() => { setOpenAt(null); logout(); }} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={linkClass}>
                  Log in
                </NavLink>
                <NavLink to="/signup" className={linkClass}>
                  Sign up
                </NavLink>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
