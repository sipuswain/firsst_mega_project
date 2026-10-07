import { useId } from "react";

// A checkbox with its label (the label is clickable). Extra props (checked, onChange, disabled ...) go to the input.
export default function CheckboxField({ label, hint, id, className = "", ...rest }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input id={fieldId} type="checkbox" className="h-4 w-4 rounded border-slate-300" {...rest} />
        {label}
      </label>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}
