import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import Cookies from "js-cookie";

const Navbar = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const userToken = Cookies.get("userToken"); // or whatever key you use
    const navigate = useNavigate();
    useEffect(() => {
        if (userToken) {
            setIsLoading(false);
            navigate("/dashboard");
        }
        setIsLoading(false);
    }, [userToken, navigate]);
    if (isLoading) {
        return <div>Loading...</div>;
    }
    return (
        <nav className="fixed top-0 left-0 w-full bg-[#212121] text-[#EBF1D5] px-4 sm:px-6 py-4 flex items-center justify-between z-100">
            {/* Logo */}
            <Link to="/" className="text-2xl font-bold">
                Expensease
            </Link>

            {/* Hamburger for mobile */}
            <div className="sm:hidden">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="focus:outline-none"
                >
                    {isOpen ? (
                        <span className="text-3xl">&times;</span> // X icon
                    ) : (
                        <span className="text-3xl">&#9776;</span> // Hamburger icon
                    )}
                </button>
            </div>

            {/* Menu links */}
            <div
                className={`flex-col pb-4 sm:pb-0 sm:flex-row sm:flex items-center gap-4 sm:gap-6 absolute sm:static top-16 left-0 w-full sm:w-auto bg-[#212121] sm:bg-transparent transition-all duration-300 ${isOpen ? "flex" : "hidden"
                    } sm:flex`}
            >
                <Link to="/" className="block px-4 py-2 hover:text-teal-400">
                    Home
                </Link>
                <Link to="/about" className="block px-4 py-2 hover:text-teal-400">
                    About
                </Link>
                <Link to="/features" className="block px-4 py-2 hover:text-teal-400">
                    Features
                </Link>
                <Link to="/faqs" className="block px-4 py-2 hover:text-teal-400">
                    FAQs
                </Link>
                <Link to="/blogs" className="block px-4 py-2 hover:text-teal-400">
                    Blogs
                </Link>
                <Link to="/contact" className="block px-4 py-2 hover:text-teal-400">
                    Contact Us
                </Link>
                {userToken ? (
                    <Link
                        to="/dashboard"
                        className="bg-white text-[#121212] px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition"
                    >
                        Go to Dashboard
                    </Link>
                ) : (
                    <Link
                        to="/login"
                        className="bg-white text-[#121212] px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition"
                    >
                        Login / Signup
                    </Link>
                )}
            </div>
        </nav>
    );
};

export default Navbar;
