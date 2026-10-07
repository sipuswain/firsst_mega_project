import { useId } from "react";

// A drop-down list with its label and an error text under it (like Input). Put the <option>s inside it.
export default function SelectField({ label, error, hint, id, className = "", children, ...rest }) {
  const autoId = useId();
  const selectId = id ?? autoId;
  const messageId = `${selectId}-message`;
  return (
    <div className={className}>
      <label htmlFor={selectId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className={`block w-full rounded-lg border bg-white px-3 py-2.5 text-sm shadow-sm ${error ? "border-red-500" : "border-slate-300"}`}
        {...rest}
      >
        {children}
      </select>
      {(error || hint) && (
        <p id={messageId} className={`mt-1 text-sm ${error ? "text-red-600" : "text-slate-500"}`}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
