import { Route, Routes } from "react-router-dom";
import Layout from "./components/layout/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import ResetPasswordPage from "./pages/ResetPasswordPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import CartPage from "./pages/CartPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import OrdersPage from "./pages/OrdersPage.jsx";
import OrderDetailPage from "./pages/OrderDetailPage.jsx";
import OrderSuccessPage from "./pages/OrderSuccessPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import AdminLayout from "./components/admin/AdminLayout.jsx";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage.jsx";
import AdminOrdersPage from "./pages/admin/AdminOrdersPage.jsx";
import AdminOrderDetailPage from "./pages/admin/AdminOrderDetailPage.jsx";
import AdminProductsPage from "./pages/admin/AdminProductsPage.jsx";
import AdminProductFormPage from "./pages/admin/AdminProductFormPage.jsx";
import AdminCollectionsPage from "./pages/admin/AdminCollectionsPage.jsx";
import AdminCouponsPage from "./pages/admin/AdminCouponsPage.jsx";
import AdminCustomersPage from "./pages/admin/AdminCustomersPage.jsx";

// All the pages of the app. Every page sits inside <Layout> (header + footer).
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* public pages */}
        <Route path="/" element={<HomePage />} />
        <Route path="/product/:id" element={<ProductPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

        {/* pages that need a login */}
        <Route element={<ProtectedRoute />}>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/order/:id/success" element={<OrderSuccessPage />} />
        </Route>

        {/* admin pages: a logged out visitor goes to login, a normal user goes to the home page (with a message).
            The server checks the ADMIN role on every admin call as well: this only keeps the pages away from other people. */}
        <Route element={<ProtectedRoute roles={["ADMIN"]} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboardPage />} />
            <Route path="orders" element={<AdminOrdersPage />} />
            <Route path="orders/:id" element={<AdminOrderDetailPage />} />
            <Route path="products" element={<AdminProductsPage />} />
            <Route path="products/new" element={<AdminProductFormPage />} />
            <Route path="products/:id/edit" element={<AdminProductFormPage />} />
            <Route path="collections" element={<AdminCollectionsPage />} />
            <Route path="coupons" element={<AdminCouponsPage />} />
            <Route path="customers" element={<AdminCustomersPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
