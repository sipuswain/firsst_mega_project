import { Link } from "react-router-dom";
import EmptyState from "../components/ui/EmptyState.jsx";

export default function NotFoundPage() {
  return (
    <EmptyState
      title="404 - Page not found"
      text="The page you are looking for does not exist or was moved."
      action={
        <Link to="/" className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700">
          Go to the shop
        </Link>
      }
    />
  );
}
