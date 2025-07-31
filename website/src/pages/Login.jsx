import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";
import { googleLogin } from "../services/UserService";
import { useNavigate } from "react-router-dom";
export default function LoginRegister() {
    const navigate = useNavigate()
    const { setUser } = useAuth(); // Assuming your context has a `setUser`
    const [error, setError] = useState("");

    return (
        <div className="h-[100dvh] w-full flex items-center justify-center bg-[#121212] text-[#EBF1D5]">
            <div className="w-full max-w-md p-8 space-y-6 bg-[#121212]">
                <h2 className="text-3xl font-bold text-center">Split-Free Login</h2>
                <div className="flex justify-center">
                    <GoogleLogin
                        onSuccess={async (credentialResponse) => {
                            const result = await googleLogin(credentialResponse.credential);

                            if (result?.error) {
                                setError(result.error);
                                return;
                            }
                            setUser(result.user);
                            navigate("/dashboard");
                        }}
                        onError={() => {
                            setError("Google login failed.");
                        }}
                        theme="filled_black"
                        size="large"
                    />

                </div>

                {error && <p className="text-red-400 text-center">{error}</p>}
            </div>
        </div>
    );
}
