import { useState } from "react";
import { Link } from "react-router-dom";
import { forgotPasswordRequest } from "../api/auth.js";
import AuthCard from "../components/AuthCard.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { validateForgot } from "../utils/validation.js";
import { focusFirstProblem } from "../utils/focus.js";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget; // kept for later: currentTarget is empty after an await
    const found = validateForgot({ email });
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) {
      focusFirstProblem(form);
      return;
    }

    setSubmitting(true);
    try {
      await forgotPasswordRequest(email.trim());
      setSent(true);
    } catch (err) {
      focusFirstProblem(form);
      // 404 = no account with this email. We show the SAME neutral message, so nobody can find out which emails are registered.
      if (err.status === 404) setSent(true);
      else setServerError(err.message);
    }
    setSubmitting(false);
  };

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to choose a new one."
      footer={
        <Link to="/login" className="font-medium text-indigo-700 hover:underline">
          Back to log in
        </Link>
      }
    >
      {sent ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
          If an account exists for that email, a reset link is on its way. Please check your inbox (and the spam folder). The link works for a short time only.
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <ErrorMessage message={serverError} />
          <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
          <Button type="submit" loading={submitting} className="w-full">
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
