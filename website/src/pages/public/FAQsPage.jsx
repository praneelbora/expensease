import React, { useState } from "react";
import SEO from "../../components/SEO";
import Navbar from "../../components/NavBar";
import { ChevronDown, ChevronUp } from "lucide-react";
import Footer from "../../components/Footer";

const faqs = [
    {
        q: "How do I add a personal expense?",
        a: (
            <>
                <p>
                    <strong>On mobile:</strong> Tap the <span className="font-bold">+</span> button at the bottom of the screen in the navbar.
                </p>
                <p>
                    <strong>On desktop:</strong> Click the <span className="font-bold">+</span> button in the left sidebar.
                </p>
                <p>Then add:</p>
                <ul className="list-disc ml-6">
                    <li>Description of the expense</li>
                    <li>Currency</li>
                    <li>Amount</li>
                    <li>Category</li>
                    <li>Date of expense</li>
                </ul>
                <p>Click <strong>Save Expense</strong> to log it.</p>
            </>
        ),
    },
    {
        q: "How do I create a group or add friends?",
        a: (
            <>
                <p>
                    You can create a <strong>QA group</strong> and send the invite link to your friend, or they can join using a 4-digit code.
                </p>
                <p>
                    To add a friend, you can use their email address or share your friend link from the Friends page. Your friend can use this link to send you a friend request.
                </p>
            </>
        ),
    },
    {
        q: "How do I add a group expense or split with a friend?",
        a: (
            <>
                <p>Select a group or a friend to split an expense with, then fill in:</p>
                <ul className="list-disc ml-6">
                    <li>Description</li>
                    <li>Currency (supports multiple currencies!)</li>
                    <li>Amount</li>
                    <li>Category</li>
                    <li>Date of expense</li>
                    <li>Splits: who is paying how much, and how much each person owes (equal, percent, or manual split)</li>
                </ul>
                <p>Click <strong>Save Expense</strong> to finalize.</p>
            </>
        ),
    },
    {
        q: "How do I use the loan feature?",
        a: (
            <>
                <p>You can record loans between two friends by going to <strong>New Loan</strong> and filling in:</p>
                <ul className="list-disc ml-6">
                    <li>Friend who is borrowing or lending</li>
                    <li>Amount</li>
                    <li>Currency</li>
                    <li>Optional note or description</li>
                </ul>
                <p>Click <strong>Save Loan</strong> to track it. Loans can be settled like normal expenses.</p>
            </>
        ),
    },
    {
        q: "What privacy features are available for groups?",
        a: (
            <>
                <p>
                    Group admins can enable or disable privacy for the group. This allows you to hide certain expenses from members who were not part of that expense.
                </p>
                <p>This ensures sensitive transactions are only visible to involved members.</p>
            </>
        ),
    },
    {
        q: "Are there any charges?",
        a: "All features are free for now!",
    },
    {
        q: "Can I manage payment methods?",
        a: "Yes! You can create and use payment accounts to manage your forms of payments within the app.",
    },
];

const FAQ = () => {
    const [openIndex, setOpenIndex] = useState(null);

    return (
        <>
            <SEO
                title="FAQs | Expensease"
                description="Frequently asked questions about Expensease and how it works."
            />
            <Navbar />
            <div className="min-h-screen bg-[#121212] p-12 mt-[80px]">
                <h1 className="text-3xl font-bold text-center mb-12 text-white">
                    Frequently Asked Questions
                </h1>

                <div className="max-w-3xl mx-auto space-y-4">
                    {faqs.map((faq, i) => (
                        <div key={i} className="border border-[#212121] rounded-xl overflow-hidden">
                            <div
                                className="w-full bg-[#212121] px-4 py-3 flex justify-between items-center hover:bg-[#2c2c2c] transition gap-2 "
                                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                            >
                                <h3 className="text-base font-medium text-white">{faq.q}</h3>
                                {openIndex === i ? (
                                    <div>
                                        <ChevronUp className="text-teal-400" />
                                    </div>
                                ) : (
                                    <div>
                                        <ChevronDown className="text-teal-400" />
                                    </div>
                                )}
                            </div>

                            {openIndex === i && (
                                <div className="p-4 bg-[#121212] text-gray-300 border-t border-[#2c2c2c]">
                                    {faq.a}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
            <Footer />
        </>
    );
};

export default FAQ;
