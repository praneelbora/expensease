import { Routes, Route, Navigate } from "react-router";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Groups from "./pages/Groups";
import Friends from "./pages/Friends";
import AddExpense from "./pages/AddExpense";
import Expenses from './pages/Expenses';


import GroupDetails from './pages/GroupDetails';
import Account from "./pages/Account";
import Cookies from 'js-cookie'

function PrivateRoute({ children }) {
    return Cookies.get('userToken') ? children : <Navigate to="/login" />;
}

function App() {

    return (
        <Routes>
            <Route
                path="/login"
                element={Cookies.get('userToken') ? <Navigate to="/groups" /> : <Login />}
            />
            <Route
                path="/register"
                element={Cookies.get('userToken') ? <Navigate to="/groups" /> : <Register />}
            />
            <Route
                path="/groups"
                element={
                    <Groups />
                }
            />
            <Route
                path="/groups/:id"
                element={
                    <GroupDetails />
                }
            />
            <Route
                path="/friends"
                element={
                    <Friends />
                }
            />
            <Route
                path="/add-expense"
                element={
                    <AddExpense />
                }
            />
            <Route
                path="/expenses"
                element={
                    <Expenses />
                }
            />
            <Route
                path="/account"
                element={
                    <PrivateRoute>
                        <Account />
                    </PrivateRoute>
                }
            />
            <Route
                path="/"
                element={<Navigate to={Cookies.get('userToken') ? "/groups" : "/login"} />}
            />
        </Routes>
    );
}

export default App;
