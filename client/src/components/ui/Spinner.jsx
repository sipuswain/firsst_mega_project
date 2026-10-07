const SIZES = { sm: "h-4 w-4", md: "h-6 w-6", lg: "h-10 w-10" };

// A turning circle. role="status" + label lets screen readers know something is loading.
export default function Spinner({ size = "md", label = "Loading" }) {
  return (
    <svg role="status" aria-label={label} className={`animate-spin ${SIZES[size]}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-90" />
    </svg>
  );
}
