import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import Spinner from "./ui/Spinner.jsx";

// Wraps pages that need a login. Use it as a layout route:
//   <Route element={<ProtectedRoute />}> <Route path="/profile" element={<ProfilePage />} /> </Route>
// Not logged in -> the login page; after login the user comes back here (location state "from").
// `roles` limits the pages to some roles: <ProtectedRoute roles={["ADMIN"]} />. A logged in user with another role is sent
// to the home page with a short message (state.noPermission, shown by RouteNotice). The server still checks the role on every admin call.
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" label="Checking your login" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace state={{ noPermission: true }} />;
  return <Outlet />;
}
