import { Menu, MenuButton, MenuItem, MenuItems, Transition, Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import { Fragment } from "react";
import logo from "../assets/InstaFixLogo.png";

export default function AdminDashboard() {
  return (
    <div className="min-h-full">
      <nav className="bg-sky">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Left: Logo */}
            <div className="flex items-center">
              <img src={logo} alt="Your Company" className="size-8" />

              {/* Desktop Nav Links */}
              <div className="hidden md:block ml-10 space-x-4">
                <a href="#" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">Dashboard</a>
                <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-black hover:bg-white/5 hover:text-blue-700">Technician Applications</a>
                <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-black hover:bg-white/5 hover:text-blue-700">Services</a>
                <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-black hover:bg-white/5 hover:text-blue-700">Users</a>
                <a href="#" className="rounded-lg px-3 py-2 text-sm font-medium text-black hover:bg-white/5 hover:text-blue-700">Reports</a>
              </div>
            </div>

            {/* Right: Notifications + Profile Dropdown */}
            <div className="hidden md:block">
              <div className="ml-4 flex items-center">
                {/* Notifications */}
                <button
                  type="button"
                  className="relative rounded-full p-1 text-gray-400 hover:text-white focus:outline-2 focus:outline-offset-2 focus:outline-indigo-500"
                >
                  <span className="sr-only">View notifications</span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="size-6"
                  >
                    <path
                      d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* Profile dropdown */}
                <Menu as="div" className="relative ml-3">
                  <MenuButton className="relative flex max-w-xs items-center rounded-full focus:outline-none">
                    <img
                      src="https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=256&h=256&q=80"
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
                      <MenuItem as="a" href="#" className="block px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900">
                        Your Profile
                      </MenuItem>
                      <MenuItem as="a" href="#" className="block px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900">
                        Settings
                      </MenuItem>
                      <MenuItem as="a" href="#" className="block px-4 py-2 text-sm text-gray-700 data-[active]:bg-gray-100 data-[active]:text-gray-900">
                        Sign out
                      </MenuItem>
                    </MenuItems>
                  </Transition>
                </Menu>
              </div>
            </div>

            {/* Mobile menu button with Disclosure */}
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
                      <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-">
                        Dashboard
                      </a>
                      <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                        Technician Applications
                      </a>
                      <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                        Services
                      </a>
                      <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                        Users
                      </a>
                      <a href="#" className="block px-3 py-2 text-base font-medium text-black hover:bg-gray-100 rounded-lg">
                        Reports
                      </a>
                    </DisclosurePanel>
                  </>
                )}
              </Disclosure>
            </div>
          </div>
        </div>
      </nav>

      <header className="relative shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Dashboard
          </h1>
        </div>
      </header>

      <main>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {/* Admin content goes here */}
        </div>
      </main>
    </div>
  );
}
