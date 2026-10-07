import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ToastProvider } from "./context/ToastProvider.jsx";
import { AuthProvider } from "./context/AuthProvider.jsx";
import { CartProvider } from "./context/CartProvider.jsx";
import "./index.css";

// Order matters: the router first (AuthProvider uses navigate), then toasts, then auth, then the cart (it needs the user).
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>
);
