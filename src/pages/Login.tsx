// src/pages/Login.tsx
import type { FormEvent } from "react";
import { useState } from "react";
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Link, useNavigate } from "react-router-dom";
import { FALLBACK_WEEK_ID, readLastWeekId } from "../lib/weeks";

export default function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, pw);

      // after login, send somewhere that exists
      const lastLeague = localStorage.getItem("lastLeagueId");
      if (lastLeague) {
        const week = readLastWeekId(lastLeague) || FALLBACK_WEEK_ID;
        nav(`/l/${lastLeague}/leaderboard/${week}`, { replace: true });
      } else {
        nav("/leagues/join", { replace: true });
      }
    } catch (e: any) {
      setErr(e.message || "Login failed");
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360, margin: "2rem auto" }}>
      <h1>Log in</h1>
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <input placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} type="email" required />
      <input placeholder="Password" type="password" value={pw} onChange={(e)=>setPw(e.target.value)} required />
      <button type="submit">Log in</button>
      <div style={{ display: "flex", gap: 8 }}>
        <Link to="/reset">Forgot password?</Link>
        <span>·</span>
        <Link to="/signup">Create account</Link>
      </div>
    </form>
  );
}
