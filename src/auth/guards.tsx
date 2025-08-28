import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import type { JSX } from "react";

export function RequireAuth({ children }: { children: JSX.Element }) {
    const { user, loading } = useAuth();
    if (loading) return <div style={{ padding: 24 }}>Loading your account…</div>;
    if (!user) return <Navigate to="/login" replace />;
    return children;
  }
  