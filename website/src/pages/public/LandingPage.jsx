import React from "react";
import { Link } from "react-router-dom";
import Cookies from "js-cookie";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import Footer from "../../components/Footer";

const LandingPage = () => {
    const userToken = Cookies.get("userToken"); // or whatever key you use

    return (
        <>
            <SEO
                title="Expensease - Effortless Expense Tracking"
                description="Split expenses, track personal and group spending, and get insights with Expensease."
                canonical="https://www.expensease.in/"
            />
            <NavBar />

            {/* Hero Section */}
            <section className="flex flex-col items-center justify-center text-center px-6 py-32 bg-teal-500 text-[#121212] mt-16">
                <h1 className="text-5xl font-bold mb-4">Expensease</h1>
                <p className="text-lg max-w-xl mb-6">
                    Split expenses effortlessly. Track your personal and shared spending.
                    Gain insights and stay on top of your finances.
                </p>
                <div className="flex gap-4 flex-wrap justify-center">
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
                    <Link
                        to="/features"
                        className="bg-transparent border border-white px-6 py-3 rounded-lg font-semibold hover:bg-white hover:text-[#121212] transition"
                    >
                        Learn Features
                    </Link>
                </div>
            </section>

            {/* Features Section */}
            <section className="py-20 px-6 bg-[#121212]">
                <h2 className="text-3xl font-bold text-center mb-12 text-white">
                    Features
                </h2>
                <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    <div className="bg-white p-6 rounded-xl shadow-md text-center">
                        <h3 className="font-semibold mb-2">Easy Expense Splitting</h3>
                        <p>Split bills with friends or groups with just a few clicks.</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md text-center">
                        <h3 className="font-semibold mb-2">Track Spending</h3>
                        <p>Visualize your personal and group expenses in charts and summaries.</p>
                    </div>
                    <div className="bg-white p-6 rounded-xl shadow-md text-center">
                        <h3 className="font-semibold mb-2">Payment Management</h3>
                        <p>Keep track of all your payment methods and balances in one place.</p>
                    </div>
                </div>
            </section>
            <Footer />
        </>
    );
};

export default LandingPage;
