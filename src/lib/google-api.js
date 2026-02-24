export async function refreshToken() {
    const saved = localStorage.getItem("google_token");
    if (!saved) return null;
    const { refresh_token } = JSON.parse(saved);
    if (!refresh_token) return null;

    try {
        const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: import.meta.env.VITE_CLIENT_ID,
                client_secret: import.meta.env.VITE_CLIENT_SECRET,
                refresh_token: refresh_token,
                grant_type: "refresh_token",
            }),
        });
        const data = await response.json();
        if (data.access_token) {
            const updated = JSON.parse(saved);
            updated.access_token = data.access_token;
            updated.expiry = Date.now() + data.expires_in * 1000;
            localStorage.setItem("google_token", JSON.stringify(updated));
        }
        return data;
    } catch (e) {
        console.error("Ошибка обновления токена", e);
        return null;
    }
}

export async function apiRequest(url, options = {}, token, setToken) {
    const makeRequest = (t) => fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options.headers,
            Authorization: `Bearer ${t}`,
        },
    });

    let response = await makeRequest(token);

    if (response.status === 401) {
        const newTokenData = await refreshToken();

        if (newTokenData?.access_token) {
            if (setToken) setToken(newTokenData.access_token);
            response = await makeRequest(newTokenData.access_token);
        }
    }

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(errorBody);
    }

    return response.json();
}
