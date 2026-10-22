"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMessage("");
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) { setMessage(error.message || "This reset link has expired. Request a new one."); return; }
    router.push("/dashboard"); router.refresh();
  }
  return <main className="loginwrap shell"><div className="authcard"><div className="eyebrow">ACCOUNT RECOVERY</div><h1>Choose a new password.</h1><p>Use at least 8 characters.</p>
    <form onSubmit={submit} className="formstack">
      <label>New password<input type="password" minLength={8} required autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <label>Confirm password<input type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
      {message && <div className="notice" role="alert">{message}</div>}
      <button disabled={busy} className="btn btnprimary full">{busy ? "Saving…" : "Update password →"}</button>
    </form>
    <Link className="tinyback" href="/login">← Back to sign in</Link>
  </div></main>;
}
