"use client";
import { useState } from "react";
export function AiDraft({ orgId, disabled = false }: {orgId:string; disabled?:boolean}) {
  const [channel,setChannel]=useState("instagram"); const [brief,setBrief]=useState("");
  const [result,setResult]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function generate(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true); setResult("");
    try {
      const res=await fetch("/api/ai/draft",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orgId,channel,brief})});
      const body=await res.json(); if(!res.ok) throw new Error(body.error||"Generation failed"); setResult(body.content);
    } catch(e) {setError(e instanceof Error?e.message:"Unable to generate");}
    setLoading(false);
  }
  return <form onSubmit={generate} className="formstack"><label>Channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="instagram">Instagram</option><option value="facebook">Facebook</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></label>
    <label>What should we promote?<textarea value={brief} onChange={e=>setBrief(e.target.value)} minLength={10} maxLength={1200} required rows={3} placeholder="Introduce our sustainable fashion collection for Diwali…"/></label>
    <button className="btn btnprimary" disabled={loading||disabled}>{loading?"Creating draft…":"✦ Generate AI draft"}</button>
    {disabled && <div className="notice">Viewer access: AI generation requires editor or owner access.</div>}
    {error && <div className="notice" role="alert">{error}</div>}
    {result && <div className="draftresult"><strong>Saved as draft · Not published</strong><p>{result}</p></div>}
  </form>;
}
