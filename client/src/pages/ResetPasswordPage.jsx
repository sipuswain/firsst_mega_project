import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { resetPasswordRequest } from "../api/auth.js";
import { useToast } from "../hooks/useToast.js";
import AuthCard from "../components/AuthCard.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { PASSWORD_MIN, validateReset } from "../utils/validation.js";
import { focusFirstProblem } from "../utils/focus.js";

// Opened from the link in the email: /reset-password/:token
export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [values, setValues] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget; // kept for later: currentTarget is empty after an await
    const found = validateReset(values);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) {
      focusFirstProblem(form);
      return;
    }

    setSubmitting(true);
    try {
      await resetPasswordRequest(token, values);
      // the backend also returns a login token; we do not use it: the user logs in with the new password
      toast.success("Your password was changed. Please log in.");
      navigate("/login", { replace: true });
    } catch (err) {
      focusFirstProblem(form);
      setServerError(err.message); // for example "password token is invalid or expired"
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Choose a new password"
      footer={
        <Link to="/forgot-password" className="font-medium text-indigo-700 hover:underline">
          Ask for a new link
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorMessage message={serverError} />
        <Input label="New password" type="password" autoComplete="new-password" value={values.password} onChange={set("password")} error={errors.password} hint={`At least ${PASSWORD_MIN} characters`} />
        <Input label="Repeat the new password" type="password" autoComplete="new-password" value={values.confirmPassword} onChange={set("confirmPassword")} error={errors.confirmPassword} />
        <Button type="submit" loading={submitting} className="w-full">
          Change password
        </Button>
      </form>
    </AuthCard>
  );
}
