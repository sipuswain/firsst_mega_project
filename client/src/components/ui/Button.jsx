import Spinner from "./Spinner.jsx";

const VARIANTS = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300",
  secondary: "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:text-slate-400",
  ghost: "text-slate-700 hover:bg-slate-100 disabled:text-slate-400",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};
const SIZES = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2.5 text-sm", lg: "px-6 py-3 text-base" };

// A button. type defaults to "button" so it never submits a form by accident (use type="submit" on purpose).
// loading = show a spinner and block clicks while something is happening.
export default function Button({ variant = "primary", size = "md", type = "button", loading = false, disabled = false, className = "", children, ...rest }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="sm" label="Please wait" />}
      {children}
    </button>
  );
}
