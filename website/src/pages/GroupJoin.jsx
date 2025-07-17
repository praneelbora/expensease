import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader } from "lucide-react";

export default function GroupJoinRedirect() {
    const { code } = useParams();
    const navigate = useNavigate();
    const { user, authLoading } = useAuth();

    useEffect(() => {
        if (authLoading) return; // Wait until auth state is loaded

        if (!user) {
            // Save join intent in localStorage and redirect to login
            localStorage.setItem("pendingGroupJoin", code);
            navigate("/login");
        } else {
            // User is logged in — redirect to group join UI
            navigate(`/groups?join=${code}`);
        }
    }, [user, authLoading, code, navigate]);

    return (
        <div className="flex items-center justify-center h-screen">
            <Loader className="animate-spin w-6 h-6" />
            <span className="ml-2 text-lg">Redirecting...</span>
        </div>
    );
}
