import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";
import AuthCard from "../components/AuthCard.jsx";
import Input from "../components/ui/Input.jsx";
import Button from "../components/ui/Button.jsx";
import ErrorMessage from "../components/ui/ErrorMessage.jsx";
import { validateLogin } from "../utils/validation.js";
import { focusFirstProblem } from "../utils/focus.js";

// where to go after login: the page the user wanted (ProtectedRoute saved it in location.state.from), or home
const wantedPage = (location) => {
  const from = location.state?.from;
  if (from && typeof from === "object" && typeof from.pathname === "string") return `${from.pathname}${from.search ?? ""}`;
  return typeof from === "string" ? from : "/";
};

export default function LoginPage() {
  const { login, isLoggedIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [values, setValues] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // already logged in (and not just now by this form): nothing to do here
  if (isLoggedIn && !submitting) return <Navigate to={wantedPage(location)} replace />;

  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget; // kept for later: currentTarget is empty after an await
    const found = validateLogin(values);
    setErrors(found);
    setServerError("");
    if (Object.keys(found).length) {
      focusFirstProblem(form);
      return;
    }

    setSubmitting(true);
    try {
      await login(values.email.trim(), values.password);
      toast.success("Welcome back!");
      navigate(wantedPage(location), { replace: true });
    } catch (err) {
      focusFirstProblem(form);
      setServerError(err.message); // for example "Invalid credentials"
      setSubmitting(false);
    }
  };

  return (
    <AuthCard
      title="Log in"
      subtitle="Welcome back to MegaShop."
      footer={
        <>
          New here?{" "}
          <Link to="/signup" state={location.state} className="font-medium text-indigo-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <ErrorMessage message={serverError} />
        <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set("email")} error={errors.email} />
        <Input label="Password" type="password" autoComplete="current-password" value={values.password} onChange={set("password")} error={errors.password} />
        <div className="text-right text-sm">
          <Link to="/forgot-password" className="font-medium text-indigo-700 hover:underline">
            Forgot your password?
          </Link>
        </div>
        <Button type="submit" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>
    </AuthCard>
  );
}
