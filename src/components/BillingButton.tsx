"use client";
import { useState } from "react";
export function BillingButton({ orgId, disabled = false }: {orgId:string; disabled?:boolean}) {
  const [plan,setPlan]=useState("starter");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  async function subscribe() {
    setBusy(true);setMessage("");
    try {
      const res=await fetch("/api/billing/create",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orgId,plan})});
      const body=await res.json(); if(!res.ok) throw new Error(body.error||"Billing is unavailable");
      if(body.checkoutUrl && new URL(body.checkoutUrl).protocol === 'https:') window.location.href=body.checkoutUrl;
      else setMessage(`Subscription created: ${body.subscriptionId}. Complete authorization from your Razorpay account; hosted link unavailable.`);
    } catch(e){setMessage(e instanceof Error?e.message:"Unable to start billing");}
    setBusy(false);
  }
  return <div className="billingcontrols"><select aria-label="Select plan" value={plan} onChange={e=>setPlan(e.target.value)}><option value="starter">Starter · ₹999 / month</option><option value="business">Business · ₹2,499 / month</option><option value="growth">Growth · ₹5,999 / month</option></select>
    <button onClick={subscribe} disabled={busy||disabled} className="btn btnoutline" type="button">{busy?"Connecting…":"Upgrade plan ↗"}</button>{message&&<div className="notice">{message}</div>}
  </div>;
}
