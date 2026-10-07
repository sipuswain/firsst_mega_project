import { useId } from "react";

// A text field with its label and an error text under it.
// The label is connected to the input (htmlFor / id) and the error is read out by screen readers (aria-describedby).
export default function Input({ label, error, hint, id, className = "", ...rest }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm shadow-sm placeholder:text-slate-400 ${
          error ? "border-red-500" : "border-slate-300"
        }`}
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
