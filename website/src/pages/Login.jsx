import { useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function LoginRegister() {
    const [email, setEmail] = useState("");
    const [name, setName] = useState("");
    const [step, setStep] = useState("email"); // "email", "name", or "submitted"
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const loginOrRegister = async (email, name = null) => {
        const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/users/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(name ? { email, name } : { email }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Login/Register failed");

        return data.message; // e.g., "Magic login link sent to email!"
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (step === "email") {
                try {
                    await loginOrRegister(email); // try login
                    setStep("submitted");
                } catch (err) {
                    if (err.message === "User not found") {
                        setStep("name"); // ask for name if not found
                    } else {
                        throw err;
                    }
                }
            } else if (step === "name") {
                await loginOrRegister(email, name); // register and login
                setStep("submitted");
            }
        } catch (err) {
            console.error(err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-[#121212] text-[#EBF1D5]">
            <div className="w-full max-w-md p-8 space-y-6 bg-[#121212]">
                <h2 className="text-3xl font-bold text-center">Split-Free Access</h2>

                {step === "submitted" ? (
                    <p className="text-center text-green-400">
                        Login link sent to <strong>{email}</strong>. Check your inbox!
                    </p>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {step === "email" && (
                            <>
                                <label className="block text-sm mb-1">Email</label>
                                <input
                                    type="email"
                                    className="bg-[#1f1f1f] w-full text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={loading}
                                    placeholder="you@example.com"
                                />
                            </>
                        )}

                        {step === "name" && (
                            <>
                                <div className="mb-4">
                                    <p className="text-sm text-gray-400">
                                        Email Id: <span className="font-medium text-white">{email}</span>.
                                    </p>
                                </div>

                                <label className="block text-sm mb-1">Name</label>
                                <input
                                    type="text"
                                    className="bg-[#1f1f1f] w-full text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    disabled={loading}
                                    placeholder="Your name"
                                />
                            </>
                        )}


                        {error && <p className="text-red-400 text-center">{error}</p>}

                        <button
                            type="submit"
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-[#EBF1D5] font-medium flex justify-center items-center"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="animate-pulse">Processing...</span>
                            ) : (
                                step === "email" ? "Continue" : "Register & Send Login Link"
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}
