import { useState } from "react";

// A product picture. When there is no url, or the picture cannot be loaded, a grey placeholder is shown.
export default function ProductImage({ src, alt, className = "", eager = false }) {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) {
    return (
      <div role="img" aria-label={alt ? `${alt} (no image)` : "No image"} className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}>
        <svg className="h-1/3 w-1/3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      </div>
    );
  }
  return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} onError={() => setFailedSrc(src)} className={`object-cover ${className}`} />;
}
