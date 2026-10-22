"use client";
import Script from "next/script";
import { useRef, useState } from "react";
export function LeadForm({slug, searchTerm, defaultMessage}: {slug:string; searchTerm?:string; defaultMessage?:string}) {
  const [message,setMessage]=useState(""); const [busy,setBusy]=useState(false);
  const formRef=useRef<HTMLFormElement>(null);
  const turnstile=process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  async function submit(e:React.FormEvent<HTMLFormElement>) {
    e.preventDefault();setBusy(true);setMessage("");
    const form=e.currentTarget; const data=new FormData(form);
    const payload={slug,name:String(data.get("name")||""),email:String(data.get("email")||""),phone:String(data.get("phone")||""),message:String(data.get("message")||""),company:String(data.get("company")||""),searchTerm:searchTerm||"",captcha:String(data.get("cf-turnstile-response")||"")};
    try {
      const response=await fetch("/api/leads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Please retry later");
      setMessage("Thanks! Your inquiry has been sent.");formRef.current?.reset();
      // Reset single-use challenge while keeping the thank-you message visible.
      if(turnstile) (window as Window & {turnstile?:{reset:()=>void}}).turnstile?.reset();
    } catch(err){setMessage(err instanceof Error?err.message:"Unable to submit inquiry");}
    setBusy(false);
  }
  return <form className="formstack" ref={formRef} onSubmit={submit}>
    <label>Your name<input name="name" required minLength={2} maxLength={100} placeholder="Your full name"/></label>
    <label>Email<input type="email" name="email" maxLength={254} placeholder="you@example.com"/></label>
    <label>Phone / WhatsApp<input name="phone" maxLength={25} placeholder="Your contact number"/></label>
    <label>What are you looking for?<textarea name="message" maxLength={1000} rows={3} defaultValue={defaultMessage} placeholder="Tell us a little about what you need"/></label>
    <label className="honey" aria-hidden="true">Company website<input name="company" tabIndex={-1} autoComplete="off"/></label>
    {turnstile&&<><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive"/><div className="cf-turnstile" data-sitekey={turnstile}/></>}
    <p className="consent">By sending this, you agree that this business may contact you about your inquiry using the details you provided.</p>
    <button disabled={busy} className="btn btnprimary">{busy?"Sending…":"Send inquiry →"}</button>
    {message&&<p role="status" className="notice">{message}</p>}
  </form>;
}
