// Layout.jsx
import { Routes, Route, useLocation } from "react-router-dom";
import Navbar from "./Navbar";
import Home from "../pages/Home";
import Shop from "../pages/Shop";
import Contact from "../pages/Contact";
import Login from "../pages/Login";
import Signup from "../pages/Signup";
import AdminDashboard from "../pages/AdminDashboard";
import ServicesPage from "../pages/ServicesPage"

export default function Layout() {
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith("/admin-dashboard");

  return (
    <>
      {!isAdminPage && <Navbar />}
      <div>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Shop />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/services" element={<ServicesPage />} />
        </Routes>
      </div>
    </>
  );
}
