
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import Cookies from "js-cookie";
export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const navigate = useNavigate();

    const fetchUserData = async () => {
        try {
            const token = Cookies.get('userToken');
            if (!token) {
                setAuthLoading(false);
                return;
            }

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/users`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': token,
                },
            });

            if (response.ok) {
                const data = await response.json();
                setUser(data);
            } else {
                setUser(null);
                Cookies.remove('userToken');
            }
        } catch (err) {
            console.error("Error loading user data:", err);
            setUser(null);
            Cookies.remove('userToken');
        } finally {
            setAuthLoading(false);
        }
    };



    const linkLogin = async (token) => {
    try {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/users/login?token=${token}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Login link expired or invalid.");
        }

        const authToken = data.responseBody["x-auth-token"];
        Cookies.set("userToken", authToken, { expires: 100 });
        setUserToken(authToken);
        setUser(data.user);
        navigate("/groups");
    } catch (err) {
        console.error("Magic login error:", err);
        alert(err.message); // ✅ show token-related errors
    }
};



    const login = async (email, password) => {
        try {
            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/users/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email, password }),
            });

            if (response.ok) {
                const data = await response.json();
                const token = data.responseBody["x-auth-token"]; // Adjust key if needed
                Cookies.set("userToken", token, { expires: 100 });
                setUserToken(token)
                setUser(data.user); // If your backend sends user object
                navigate("/groups");
            } else {
                alert("Invalid credentials");
            }
        } catch (error) {
            console.log("login error: ", error);
            alert(`${error}`);
        }
    };

    const logout = () => {
        setUser(null);
        Cookies.remove("userToken");
        navigate("/login");
    };
    useEffect(() => {
        const token = Cookies.get("userToken");
        if (token) setUserToken(token);
        fetchUserData()
    }, []);
    return (
        <AuthContext.Provider value={{ user, login, logout, userToken, authLoading, linkLogin }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
