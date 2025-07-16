
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import Cookies from "js-cookie";
export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const navigate = useNavigate();
    const token = Cookies.get('userToken')
    const fetchUserData = async () => {
        try {
            const token = Cookies.get('userToken');
            if (!token) {
                throw new Error("No token found");
            }

            const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/users`, {
                headers: {
                    "Content-Type": "application/json",
                    'x-auth-token': token,
                },
            });

            if (response.status === 401) {
                // 🔐 Unauthorized: Log out
                setUser(null);
                Cookies.remove('userToken');
                navigate("/login");
                return;
            }

            if (!response.ok) {
                throw new Error("Failed to fetch user data");
            }

            const data = await response.json();
            setUser(data);

        } catch (error) {
            console.error("Error loading user data:", error);

            setUser(null);
            Cookies.remove('userToken');
            navigate("/login");
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
        fetchUserData()
    }, []);

    return (
        <AuthContext.Provider value={{ user, login, logout, userToken }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
