import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A0C11", color: "#EAE7E0", fontFamily: "sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 64, fontWeight: 700, color: "#646D83", margin: 0 }}>404</h1>
        <h2 style={{ fontSize: 24, marginBottom: 16 }}>Page Not Found</h2>
        <Link to="/" style={{ color: "#C9A35C", textDecoration: "none" }}>Return to ADEP</Link>
      </div>
    </div>
  );
}
