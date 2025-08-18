
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
    const [defaultCurrency, setDefaultCurrency] = useState();
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);
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
        if (!user) return;
        setDefaultCurrency(user?.defaultCurrency || localStorage.getItem('currency') || '');
        const sorted = [...user?.preferredCurrencies].sort((a, b) => { const usage = user.preferredCurrencyUsage || {}; const countA = usage[a] || 0; const countB = usage[b] || 0; return countB - countA || a.localeCompare(b); }).slice(0, 3);
        setPreferredCurrencies(
            sorted
        );
    }, [user]);
    const persistDefaultCurrency = async (newCur) => {
        setDefaultCurrency(newCur);
        localStorage.setItem('currency', newCur);
        try { await updatePreferredCurrency(newCur, userToken); } catch { }
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
        <AuthContext.Provider
            value={{
                user, loadUserData, setUser, logout,
                userToken, setUserToken,
                authLoading,
                categories, setCategories,
                defaultCurrency,
                preferredCurrencies,
                persistDefaultCurrency,
            }}>
            {children}
        </AuthContext.Provider>
    );
};

// ✅ Optional convenience hook
export const useAuth = () => useContext(AuthContext);
