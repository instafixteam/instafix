// src/pages/Profile.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthContext } from "../Context/AuthContext";
import { auth } from "../firebase";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";

export default function Profile() {
    const { uid } = useParams();
    const { currentUser } = useAuthContext();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [editMode, setEditMode] = useState(false);
    // Use lowercase keys for form state
    const [formValues, setFormValues] = useState({ displayname: "", address: "", phoneNumber: "" });
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    const handleEditToggle = () => {
        setEditMode((prev) => !prev);
        setSaveError(""); // Clear any previous errors
        if (profile) {
            setFormValues({
                displayname: profile.displayname || profile.displayName || "",
                address: profile.address || "",
                phoneNumber: profile.phonenumber || profile.phoneNumber || "",
            });
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormValues((prev) => ({ ...prev, [name]: value }));
    };

    // Validation patterns (should match backend)
    const namePattern = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]{1,99}$/u;
    const addressPattern = /^[\p{L}\p{M}\p{N}\s.,'#()\-/]{5,500}$/u;
    const phonePattern = /^\+?[0-9]{7,15}$/;

    const validateForm = (values) => {
        const errors = [];
        if (!values.displayname || values.displayname.length < 2) {
            errors.push("Display Name must be at least 2 characters long.");
        } else if (!namePattern.test(values.displayname)) {
            errors.push("Display Name may include letters, spaces, apostrophes, periods, and hyphens only.");
        }
        if (!values.address || values.address.length < 5) {
            errors.push("Address must be at least 5 characters long.");
        } else if (!addressPattern.test(values.address)) {
            errors.push("Address may include letters, numbers, spaces, commas, periods, apostrophes, hyphens, slashes, parentheses and # only.");
        }
        if (values.phoneNumber && values.phoneNumber.length > 0 && !phonePattern.test(values.phoneNumber)) {
            errors.push("Phone number must be 7-15 digits. Use only numbers 0-9, optionally starting with +.");
        }
        return errors;
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveError("");
        // Frontend validation first
        const validationErrors = validateForm(formValues);
        if (validationErrors.length > 0) {
            setSaveError(
                <div>
                    <div>Please correct the following:</div>
                    <ul className="mt-2 list-disc list-inside text-red-700">
                        {validationErrors.map((msg, i) => (
                            <li key={i}>{msg}</li>
                        ))}
                    </ul>
                </div>
            );
            setSaving(false);
            return;
        }
        try {
            const token = await auth.currentUser.getIdToken();
            /*console.log("Saving profile for:", profile.uid);
            console.log("Payload:", formValues);
            console.log("URL:", `${import.meta.env.VITE_API_BASE_URL}/api/users/${profile.uid}`);
            console.log("Token:", token);*/

            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api/users/${profile.uid}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        displayname: formValues.displayname,
                        address: formValues.address,
                        phoneNumber: formValues.phoneNumber || "",
                    }),
                }
            ).catch(err => {
                console.error("🚨 Network error:", err);
                throw err;
            });;

            const text = await res.text();

            console.log("Response text:", text);
            console.log("Response status:", res.status);

            if (!res.ok) {
    let friendlyMessage = "Unable to save your profile. Please check your input and try again.";
    let errorDetails = [];

    try {
        const errorData = JSON.parse(text);
        // If the backend provides a message, use it, otherwise fallback
        friendlyMessage = errorData.error || friendlyMessage;

        if (Array.isArray(errorData.details)) {
            errorDetails = errorData.details;
        }
    } catch {
        // If response is not JSON, use it as message if available
        if (text) friendlyMessage = text;
    }

    // Display in user-friendly format
    if (errorDetails.length > 0) {
        setSaveError(
            <div>
                <div>{friendlyMessage}</div>
                <ul className="mt-2 list-disc list-inside text-red-700">
                    {errorDetails.map((msg, i) => (
                        <li key={i}>{msg}</li>
                    ))}
                </ul>
            </div>
        );
    } else {
        setSaveError(friendlyMessage);
    }

    throw new Error(friendlyMessage);
}


            let updated = null;
            try {
                updated = text ? JSON.parse(text) : null;
            } catch (e) {
                console.warn("No valid JSON response");
            }

            if (updated && updated.user) {
                setProfile(updated.user);
            }

            await updateProfile(auth.currentUser, {
                displayName: formValues.displayname,
            });

            setEditMode(false);
            setSaveError(""); // Clear error on success

        } catch (err) {
            console.error("❌ Save error:", err);
            setSaveError(err.message || "Could not save profile changes.");
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordChange = async () => {
        try {
            await sendPasswordResetEmail(auth, profile.email);
            alert(`Password reset email sent to ${profile.email}`);
        } catch (err) {
            console.error("❌ Password reset error:", err);
            alert("Could not send password reset email");
        }
    };

    // Helper to mask values in view mode
    const maskValue = (val, type) => {
        if (!val) return "";
        // Use backend-masked value for display
        if (type === "phone") {
            // Mask all but last 2 digits
            return val.replace(/.(?=..)/g, "*");
        }
        if (type === "address") {
            // Mask all but last 6 chars
            return val.length > 6 ? "****" + val.slice(-6) : "****";
        }
        return val;
    };

    useEffect(() => {
        if (!currentUser) {
            console.log("🚫 currentUser is null — waiting...");
            return;
        }

        const fetchProfile = async () => {
            console.log("📡 Fetching profile for UID:", uid);
            try {
                const token = await currentUser.getIdToken();
                console.log("✅ Got token for:", currentUser.uid);
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api/users/${uid}`,
                    {
                        headers: { "Authorization": `Bearer ${token}` },
                    }
                );
                console.log("📥 Response status:", res.status);

                if (res.ok) {
                    const data = await res.json();
                    console.log("✅ Data:", data);
                    setProfile(data.user);
                    setFormValues({
                        displayname: data.user.displayname || data.user.displayName || "",
                        address: data.user.address || "",
                        phoneNumber: data.user.phonenumber || data.user.phoneNumber || "",
                    });
                } else {
                    const errMsg = await res.text();
                    setError(errMsg || "Profile not found");
                }
            } catch (err) {
                console.error("❌ Network error:", err);
                setError("Failed to load profile.");
            } finally {
                setLoading(false);
            }
        };

        fetchProfile();
    }, [currentUser, uid]);

    if (loading) return <div className="pt-24 text-center">Loading profile...</div>;
    if (error) return <div className="pt-24 text-center text-red-600">{error}</div>;
    if (!profile) return <div className="pt-24 text-center">No profile found</div>;

    return (
        <div className="pt-24 max-w-3xl mx-auto px-4">
            <h1 className="text-2xl font-bold mb-6">My Profile</h1>

            <div className="bg-white rounded-lg shadow p-6 flex flex-col gap-4">
                {/* Profile header */}
                <div className="flex items-center gap-4">
                    <img
                        src="https://avatar.iran.liara.run/public/93"
                        alt="Profile"
                        className="w-24 h-24 rounded-full border object-cover"
                    />
                    <div>
                        <h2 className="text-xl font-semibold">{profile.displayname || profile.displayName || currentUser.displayName || "No name"}</h2>
                        <p className="text-gray-600">{profile.email}</p>
                    </div>
                </div>

                {/* Error message */}
                {saveError && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200">
                        {saveError}
                    </div>
                )}

                {/* Editable fields */}
                <div>
                    <label className="block text-sm font-medium text-gray-700">Display Name</label>
                    <input
                        type="text"
                        name="displayname"
                        value={formValues.displayname}
                        onChange={handleChange}
                        disabled={!editMode}
                        placeholder={profile.displayname || profile.displayName || currentUser.displayName || "No name"}
                        className={`mt-1 p-2 w-full border rounded-lg ${!editMode ? "bg-gray-100 cursor-not-allowed" : ""}`}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                        type="email"
                        value={profile.email}
                        disabled
                        className="mt-1 p-2 w-full border rounded-lg bg-gray-100"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Phone number</label>
                    {!editMode ? (
                        <div className="mt-1 p-2 w-full border rounded-lg bg-gray-100 text-gray-700 select-none">
                            {maskValue(profile.phonenumber || profile.phoneNumber, "phone")}
                            <span className="ml-2 text-xs text-gray-400">(Click Edit to view/change full number)</span>
                        </div>
                    ) : (
                        <input
                            type="tel"
                            name="phoneNumber"
                            value={formValues.phoneNumber}
                            onChange={handleChange}
                            pattern="^\+?[0-9\s\-()]{7,}$"
                            title="Enter a valid phone number"
                            className="mt-1 p-2 w-full border rounded-lg"
                        />
                    )}
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700">Address</label>
                    {!editMode ? (
                        <div className="mt-1 p-2 w-full border rounded-lg bg-gray-100 text-gray-700 select-none">
                            {maskValue(profile.address, "address")}
                            <span className="ml-2 text-xs text-gray-400">(Click Edit to view/change full address)</span>
                        </div>
                    ) : (
                        <input
                            type="text"
                            name="address"
                            value={formValues.address}
                            onChange={handleChange}
                            className="mt-1 p-2 w-full border rounded-lg"
                        />
                    )}
                </div>

                {/* Buttons row */}
                <div className="flex gap-3 mt-4">
                    {!editMode ? (
                        <button
                            onClick={handleEditToggle}
                            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800"
                        >
                            ✏️ Edit
                        </button>
                    ) : (
                        <>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-2 bg-bluebrand text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "💾 Save"}
                            </button>
                            <button
                                onClick={handleEditToggle}
                                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400 hover:text-black"
                            >
                                Cancel
                            </button>
                        </>
                    )}

                    <button
                        onClick={handlePasswordChange}
                        className="ml-auto px-4 py-2 bg-red-400 text-white rounded-lg hover:bg-red-700"
                    >
                        🔐 Change Password
                    </button>
                </div>
            </div>
        </div>
    );
}