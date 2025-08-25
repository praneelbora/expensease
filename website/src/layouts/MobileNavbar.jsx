import { Link, useLocation } from "react-router-dom";
import {
    Users,
    Wallet,
    Plus,
    List,
    User,
    LayoutDashboard
} from "lucide-react";
import { useEffect, useState } from "react";

const MobileNavbar = ({ groupId }) => {
    const location = useLocation();
    const [isPWA, setIsPWA] = useState(false);

    useEffect(() => {
        // Detect PWA mode
        const isStandalone =
            window.matchMedia("(display-mode: standalone)").matches ||
            window.navigator.standalone === true;

        setIsPWA(isStandalone);
    }, []);
    const svgSize = isPWA ? 28 : 26;
    const navItems = [
        { to: "/friends", label: "Friends", icon: <Users size={svgSize} /> },
        { to: "/groups", label: "Groups", icon: <Wallet size={svgSize} /> },
        { to: "/new-expense", label: "Add", icon: <Plus strokeWidth={3} size={svgSize + 3} />, isCenter: true, state: groupId ? { groupId } : null, special: true },
        { to: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={svgSize} /> },
        { to: "/account", label: "Account", icon: <User size={svgSize} /> },
    ];

    return (
        <div className="fixed bottom-0 left-0 w-full bg-[#1f1f1f] text-[#EBF1D5] border-t border-[#333] z-40">
            <div
                className="flex justify-around items-center px-2 pt-3 relative"
                style={{ paddingBottom: isPWA ? "1.2rem" : "1rem" }}
            >
                {navItems.map((item, index) => {
                    const isActive = location.pathname === item.to;

                    return (
                        <Link
                            to={item.to}
                            key={index}
                            state={item.state}
                            className={`flex flex-col items-center justify-center text-xl ${isActive ? "text-teal-300" : "text-[#EBF1D5]"
                                } ${item.isCenter ? "relative z-10 -mt-6  bg-teal-500 text-white w-16 h-16 mx-1 rounded-full shadow-md" : "flex-1"}`}
                        >
                            {item.icon}
                            {!item.isCenter && (
                                <span className="text-[11px] mt-1">{item.label}</span>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
};

export default MobileNavbar;
