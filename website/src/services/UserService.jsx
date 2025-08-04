import Cookies from "js-cookie";

const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const fetchUserData = async () => {
    const token = Cookies.get("userToken");
    if (!token) return null;

    try {
        const response = await fetch(`${BASE_URL}/v1/users`, {
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": token,
            },
        });

        if (!response.ok) {
            Cookies.remove("userToken");
            return null;
        }

        const data = await response.json();
        return data;
    } catch (err) {
        console.error("Error fetching user data:", err);
        Cookies.remove("userToken");
        return null;
    }
};

export const linkLogin = async (token) => {
    try {
        const response = await fetch(`${BASE_URL}/v1/users/login?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Login link expired or invalid.");
        }

        const authToken = data.responseBody["x-auth-token"];
        Cookies.set("userToken", authToken, { expires: 100 });
        return {
            token: authToken,
            user: data.user,
        };
    } catch (err) {
        console.error("link login error:", err);
        throw err;
    }
};

// services/UserService.js
export const getUserCategories = async (userToken) => {
    const res = await fetch(`${BASE_URL}/v1/users/categories`, {
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
    });
    const responseJson = await res.json()
    return responseJson
};

export const saveUserCategories = async (categories,userToken) => {
    const res = await fetch(`${BASE_URL}/v1/users/categories`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "x-auth-token": userToken,
        },
        body: JSON.stringify({ categories }),
    });
    const responseJson = await res.json()
    return responseJson
};

// services/UserService.js
export const googleLogin = async (credential) => {
    try {
        const response = await fetch(`${BASE_URL}/v1/users/google-login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ credential }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || "Google login failed.");
        }

        const authToken = data.responseBody["x-auth-token"];
        Cookies.set("userToken", authToken, { expires: 100 });

        return {
            userToken: authToken,
            user: data.user,
        };
    } catch (err) {
        console.error("Google login error:", err);
        return { error: "Something went wrong. Please try again." };
    }
};
