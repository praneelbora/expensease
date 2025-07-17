import { Link, useLocation } from "react-router-dom";
import {
    Users,
    Wallet,
    Plus,
    List,
    User,
} from "lucide-react";

const MobileNavbar = ({ groupId }) => {
    const location = useLocation();

    const navItems = [
        { to: "/friends", label: "Friends", icon: <Users size={20} /> },
        { to: "/groups", label: "Groups", icon: <Wallet size={20} /> },
        { to: "/add-expense", label: "Add", icon: <Plus size={28} />, isCenter: true, state: groupId ? { groupId } : null, special: true },
        { to: "/expenses", label: "Expenses", icon: <List size={20} /> },
        { to: "/account", label: "Account", icon: <User size={20} /> },
    ];

    return (
        <div className="fixed bottom-0 left-0 w-full bg-[#1f1f1f] text-[#EBF1D5] border-t border-[#333] z-40">
            <div className="flex justify-around items-center px-2 py-2 relative">
                {navItems.map((item, index) => {
                    const isActive = location.pathname === item.to;

                    return (
                        <Link
                            to={item.to}
                            key={index}
                            state={item.state}
                            className={`flex flex-col items-center justify-center text-sm ${isActive ? "text-teal-300" : "text-[#EBF1D5]"
                                } ${item.isCenter ? "relative z-10 -mt-6 bg-teal-500 text-white w-14 h-14 rounded-full shadow-md" : "flex-1"}`}
                        >
                            {item.icon}
                            {!item.isCenter && (
                                <span className="text-[12px] mt-1">{item.label}</span>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default MobileNavbar;
