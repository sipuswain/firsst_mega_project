// Moves the keyboard focus to a form field by its id (used for the first invalid field after a failed submit).
export const focusField = (id) => {
  const element = typeof document !== "undefined" ? document.getElementById(id) : null;
  element?.focus();
};

// After a failed submit: focus the first invalid field, or else the error box of the form.
// Runs after React has drawn the new errors (setTimeout 0).
export const focusFirstProblem = (form) => {
  setTimeout(() => {
    const target = form?.querySelector('[aria-invalid="true"]') ?? form?.querySelector('[role="alert"]');
    target?.focus();
  }, 0);
};
