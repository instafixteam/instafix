import {
    Menu, MenuButton, MenuItem, MenuItems,
    Transition, Disclosure, DisclosureButton, DisclosurePanel
} from "@headlessui/react";
import { Fragment, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

// Prefer AuthContext (RBAC branch) if available, otherwise fall back to the hook (main branch)
import { useAuthContext } from "../Context/AuthContext";
import useAuthState from "../hooks/useAuthState";

import logo from "../assets/InstaFixLogo.png";

const linkBase = "px-3 py-2 rounded-lg text-sm font-medium transition-colors";
const linkIdle = "text-gray-700 menuButton transition";
const linkActive = "menuButton";

const API_BASE =
    (import.meta?.env?.VITE_API_BASE && String(import.meta.env.VITE_API_BASE)) ||
    "http://localhost:5000"; // matches merged backend default; change if needed

export default function TechnicianNav() {
    const [open, setOpen] = useState(false);
    const navigate = useNavigate();

    // Get user from context if present; otherwise from custom hook
    let ctxUser;
    try {
        ctxUser = useAuthContext?.();
    } catch {
        ctxUser = null;
    }

    const hookUser = useAuthState?.();
    const currentUser = ctxUser?.currentUser || hookUser || null;

    const handleLogout = async () => {
        try {
            // Firebase sign out
            await signOut(auth);

            // Destroy session on backend (main branch behavior)
            await fetch(`${API_BASE}/api/logout`, {
                method: "POST",
                credentials: "include",
            });

            navigate("/login");
        } catch (err) {
            console.error("Logout failed:", err);
            alert("Failed to logout. Try again.");
        }
    };

    return (
        <nav className="bg-black">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    {/* Left: Logo & nav */}
                    <div className="flex items-center">
                        <img src={logo} alt="InstaFix" className="size-8" />
                        <div className="hidden md:block ml-10 space-x-4">
                            <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-white">Dashboard</a>
                            <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-white">Service Requests</a>
                            <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-white">Payments</a>
                            <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-white">Service History</a>
                        </div>
                    </div>

                    {/* Right: Profile */}
                    <div className="hidden md:block">
                        <div className="ml-4 flex items-center">
                            <Menu as="div" className="relative ml-3">
                                <MenuButton className="relative flex max-w-xs items-center rounded-full focus:outline-none">
                                    <img
                                        src="https://avatar.iran.liara.run/public/23"
                                        alt=""
                                        className="size-8 rounded-full outline -outline-offset-1 outline-white/10"
                                    />
                                </MenuButton>
                                <Transition
                                    as={Fragment}
                                    enter="transition ease-out duration-100"
                                    enterFrom="transform opacity-0 scale-95"
                                    enterTo="transform opacity-100 scale-100"
                                    leave="transition ease-in duration-75"
                                    leaveFrom="transform opacity-100 scale-100"
                                    leaveTo="transform opacity-0 scale-95"
                                >
                                    <MenuItems className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-lg bg-white py-1 shadow-lg focus:outline-none">
                                        <MenuItem
                                            as="a"
                                            href={`/profile/${currentUser?.uid}`}
                                            className="block px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900"
                                        >
                                            Your Profile
                                        </MenuItem>
                                        <MenuItem
                                            as="button"
                                            onClick={handleLogout}
                                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900"
                                        >
                                            Sign out
                                        </MenuItem>
                                    </MenuItems>
                                </Transition>
                            </Menu>
                        </div>
                    </div>

                    {/* Mobile menu */}
                    <div className="md:hidden">
                        <Disclosure>
                            {({ open }) => (
                                <>
                                    <DisclosureButton className="inline-flex items-center justify-center rounded-lg p-2 text-gray-400 hover:bg-white/5 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500">
                                        <span className="sr-only">Open main menu</span>
                                        {open ? (
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        ) : (
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-6">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                                            </svg>
                                        )}
                                    </DisclosureButton>

                                    <DisclosurePanel className="absolute top-16 z-50 left-0 right-0 bg-offwhite shadow-md rounded-lg p-4 space-y-2">
                                        <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                                            Dashboard
                                        </a>
                                        <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                                            Service Requests
                                        </a>
                                        <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                                            Payments
                                        </a>
                                        <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                                            Service History
                                        </a>

                                        {/* NEW: Edit profile */}
                                        <a
                                            href={`/technician-dashboard/${currentUser?.uid}/profile`}
                                            className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg"
                                        >
                                            Edit Profile
                                        </a>

                                        {/* NEW: Logout */}
                                        <button
                                            onClick={handleLogout}
                                            className="w-full text-left px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg"
                                        >
                                            Logout
                                        </button>
                                    </DisclosurePanel>
                                </>
                            )}
                        </Disclosure>
                    </div>
                </div>
            </div>
        </nav>
    )
};