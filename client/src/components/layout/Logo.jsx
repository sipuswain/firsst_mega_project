import { Link } from "react-router-dom";

// The shop name / logo. It links to the home page.
export default function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
      <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
        M
      </span>
      MegaShop
    </Link>
  );
}
