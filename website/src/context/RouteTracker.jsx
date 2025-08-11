// RouteTracker.jsx
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logScreenView } from "../analytics";
import { useAuth } from "./AuthContext";

export default function RouteTracker() {
    const location = useLocation();
    const { user, authLoading } = useAuth();

    useEffect(() => {
        if (!authLoading && user) {
            logScreenView(location.pathname || "home");
        }
    }, [location, authLoading, user]);

    return null;
}
