import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import AuthCard from "../components/AuthCard.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { NAME_MAX, PASSWORD_MIN, validateSignup } from "../utils/validation.js";
import { focusFirstProblem } from "../utils/focus.js";

export default function SignupPage() {
  const { signup, isLoggedIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isLoggedIn && !submitting) return <Navigate to="/" replace />;

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget; // kept for later: currentTarget is empty after an await
    const found = validateSignup(values);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) {
      focusFirstProblem(form);
      return;
    }

    setSubmitting(true);
    try {
      await signup(values.name.trim(), values.email.trim(), values.password);
      toast.success("Your account is ready.");
      const from = location.state?.from;
      navigate(from && typeof from.pathname === "string" ? `${from.pathname}${from.search ?? ""}` : "/", { replace: true });
    } catch (err) {
      focusFirstProblem(form);
      setServerError(err.message); // for example "user already exists"
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="It only takes a minute."
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" state={location.state} className="font-medium text-indigo-700 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorMessage message={serverError} />
        <Input label="Name" type="text" autoComplete="name" maxLength={NAME_MAX + 20} value={values.name} onChange={set("name")} error={errors.name} hint={`At most ${NAME_MAX} characters`} />
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set("email")} error={errors.email} />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={set("password")}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters`}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Sign up
        </Button>
      </form>
    </AuthCard>
  );
}
