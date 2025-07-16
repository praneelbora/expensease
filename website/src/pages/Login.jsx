import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";

export default function Login() {
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        await login(email, password);
    };

    return (
        <div className="h-screen w-full flex items-center justify-center bg-[#121212] text-[#EBF1D5]">
            <div className="w-full max-w-md p-8 space-y-6  bg-[#121212]">
                <h2 className="text-3xl font-bold text-center">Split-Free Login</h2>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm mb-1">Email</label>
                        <input
                            className="bg-[#1f1f1f] w-full text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm mb-1">Password</label>
                        <input
                            className="bg-[#1f1f1f] w-full text-[#EBF1D5] border border-[#55554f] rounded-md p-2 text-base"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-[#EBF1D5] font-medium"
                    >
                        Login
                    </button>
                </form>

                <p className="text-center text-sm">
                    Don&apos;t have an account?{" "}
                    <Link to="/register" className="text-blue-400 hover:underline">
                        Sign Up
                    </Link>
                </p>
            </div>
        </div>
    );
}
