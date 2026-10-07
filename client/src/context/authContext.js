import { createContext } from "react";

// The value is made by AuthProvider. Read it with the useAuth() hook.
export const AuthContext = createContext(null);
