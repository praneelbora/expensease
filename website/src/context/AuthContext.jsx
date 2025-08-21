import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Cookies from "js-cookie";
import { fetchUserData, getUserCategories } from "../services/UserService";
import { setGAUserId } from "../utils/analytics";
import { listPaymentMethods } from "../services/PaymentMethodService";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userToken, setUserToken] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(true);
    const [categories, setCategories] = useState([]);
    const [defaultCurrency, setDefaultCurrency] = useState();
    const [preferredCurrencies, setPreferredCurrencies] = useState([]);
    const [paymentMethods, setPaymentMethods] = useState([]);
    const navigate = useNavigate();

    const loadUserData = async (setGA) => {
        const u = await fetchUserData();
        setUser(u);
        if (setGA && u?._id) setGAUserId(u._id);
        setAuthLoading(false);
    };

    const logout = () => {
        setUser(null);
        Cookies.remove("userToken");
        navigate("/login");
    };

    // Derive currency prefs whenever user changes (safe against undefined)
    useEffect(() => {
        if (!user) return;

        const usage = user?.preferredCurrencyUsage ?? {};
        const list = Array.isArray(user?.preferredCurrencies)
            ? user.preferredCurrencies
            : [];

        setDefaultCurrency(
            user?.defaultCurrency ||
            localStorage.getItem("currency") ||
            list[0] ||
            ""
        );

        const sorted = [...list]
            .sort(
                (a, b) =>
                    (usage[b] ?? 0) - (usage[a] ?? 0) || a.localeCompare(b)
            )
            .slice(0, 3);

        setPreferredCurrencies(sorted);
    }, [user]);

    const persistDefaultCurrency = async (newCur) => {
        setDefaultCurrency(newCur);
        localStorage.setItem("currency", newCur);
        try {
            // Intentionally wrapped: if updatePreferredCurrency is not imported/defined, this won't crash the app.
            // eslint-disable-next-line no-undef
            await updatePreferredCurrency?.(newCur, userToken);
        } catch { }
    };

    const fetchData = async () => {
        try {
            const fetchedUser = await fetchUserData();
            setUser(fetchedUser);

            if (fetchedUser?._id) {
                setGAUserId(fetchedUser._id);
            } else {
                console.warn("User ID missing, GA will wait.");
            }
        } catch (e) {
            console.warn("fetchData failed:", e?.message || e);
        } finally {
            setAuthLoading(false);
        }
    };
    const fetchPaymentMethods = async () => {
        try {
            setLoadingPaymentMethods(true)
            const pms = await listPaymentMethods();
            setPaymentMethods(Array.isArray(pms) ? pms : []);
        } catch (e) {
            console.warn("fetchPaymentMethods failed:", e?.message || e);
        } finally {
            setLoadingPaymentMethods(false)
        }
    };

    // On mount: read token once
    useEffect(() => {
        const token = Cookies.get("userToken");
        if (token) setUserToken(token);
        else setAuthLoading(false); // avoid indefinite spinner when logged out
    }, []);

    // When token is present/changes, load data and categories
    useEffect(() => {
        if (!userToken) return;
        (async () => {
            try {
                await fetchData();
                await fetchPaymentMethods()
                await getCategories(userToken);
            } catch (e) {
                console.warn("Init with token failed:", e?.message || e);
            }
        })();
    }, [userToken]);

    const getCategories = async (token) => {
        const cats = await getUserCategories(token);
        setCategories(Array.isArray(cats) ? cats : []);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                setUser,
                loadUserData,
                logout,
                userToken,
                setUserToken,
                authLoading,
                categories,
                setCategories,
                defaultCurrency,
                preferredCurrencies,
                persistDefaultCurrency,
                paymentMethods,
                setPaymentMethods,
                fetchPaymentMethods,
                loadingPaymentMethods
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
