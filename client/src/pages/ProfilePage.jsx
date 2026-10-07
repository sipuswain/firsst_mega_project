import { useState } from "react";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import { changePasswordRequest } from "../api/auth.js";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { PASSWORD_MIN, validateChangePassword } from "../utils/validation.js";
import { focusFirstProblem } from "../utils/focus.js";

const EMPTY = { oldPassword: "", newPassword: "" };

export default function ProfilePage() {
  const { user, applySession } = useAuth();
  const toast = useToast();
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget; // kept for later: currentTarget is empty after an await
    const found = validateChangePassword(values);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) {
      focusFirstProblem(form);
      return;
    }

    setSubmitting(true);
    try {
      const data = await changePasswordRequest(values);
      applySession(data.token, data.user); // the backend gives a fresh token: keep using it
      setValues(EMPTY);
      toast.success("Your password was changed.");
    } catch (err) {
      focusFirstProblem(form);
      setServerError(err.message); // for example "Old password is incorrect"
    }
    setSubmitting(false);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">Your profile</h1>

      <section aria-labelledby="account-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="account-heading" className="text-lg font-semibold">
          Account
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-sm text-slate-500">Name</dt>
            <dd className="break-words font-medium">{user.name}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-sm text-slate-500">Email</dt>
            <dd className="break-words font-medium">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="font-medium">{user.role}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="password-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="password-heading" className="text-lg font-semibold">
          Change password
        </h2>
        <form onSubmit={submit} noValidate className="mt-4 max-w-sm space-y-4">
          <ErrorMessage message={serverError} />
          <Input label="Old password" type="password" autoComplete="current-password" value={values.oldPassword} onChange={set("oldPassword")} error={errors.oldPassword} />
          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={values.newPassword}
            onChange={set("newPassword")}
            error={errors.newPassword}
            hint={`At least ${PASSWORD_MIN} characters`}
          />
          <Button type="submit" loading={submitting}>
            Change password
          </Button>
        </form>
      </section>
    </div>
  );
}
