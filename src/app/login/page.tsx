"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
export default function Login() {
  const router = useRouter();
  const [mode,setMode] = useState<"login"|"signup"|"forgot">("signup");
  const [email,setEmail] = useState(""); const [password,setPassword] = useState("");
  const [message,setMessage] = useState(""); const [busy,setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const db = createClient();
    if (mode === "forgot") {
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset` });
      // Same message either way so the form cannot be used to discover which emails have accounts.
      setMessage(error && error.status === 429 ? "Too many requests. Please wait a few minutes." : "If an account exists for that email, a reset link is on its way.");
    } else if (mode === "signup") {
      const { error, data } = await db.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (error) setMessage(error.message);
      else if (!data.session) setMessage("Account created. Check your email to confirm your address, then sign in.");
      else { router.push("/dashboard"); router.refresh(); }
    } else {
      const { error } = await db.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
      else { router.push("/dashboard"); router.refresh(); }
    }
    setBusy(false);
  }
  return <main className="loginwrap shell"><div className="authcard"><div className="eyebrow">WELCOME TO VRISAMA</div><h1>{mode === "signup" ? "Build your next big thing." : mode === "forgot" ? "Reset your password." : "Welcome back."}</h1><p>{mode === "signup" ? "Create your founder account and launch your first business workspace." : mode === "forgot" ? "Enter your email and we\u2019ll send you a reset link." : "Sign in to access your businesses."}</p>
    <form onSubmit={submit} className="formstack"><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email" placeholder="founder@business.com"/></label>
    {mode !== "forgot" && <label>Password<input type="password" minLength={8} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete={mode==="signup"?"new-password":"current-password"} placeholder="At least 8 characters"/></label>}
    {message && <div className="notice" role="status">{message}</div>}
    <button disabled={busy} className="btn btnprimary full">{busy ? "Please wait…" : mode==="signup"?"Create account →":mode==="forgot"?"Send reset link →":"Sign in →"}</button></form>
    <button className="textbutton" onClick={()=>{setMode(mode==="signup"?"login":"signup");setMessage("");}}>{mode==="signup"?"Already have an account? Sign in":"New here? Create an account"}</button>
    {mode==="login" && <button className="textbutton sub" onClick={()=>{setMode("forgot");setMessage("");}}>Forgot your password?</button>}
    {mode==="forgot" && <button className="textbutton sub" onClick={()=>{setMode("login");setMessage("");}}>Back to sign in</button>}
    <Link className="tinyback" href="/">← Back to home</Link>
  </div></main>;
}
