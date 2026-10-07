import { useLocation } from "react-router-dom";

// A short message after a redirect, for example a normal user who opened /admin lands on the home page with it.
// ProtectedRoute sends it in the navigation state ({ noPermission: true }). It disappears on the next navigation.
export default function RouteNotice() {
  const { state } = useLocation();
  if (!state?.noPermission) return null;
  return (
    <p role="alert" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      You do not have permission to open that page.
    </p>
  );
}
