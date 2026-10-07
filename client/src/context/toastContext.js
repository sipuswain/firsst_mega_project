import { createContext } from "react";

// The value is made by ToastProvider. Read it with the useToast() hook.
export const ToastContext = createContext(null);
