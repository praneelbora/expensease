import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Loader } from "lucide-react";

export default function FriendJoinRedirect() {
    const { senderId } = useParams();
    const navigate = useNavigate();
    const { user, authLoading } = useAuth() || {};

    useEffect(() => {
        if (authLoading) return;

        if (!user) {
            localStorage.setItem("pendingFriendAdd", senderId);
            navigate("/login");
        } else {
            navigate(`/friends?add=${senderId}`);
        }
    }, [user, authLoading, senderId, navigate]);

    return (
        <div className="flex items-center justify-center h-screen">
            <Loader className="animate-spin w-6 h-6" />
            <span className="ml-2 text-lg">Redirecting...</span>
        </div>
    );
}
