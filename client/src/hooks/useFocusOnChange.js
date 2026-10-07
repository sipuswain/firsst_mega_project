import { useEffect, useRef } from "react";

// Returns a ref. When `signal` changes (and is not 0), the element with this ref gets the keyboard focus.
// Used for error boxes: after a failed submit the focus moves to the error, so keyboard and screen reader users notice it.
export const useFocusOnChange = (signal) => {
  const ref = useRef(null);
  useEffect(() => {
    if (signal) ref.current?.focus();
  }, [signal]);
  return ref;
};
