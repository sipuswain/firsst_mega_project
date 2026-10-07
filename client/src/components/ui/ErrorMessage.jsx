import Button from "./Button.jsx";
import { useFocusOnChange } from "../../hooks/useFocusOnChange.js";

// A red box with the error text and (optional) a "Try again" button.
// focusSignal: change this number to move the keyboard focus to the box (after a failed submit).
export default function ErrorMessage({ message, onRetry, focusSignal = 0 }) {
  const ref = useFocusOnChange(focusSignal);
  if (!message) return null;
  return (
    <div ref={ref} tabIndex={-1} role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="break-words">{message}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
