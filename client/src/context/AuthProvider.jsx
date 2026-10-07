import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AuthContext } from "./authContext.js";
import { useToast } from "../hooks/useToast.js";
import { setUnauthorizedHandler } from "../api/http.js";
import { loginRequest, signupRequest, profileRequest } from "../api/auth.js";
import { clearToken, getToken, saveToken } from "../utils/tokenStorage.js";

// Keeps "who is logged in" for the whole app: user, login, signup, logout.
export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [user, setUser] = useState(null);
  // "loading" only while we check a saved token with GET /api/auth/profile on page load
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // the newest location, so the 401 handler can remember the page the user was on
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });

  // Saves the token and the user (after login, signup, change password)
  const applySession = useCallback((token, nextUser) => {
    saveToken(token);
    setUser(nextUser);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  // A 401 on a logged-in call = the token is wrong or expired: log out and go to the login page
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearToken();
      setUser(null);
      toast.error("Your session has ended. Please log in again.");
      navigate("/login", { replace: true, state: { from: locationRef.current } });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, toast]);

  // On page load: when a token is saved, ask the backend who it belongs to
  useEffect(() => {
    if (!getToken()) return;
    const controller = new AbortController();
    profileRequest(controller.signal)
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        // a 401 was already handled above. For other problems (server down) we do not delete the token.
        if (err.status === 401) clearToken();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false); // (React StrictMode runs this effect twice in development)
      });
    return () => controller.abort();
  }, []);

  const login = useCallback(
    async (email, password) => {
      const data = await loginRequest({ email, password });
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const signup = useCallback(
    async (name, email, password) => {
      const data = await signupRequest({ name, email, password });
      applySession(data.token, data.user);
      return data.user;
    },
    [applySession]
  );

  const value = useMemo(
    () => ({ user, isLoggedIn: Boolean(user), loading, login, signup, logout, applySession }),
    [user, loading, login, signup, logout, applySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
