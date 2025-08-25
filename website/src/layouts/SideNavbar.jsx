import { Link, useLocation } from "react-router-dom";
import { User, Users, Plus, Wallet, List, LayoutDashboard, HeartPlus, Handshake, Activity, UserPen, SquareUser, Cog } from "lucide-react";

const SideNavbar = ({ groupId }) => {
    const location = useLocation();

    const navItems = [
        { to: "/friends", label: "Friends", icon: <User size={20} /> },
        { to: "/groups", label: "Groups", icon: <Users size={20} /> },
        { to: "/expenses", label: "Expenses", icon: <List size={20} /> },
        { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
        { to: "/new-expense", label: "New Expense", icon: <Plus size={30} />, state: groupId ? { groupId } : null, special: true },
        { to: "/paymentMethods", label: "Payment Accounts", icon: <Wallet size={20} /> },
        { to: "/transactions", label: "Transactions", icon: <Activity size={20} /> },
        { to: "/supportdeveloper", label: "Support", icon: <HeartPlus size={20} /> },
        { to: "/account", label: "Account", icon: <Cog size={20} /> },
    ];

    return (
        <div className="w-20 bg-[#1f1f1f] text-[#EBF1D5] py-6 px-2 h-screen flex flex-col items-center justify-center shadow-lg">
            <div className="w-full flex flex-col items-center gap-6">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.to;

                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            state={item.state}
                            className={`w-full flex flex-col items-center justify-center py-2 rounded-md transition 
                ${isActive ? "bg-[#2a2a2a] text-teal-300" : "hover:text-teal-300"}`}
                        >
                            {item.icon}
                            <span className="text-[11px] mt-1 flex w-full justify-center items-center align-middle text-center">{item.label}</span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default SideNavbar;
