import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Groups from "./pages/Groups";
import Friends from "./pages/Friends";
import AddExpense from "./pages/AddExpense";
import Expenses from "./pages/Expenses";
import GroupDetails from "./pages/GroupDetails";
import FriendDetails from "./pages/FriendDetails";
import Account from "./pages/Account";
import PaymentMethods from "./pages/PaymentMethods";
import Transactions from "./pages/Transactions";
import Logout from "./pages/Logout";
import GroupSettings from "./pages/GroupSettings";
import FriendSettings from "./pages/FriendSettings";
import Dashboard from "./pages/Dashboard";
import AddLoan from "./pages/AddLoan";
import Guide from "./pages/Guide";
import SupportDev from "./pages/SupportDev";
import LandingPage from "./pages/public/LandingPage";
import About from "./pages/public/About";
import FeaturesPage from "./pages/public/FeaturesPage";
import FAQsPage from "./pages/public/FAQsPage";
import { Loader } from "lucide-react";
import { useLocation } from "react-router-dom";


// ✅ Updated PrivateRoute using context
function PrivateRoute({ children }) {
    const { user, authLoading } = useAuth() || {};
    if (authLoading) return <Loader />
    return user ? children : <Navigate to="/login" />;
}

function App() {
    const { user, logout } = useAuth() || {}; // use user info for redirects
    const location = useLocation();
    return (
        <Routes>
            <Route
                path="/login"
                element={user ? <Navigate to="/dashboard" /> : <Login />}
            />
            <Route
                path="/dashboard"
                element={<PrivateRoute><Dashboard /></PrivateRoute>}
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
                path="/friends/:id"
                element={<PrivateRoute><FriendDetails /></PrivateRoute>}
            />
            <Route
                path="/friends/settings/:id"
                element={<PrivateRoute><FriendSettings /></PrivateRoute>}
            />
            <Route
                path="/new-expense"
                element={<PrivateRoute><AddExpense /></PrivateRoute>}
            />
            <Route
                path="/expenses"
                element={<PrivateRoute><Expenses /></PrivateRoute>}
            />
            <Route
                path="/new-loan"
                element={<PrivateRoute><AddLoan /></PrivateRoute>}
            />
            <Route
                path="/account"
                element={<PrivateRoute><Account /></PrivateRoute>}
            />
            <Route
                path="/paymentAccounts"
                element={<PrivateRoute><PaymentMethods /></PrivateRoute>}
            />
            <Route
                path="/transactions"
                element={<PrivateRoute><Transactions /></PrivateRoute>}
            />
            <Route
                path="/guide"
                element={<PrivateRoute><Guide /></PrivateRoute>}
            />
            <Route
                path="/supportdeveloper"
                element={<PrivateRoute><SupportDev /></PrivateRoute>}
            />
            <Route
                path="/logout"
                element={<Logout />}
            />
            <Route
                path="/"
                element={<LandingPage />}
            />
            <Route
                path="/about"
                element={<About />}
            />
            <Route
                path="/features"
                element={<FeaturesPage />}
            />
            <Route
                path="/faqs"
                element={<FAQsPage />}
            />
            <Route
                path="/*"
                element={<Navigate to={user ? "/dashboard" : "/login"} />}
            />

        </Routes>
    );
}

export default App;
