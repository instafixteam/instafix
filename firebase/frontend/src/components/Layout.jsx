// Layout.jsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import Navbar from "./Navbar";
import Home from "../pages/Home";
import Shop from "../pages/Shop";
import Contact from "../pages/Contact";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import AdminDashboard from "../pages/AdminDashboard";
import TechnicianDashboard from "../pages/TechnicianDashboard";
import PendingTechnicianOnboarding from "../pages/TechnicianOnbording";
import ProtectedRoute from "./ProtectedRoute";
import Profile from "../pages/Profile";
import ServicesPage from "../pages/ServicesPage";
import Unauthorized from "../pages/Unauthorized";
import AdminDashRedirect from "../routes/AdminDashboardRedirect";
import TechnicianDashRedirect from "../routes/TechnicianDashRedirect";
import TechnicianNav from "./TechnicianNav";
import ResetPassword from "../pages/ResetPassword";
import AdminNav from "./AdminNav";
import MfaSettings from "../pages/MfaSettings";
import TechnicianSignup from "../pages/Technician_Signup";
import Footer from "./footer";
import MFASetup from "../pages/MFASetup.jsx"; // <-- ensure path is correct and default export

import PayDemo from "../pages/PayDemo";
import PaymentSuccess from "../pages/PaymentSuccess";
import PaymentReturn from "../pages/PaymentReturn";
import PaymentFailed from "../pages/PaymentFailed";
import OrdersPage from "../pages/Orders.jsx";

// import { BrowserRouter, Routes, Route } from "react-router-dom";
import CartPage from "../pages/CartPage";

export default function Layout() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith("/admin-dashboard");
  const isTechnicianPage = location.pathname.startsWith("/technician-dashboard");
  const isOnboarding = location.pathname.startsWith("/technician-onboarding");

  return (
    <>
      <div id="recaptcha-container" style={{ height: 0, width: 0, overflow: "hidden" }} />

      {!isAdminPage && !isTechnicianPage && <Navbar />}
      {isTechnicianPage && <TechnicianNav />}
      {isAdminPage && <AdminNav />}

      <div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/home" element={<Navigate to="/" replace />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/services" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <ServicesPage />
            </ProtectedRoute>} />
          <Route path="/contact" element={<Contact />} />s
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/technician-signup" element={<TechnicianSignup />} />

          <Route path="/settings/mfa" element={<MfaSettings />} />
          <Route path="/mfa-setup" element={<MFASetup />} /> {/* <-- this one */}

          {/* Payments */}
          <Route path="/pay" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <PayDemo />
            </ProtectedRoute>
          } />
          <Route path="/payment-return" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <PaymentReturn />
            </ProtectedRoute>
          } />
          <Route path="/payment-success" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <PaymentSuccess />
            </ProtectedRoute>
          } />
          <Route path="/payment-failed" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <PaymentFailed />
            </ProtectedRoute>
          } />

          <Route
            path="/orders"
            element={
              <ProtectedRoute allowedRoles={["customer"]}>
                <OrdersPage />
              </ProtectedRoute>
            }
          />

          {/* Protected user routes */}
          <Route
            path="/profile/:uid"
            element={
              <ProtectedRoute allowedRoles={["customer", "technician"]}>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route path="/cart" element={
            <ProtectedRoute allowedRoles={["customer"]}>
              <CartPage />
            </ProtectedRoute>} />
          {/* Admin */}



          <Route
            path="/admin-dashboard"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashRedirect />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin-dashboard/:uid"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Technician */}
          <Route
            path="/technician-dashboard"
            element={
              <ProtectedRoute allowedRoles={["technician", "pending-technician"]}>
                <TechnicianDashRedirect />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician-dashboard/:uid"
            element={
              <ProtectedRoute allowedRoles={["technician", "pending-technician"]}>
                <TechnicianDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician-dashboard/:uid/profile"
            element={
              <ProtectedRoute allowedRoles={["technician"]}>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/technician-onboarding"
            element={
              <ProtectedRoute allowedRoles={["pending_technician"]}>
                <PendingTechnicianOnboarding />
              </ProtectedRoute>
            }
          />



          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* Optional 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {!isAdminPage && !isTechnicianPage && <Footer />}
    </>
  );
}
