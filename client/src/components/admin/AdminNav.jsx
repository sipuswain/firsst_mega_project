import { NavLink } from "react-router-dom";

const LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/orders", label: "Orders" },
  { to: "/admin/products", label: "Products" },
  { to: "/admin/collections", label: "Collections" },
  { to: "/admin/coupons", label: "Coupons" },
  { to: "/admin/customers", label: "Customers" },
];

const linkClass = ({ isActive }) =>
  `block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-100"}`;

// The admin menu: a sidebar on big screens, tabs on a small screen (the tabs scroll inside their own row).
export default function AdminNav() {
  return (
    <nav aria-label="Admin" className="mb-6 md:sticky md:top-20 md:mb-0 md:w-48 md:shrink-0 md:self-start">
      <ul className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 md:flex-col md:overflow-visible md:border-b-0 md:pb-0">
        {LINKS.map((link) => (
          <li key={link.to} className="shrink-0">
            <NavLink to={link.to} end={link.end} className={linkClass}>
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
