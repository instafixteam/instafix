// src/components/Footer.jsx
import { Link } from "react-router-dom";

export default function Footer() {
    return (
        <footer className="bg-offwhite text-center py-6 mt-10 border-t border-gray-200">
            <p className="text-gray-600 text-sm">
                © {new Date().getFullYear()} InstaFix — All rights reserved.
            </p>

            <div className="mt-3 flex justify-center gap-4 text-sm">
                <Link to="/contact" className="text-bluebrand hover:underline">
                    Contact
                </Link>
                <Link to="/services" className="text-bluebrand hover:underline">
                    Services
                </Link>
                <Link to="/technician-signup" className="text-bluebrand font-semibold hover:underline">
                    Become a Technician
                </Link>
            </div>
        </footer>
    );
}
