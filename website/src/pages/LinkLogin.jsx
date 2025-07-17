// pages/LinkLogin.jsx
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function LinkLogin() {
  const { linkLogin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const token = query.get("token");

    if (token) {
      linkLogin(token)
        .then(() => {
          navigate("/"); // or your dashboard route
        })
        .catch((err) => {
          console.error("Link login failed:", err);
          navigate("/login?error=invalid_token");
        });
    } else {
      navigate("/login?error=missing_token");
    }
  }, [location.search, linkLogin, navigate]);

  return <p>Logging you in...</p>;
}

export default LinkLogin;
