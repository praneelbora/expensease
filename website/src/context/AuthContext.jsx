
import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ Correct import
import Cookies from "js-cookie";
import { fetchUserData, linkLogin, getUserCategories } from "../services/UserService";
import { setGAUserId } from '../utils/analytics';

export const AuthContext = createContext();
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [categories, setCategories] = useState([]);
    const navigate = useNavigate();

    const loadUserData = async (setGA) => {
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
            getCategories(token);
        }

        const fetchData = async () => {
            const fetchedUser = await fetchUserData();
            setUser(fetchedUser);

            if (fetchedUser?._id) {
                setGAUserId(fetchedUser._id);
            } else {
                console.warn("User ID missing, GA will wait.");
            }

            setAuthLoading(false);
        };

        fetchData();
    }, [, userToken]);

    const getCategories = async (userToken) => {
        const categories = await getUserCategories(userToken);
        setCategories(categories)
    };

    return (
        <AuthContext.Provider value={{ user, loadUserData, setUser, logout, userToken, setUserToken, authLoading, categories, setCategories }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
