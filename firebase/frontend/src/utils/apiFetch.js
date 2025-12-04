// src/utils/apiFetch.js

export async function apiFetch(url, opts = {}, navigate) {
    const res = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json", ...(opts.headers || {}) },
        ...opts,
    });

    if (res.status === 401 || res.status === 403) {
        // optional: read error body if you want to show a toast
        try {
            const data = await res.json();
            console.warn("[apiFetch] auth error:", data?.error);
        } catch { }
        if (navigate) navigate("/unauthorized", { replace: true });
        throw new Error("unauthorized");
    }

    return res;
}
