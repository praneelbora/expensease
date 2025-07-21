import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Groups from "./pages/Groups";
import Friends from "./pages/Friends";
import AddExpense from "./pages/AddExpense";
import Expenses from "./pages/Expenses";
import GroupDetails from "./pages/GroupDetails";
import Account from "./pages/Account";
import Logout from "./pages/Logout";
import LinkLogin from "./pages/LinkLogin";
import GroupJoin from "./pages/GroupJoin";
import GroupSettings from "./pages/GroupSettings";
import SupportDev from "./pages/SupportDev";
import Cookies from "js-cookie";
import { Loader } from "lucide-react";
import FriendRequest from "./pages/FriendRequest";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";


// ✅ Updated PrivateRoute using context
function PrivateRoute({ children }) {
    const { user, authLoading } = useAuth() || {};
    if (authLoading) return <Loader />
    return user ? children : <Navigate to="/login" />;
}

function App() {
    const { user, logout } = useAuth() || {}; // use user info for redirects
    const location = useLocation();
    const { handleLinkLogin } = useAuth() || {};
    useEffect(() => {
        const urlParams = new URLSearchParams(location.search);
        const token = urlParams.get("token");

        if (token) {
            handleLinkLogin(token);
            // Optionally: clean URL so token isn't visible after login
            window.history.replaceState({}, document.title, "/"); // 👈 removes token from URL
        }
    }, []); // 👈 Remove `location` from dependency to run only once on mount

    return (
        <Routes>
            <Route
                path="/login"
                element={user ? <Navigate to="/groups" /> : <Login />}
            />
            <Route
                path="/groups"
                element={<PrivateRoute><Groups /></PrivateRoute>}
            />
            <Route
                path="/groups/:id"
                element={<PrivateRoute><GroupDetails /></PrivateRoute>}
            />            <Route
                path="/groups/settings/:id"
                element={<PrivateRoute><GroupSettings /></PrivateRoute>}
            />
            <Route
                path="/friends"
                element={<PrivateRoute><Friends /></PrivateRoute>}
            />
            <Route
                path="/add-expense"
                element={<PrivateRoute><AddExpense /></PrivateRoute>}
            />
            <Route
                path="/expenses"
                element={<PrivateRoute><Expenses /></PrivateRoute>}
            />
            <Route
                path="/account"
                element={<PrivateRoute><Account /></PrivateRoute>}
            />
            <Route
                path="/supportdeveloper"
                element={<PrivateRoute><SupportDev /></PrivateRoute>}
            />
            <Route
                path="/logout"
                element={<Logout />}
            />
            <Route path="/link-login" element={<LinkLogin />} />

            <Route
                path="/"
                element={<Navigate to={user ? "/groups" : "/login"} />}
            />
            <Route path="/groups/join/:code" element={<GroupJoin />} />
            <Route path="/friends/add/:senderId" element={<FriendRequest />} />

        </Routes>
    );
}

export default App;
