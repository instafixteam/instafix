// utils/authFetch.js
import { getAuth, onAuthStateChanged } from "firebase/auth";

let authReadyPromise = null;

function authReady() {
  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const auth = getAuth();
      const unsub = onAuthStateChanged(auth, (user) => {
        unsub();
        console.log('Auth state resolved:', user ? user.uid : 'No user');
        resolve(user);
      });

      // If auth is already initialized, resolve immediately
      if (auth.currentUser) {
        unsub();
        resolve(auth.currentUser);
      }
    });
  }
  return authReadyPromise;
}

export async function authFetch(input, init = {}) {
  try {
    //console.log('AuthFetch called for:', input);

    // Wait for auth to be ready
    const user = await authReady();
    //console.log('Auth user:', user ? user.uid : 'No user');

    const headers = new Headers(init.headers || {});

    if (user) {
      try {
        const token = await user.getIdToken(true); // Force refresh to get latest token
        console.log('Got ID token:', token ? 'Yes' : 'No');
        headers.set("Authorization", `Bearer ${token}`);
      } catch (tokenError) {
        console.error('Failed to get ID token:', tokenError);
        // Continue without token, will get 401 from server
      }
    }

    // Ensure content type is set for requests with body
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(input, {
      ...init,
      headers,
      credentials: "include"
    });

    console.log('AuthFetch response status:', response.status);

    if (response.status === 401) {
      console.error('Authentication failed - redirecting to login');
      // Clear any stale auth state
      const auth = getAuth();
      await auth.signOut();
      window.location.href = '/login';
      throw new Error('Authentication required');
    }

    return response;
  } catch (error) {
    console.error('AuthFetch error:', error);
    throw error;
  }
}