import React from "react";
import SEO from "../../components/SEO";
import NavBar from "../../components/NavBar";
import { Users, PieChart, Lock, Handshake, DollarSign } from "lucide-react";
import Footer from "../../components/Footer";

const features = [
    {
        title: "Easy Expense Splitting",
        description: "Split bills with friends or groups effortlessly, choose equal, percent, or manual splits.",
        icon: <Users size={36} className="text-teal-500 mx-auto mb-4" />,
    },
    {
        title: "Track Personal & Group Spending",
        description: "Visualize all your expenses in one place, and monitor your personal and shared spending trends.",
        icon: <PieChart size={36} className="text-teal-500 mx-auto mb-4" />,
    },
    {
        title: "Loan Management",
        description: "Record and track loans between friends with full transparency and easy settlement.",
        icon: <Handshake size={36} className="text-teal-500 mx-auto mb-4" />,
    },
    {
        title: "Multiple Currencies Support",
        description: "Add expenses in different currencies and manage conversions easily.",
        icon: <DollarSign size={36} className="text-teal-500 mx-auto mb-4" />,
    },
    {
        title: "Payment Method Management",
        description: "Create and manage multiple payment accounts for tracking your balances.",
        icon: <DollarSign size={36} className="text-teal-500 mx-auto mb-4" />,
    },
    {
        title: "Group Privacy Control",
        description: "Admins can hide expenses from members who were not part of the transaction for secure group management.",
        icon: <Lock size={36} className="text-teal-500 mx-auto mb-4" />,
    },
];

const Features = () => {
    return (
        <>
            <SEO
                title="Features | Expensease"
                description="Discover all the features of Expensease that help you manage and split expenses."
                canonical="https://www.expensease.in/features"
            />
            <NavBar />
            <div className="min-h-[100dvh] bg-[#121212] p-12 pt-[120px]">
                <h1 className="text-4xl font-bold text-center mb-12 text-white">Features</h1>
                <div className="max-w-6xl mx-auto grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {features.map((feature, i) => (
                        <div
                            key={i}
                            className="bg-[#212121] text-white p-6 rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300"
                        >
                            {feature.icon}
                            <h2 className="font-semibold text-xl mb-2 text-center">{feature.title}</h2>
                            <p className="text-gray-300 text-center">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
            <Footer />
        </>
    );
};

export default Features;
