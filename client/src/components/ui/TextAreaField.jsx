import { useId } from "react";

// A multi-line text field with its label and an error text under it (like Input).
export default function TextAreaField({ label, error, hint, id, className = "", rows = 4, ...rest }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const messageId = `${fieldId}-message`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 ${error ? "border-red-500" : "border-slate-300"}`}
        {...rest}
      />
      {(error || hint) && (
        <p id={messageId} className={`mt-1 text-sm ${error ? "text-red-600" : "text-slate-500"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
