
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import Cookies from "js-cookie";
import { fetchUserData, linkLogin, getUserCategories } from "../services/UserService";
export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const navigate = useNavigate();

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
        if (token) {
            setUserToken(token);
            getCategories(token)
        }
        loadUserData()
    }, []);
    const getCategories = async (userToken) => {
        const categories = await getUserCategories(userToken);
        setCategories(categories)
    };
    
    return (
        <AuthContext.Provider value={{ user, loadUserData, setUser, logout, userToken, setUserToken, authLoading, categories,setCategories }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
