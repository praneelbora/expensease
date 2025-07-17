import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Groups from "./pages/Groups";
import Friends from "./pages/Friends";
import AddExpense from "./pages/AddExpense";
import Expenses from "./pages/Expenses";
import GroupDetails from "./pages/GroupDetails";
import Account from "./pages/Account";
import Logout from "./pages/Logout";
import Cookies from "js-cookie";
import { Loader } from "lucide-react";

// ✅ Updated PrivateRoute using context
function PrivateRoute({ children }) {
    const { user, authLoading } = useAuth();
    if(authLoading) return <Loader />
    return user ? children : <Navigate to="/login" />;
}

function App() {
    const { user, logout } = useAuth(); // use user info for redirects

    return (
        <Routes>
            <Route
                path="/login"
                element={user ? <Navigate to="/groups" /> : <Login />}
            />
            <Route
                path="/register"
                element={user ? <Navigate to="/groups" /> : <Register />}
            />

            <Route
                path="/groups"
                element={<PrivateRoute><Groups /></PrivateRoute>}
            />
            <Route
                path="/groups/:id"
                element={<PrivateRoute><GroupDetails /></PrivateRoute>}
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
                path="/logout"
                element={<Logout />}
            />
            <Route
                path="/"
                element={<Navigate to={user ? "/groups" : "/login"} />}
            />
        </Routes>
    );
}

export default App;
