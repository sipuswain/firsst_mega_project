import { useFocusOnChange } from "../../hooks/useFocusOnChange.js";
import { focusField } from "../../utils/focus.js";

// A box that lists what is wrong in a form. It gets the focus when `signal` changes (after each failed submit).
//   errors = { fieldKey: "message" }   idFor(fieldKey) = the id of that input, so the links can focus the field
export default function ErrorSummary({ errors, idFor, signal, title = "Please fix these problems:" }) {
  const ref = useFocusOnChange(signal);
  const keys = Object.keys(errors);
  if (keys.length === 0) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {keys.map((key) => (
          <li key={key}>
            <a
              href={`#${idFor(key)}`}
              onClick={(e) => {
                e.preventDefault();
                focusField(idFor(key));
              }}
              className="underline"
            >
              {errors[key]}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
