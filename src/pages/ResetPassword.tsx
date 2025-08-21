import { type FormEvent, useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../lib/firebase";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(""); setMsg("");
    try {
      await sendPasswordResetEmail(auth, email);
      setMsg("Check your email for the reset link.");
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 360 }}>
      <h1>Reset password</h1>
      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}
      <input placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
      <button type="submit">Send reset</button>
    </form>
  );
}
