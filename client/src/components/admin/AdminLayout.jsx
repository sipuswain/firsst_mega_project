import { Outlet } from "react-router-dom";
import AdminNav from "./AdminNav.jsx";

// The frame of every /admin page: the menu on the left (tabs on top on a phone) and the page next to it.
// min-w-0 lets wide content (tables) shrink and scroll inside its own box instead of widening the page.
// It sits inside the normal <Layout> (header + footer). Who may enter is decided by <ProtectedRoute roles={["ADMIN"]}> in App.jsx.
export default function AdminLayout() {
  return (
    <div className="md:flex md:gap-8">
      <AdminNav />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
