
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import Cookies from "js-cookie";
import { fetchUserData, linkLogin } from "../services/UserService";
export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    const navigate = useNavigate();

    const handleLinkLogin = async (token) => {
        try {
            const { user, token: authToken } = await linkLogin(token);
            setUser(user);
            setUserToken(authToken);
            // handle pending redirects here...
        } catch (err) {
            alert(err.message);
        }
    };

    const loadUserData = async () => {
        const user = await fetchUserData();
        setUser(user);
        setAuthLoading(false);
    };



    const logout = () => {
        setUser(null);
        Cookies.remove("userToken");
        navigate("/login");
    };
    useEffect(() => {
        const token = Cookies.get("userToken");
        if (token) setUserToken(token);
        loadUserData()
    }, []);
    return (
        <AuthContext.Provider value={{ user, logout, userToken, authLoading, handleLinkLogin }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
