import { useState, useEffect } from "react";
import { useGoogleLogin } from "@react-oauth/google";
import { translateGoogleError } from "../lib/formatters";

export function useAuth() {
    const [authState, setAuthState] = useState({ token: null, isLoading: false, error: null });

    useEffect(() => {
        const saved = localStorage.getItem("google_token");
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Date.now() < parsed.expiry) {
                setAuthState(prev => ({ ...prev, token: parsed.access_token }));
            } else {
                localStorage.removeItem("google_token");
            }
        }
    }, []);

    const login = useGoogleLogin({
        onSuccess: async (codeResponse) => {
            try {
                setAuthState(prev => ({ ...prev, isLoading: true, error: null }));
                const resp = await fetch("https://oauth2.googleapis.com/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        code: codeResponse.code,
                        client_id: import.meta.env.VITE_CLIENT_ID,
                        client_secret: import.meta.env.VITE_CLIENT_SECRET,
                        redirect_uri: window.location.origin,
                        grant_type: "authorization_code",
                    }),
                });

                const tokens = await resp.json();
                if (!resp.ok) throw new Error(translateGoogleError(tokens.error));

                localStorage.setItem("google_token", JSON.stringify({
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    expiry: Date.now() + tokens.expires_in * 1000
                }));

                setAuthState({ token: tokens.access_token, isLoading: false, error: null });
            } catch (err) {
                setAuthState({ token: null, isLoading: false, error: err.message });
            }
        },
        flow: "auth-code",
        scope: "https://www.googleapis.com/auth/spreadsheets",
    });

    const logout = () => {
        setAuthState({ token: null, isLoading: false, error: null });
        localStorage.removeItem("google_token");
    };

    return { authState, login, logout };
}
