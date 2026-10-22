import Link from "next/link";
import { redirect } from "next/navigation";
import { AiDraft } from "@/components/AiDraft";
import { BillingButton } from "@/components/BillingButton";
import { createProduct, deleteProduct, setProductActive, updateSite, updateLeadStatus, signOut } from "@/app/actions";
import { requireOrg } from "@/lib/auth";
import { hasAutomation, isEntitled } from "@/lib/utils";
export const dynamic = "force-dynamic";
const ERRORS: Record<string, string> = {
  forbidden: "Your role does not allow that action. Ask the workspace owner for editor access.",
  "invalid-product": "Check the product name, price and image URL (images must be HTTPS).",
  "product-save-failed": "We couldn't save that product. Please retry.",
  "product-limit": "This workspace has reached its 500-product limit.",
  "invalid-site": "Check the store title and accent colour.",
  "site-update-failed": "We couldn't save your storefront. Please retry.",
};
const inr = (n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
export default async function Workspace({params,searchParams}:{params:Promise<{orgId:string}>;searchParams:Promise<{error?:string}>}) {
  const { orgId } = await params;
  const { db, role } = await requireOrg(orgId);
  const [orgR,siteR,productsR,leadsR,draftsR,subR,searchesR,googleR] = await Promise.all([
    db.from("organizations").select("name,slug").eq("id",orgId).single(),
    db.from("sites").select("id,slug,title,tagline,accent,published").eq("org_id",orgId).single(),
    db.from("products").select("id,name,price_inr,is_active,created_at").eq("org_id",orgId).order("created_at",{ascending:false}).limit(50),
    db.from("leads").select("id,visitor_name,visitor_email,visitor_phone,message,status,search_term,created_at").eq("org_id",orgId).order("created_at",{ascending:false}).limit(50),
    db.from("marketing_drafts").select("id,channel,content,created_at").eq("org_id",orgId).order("created_at",{ascending:false}).limit(5),
    db.from("subscriptions").select("plan,status,trial_ends_at,current_period_end").eq("org_id",orgId).maybeSingle(),
    role==="viewer" ? Promise.resolve({data:null}) : db.rpc("store_search_summary",{p_org:orgId,p_days:30}),
    role==="viewer" ? Promise.resolve({data:null}) : db.from("search_queries").select("query,clicks,impressions,ctr,position,period_start,period_end,synced_at").eq("org_id",orgId).order("impressions",{ascending:false}).limit(15)
  ]);
  const org = orgR.data; const site=siteR.data; if(!org||!site) redirect("/dashboard");
  const products=productsR.data ?? [];const leads=leadsR.data??[];const drafts=draftsR.data??[];const sub=subR.data;
  const searches=(searchesR.data ?? []) as {term:string;searches:number;no_result_searches:number}[];
  const googleQueries=(googleR.data ?? []) as {query:string;clicks:number;impressions:number;ctr:number;position:number;period_start:string;period_end:string;synced_at:string}[];
  const edit=role!=="viewer"; const owner=role==="owner";
  const entitled=isEntitled(sub); const automation=hasAutomation(sub);
  const {error}=await searchParams;
  return <main className="shell workspacepage">
    <div className="crumb"><Link href="/dashboard">← Workspaces</Link><span>/</span><span>{org.name}</span><span className="rolepill">{role}</span></div>
    <div className="pagehead"><div><div className="eyebrow">WORKSPACE CONTROL CENTER</div><h1>{org.name}<span className="dot">.</span></h1><p>Manage your storefront, customers and AI-assisted marketing.</p></div><form action={signOut}><button className="btn btnoutline">Sign out</button></form></div>
    {error&&<div className="notice" role="alert">{ERRORS[error] ?? "We couldn\u2019t save that change. Please check your inputs and retry."}</div>}
    {!entitled&&<div className="notice" role="alert"><strong>Your trial or subscription has ended.</strong> Your storefront is hidden from the public and AI drafts are paused. Your data is safe — choose a plan under Plan &amp; billing to go live again.</div>}
    <div className="statgrid"><div className="stat"><small>PRODUCTS</small><strong>{products.length}</strong><span>Catalog items</span></div><div className="stat"><small>LEADS</small><strong>{leads.length}</strong><span>Latest 50 shown</span></div><div className="stat"><small>AI DRAFTS</small><strong>{drafts.length}</strong><span>Latest 5 shown</span></div><div className="stat"><small>STOREFRONT</small><strong>{site.published&&entitled?"Live":site.published?"Paused":"Draft"}</strong><span>{site.published&&entitled?"Publicly accessible":site.published?"Subscription needed":"Only your team can preview"}</span></div></div>
    <div className="workspacecolumns"><div className="maincolumn">
      <section className="panel" id="storefront"><div className="panelhead"><div><div className="eyebrow">01 / DIGITAL PRESENCE</div><h2>Storefront</h2></div>{site.published&&entitled?<Link target="_blank" href={`/s/${site.slug}`} className="pillsmall">View live ↗</Link>:<span className="pillsmall">Publish to view</span>}</div>
        <p className="helptext">Your URL: <code>/s/{site.slug}</code></p>
        <form action={updateSite} className="formstack"><input type="hidden" name="org_id" value={orgId}/><div className="twocol"><label>Store title<input name="title" defaultValue={site.title} minLength={2} maxLength={100} required disabled={!edit}/></label><label>Accent color<input name="accent" type="color" defaultValue={site.accent} disabled={!edit}/></label></div><label>Store tagline<textarea name="tagline" defaultValue={site.tagline} maxLength={260} rows={2} disabled={!edit}/></label><label className="checkrow"><input name="published" type="checkbox" defaultChecked={site.published} disabled={!edit}/> Publish storefront to the public</label><button disabled={!edit} className="btn btnprimary">Save storefront</button></form>
      </section>
      <section className="panel" id="products"><div className="panelhead"><div><div className="eyebrow">02 / WHAT YOU SELL</div><h2>Product catalog</h2></div><span className="pillsmall">{products.length} items</span></div>
        <div className="itemlist">{products.map(p=><div className="itemrow" key={p.id}><span className="avatarproduct">{p.name.slice(0,1).toUpperCase()}</span><div className="itemname"><strong>{p.name}</strong><small>{p.is_active?"Active":"Hidden"}</small></div><span className="money">{inr(Number(p.price_inr))}</span>{edit&&<span className="rowactions"><form action={setProductActive}><input type="hidden" name="org_id" value={orgId}/><input type="hidden" name="product_id" value={p.id}/><input type="hidden" name="active" value={p.is_active?"false":"true"}/><button className="smallbutton" type="submit">{p.is_active?"Hide":"Show"}</button></form><form action={deleteProduct}><input type="hidden" name="org_id" value={orgId}/><input type="hidden" name="product_id" value={p.id}/><button className="smallbutton danger" type="submit" aria-label={`Delete ${p.name}`}>Delete</button></form></span>}</div>)}{products.length===0&&<p className="empty">No products yet. Add the first one below.</p>}</div>
        <div className="subpanel"><h3>Add product</h3><form action={createProduct} className="formstack"><input type="hidden" name="org_id" value={orgId}/><div className="twocol"><label>Product name<input name="name" minLength={2} maxLength={100} required disabled={!edit} placeholder="Signature cotton kurta"/></label><label>Price (INR)<input name="price_inr" type="number" min="0" step="0.01" required defaultValue="0" disabled={!edit}/></label></div><label>Description<textarea name="description" rows={2} maxLength={1000} disabled={!edit} placeholder="Details your customers will love"/></label><label>Product image URL (optional)<input name="image_url" type="url" disabled={!edit} placeholder="https://example.com/product.jpg"/></label><button disabled={!edit} className="btn btnoutline">+ Add to catalog</button></form></div>
      </section>
      <section className="panel" id="leads"><div className="panelhead"><div><div className="eyebrow">03 / INCOMING OPPORTUNITIES</div><h2>Lead inbox</h2></div><span className="pillsmall">Latest {leads.length}</span></div>
        <div className="itemlist">{leads.map(l=><div key={l.id} className="leadrow"><div><strong>{l.visitor_name}</strong><p>{l.visitor_email||l.visitor_phone||"No contact"}</p><small>{l.message||"New storefront inquiry"}</small>{l.search_term&&<small> · searched for &ldquo;{l.search_term}&rdquo;</small>}</div><form action={updateLeadStatus}><input type="hidden" name="org_id" value={orgId}/><input type="hidden" name="lead_id" value={l.id}/><select name="status" defaultValue={l.status} disabled={!edit} aria-label={`Status for ${l.visitor_name}`}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="closed">Closed</option></select><button disabled={!edit} className="smallbutton">Save</button></form></div>)}{leads.length===0&&<p className="empty">Leads from your public storefront will appear here.</p>}</div>
      </section>
      <section className="panel" id="search"><div className="panelhead"><div><div className="eyebrow">04 / DEMAND SIGNALS</div><h2>Search insights</h2></div><span className="pillsmall">Last 30 days</span></div>
        <p className="helptext">What people look for — anonymous, never tied to a person. Turn gaps into products, and follow up with the leads who searched.</p>
        {role==="viewer"?<p className="empty">Search insights are visible to editors and owners.</p>:<>
        <h3>Searches in your store</h3>
        <div className="insightlist">{searches.slice(0,10).map(t=><div className="insightrow" key={t.term}><span>{t.term}{t.no_result_searches>0&&<span className="badge">{t.no_result_searches} with no results</span>}</span><small>{t.searches} {t.searches===1?"search":"searches"}</small></div>)}{searches.length===0&&<p className="empty">No searches yet. Visitors can search on your public storefront.</p>}</div>
        <h3 style={{marginTop:18}}>How people find you on Google</h3>
        <div className="insightlist">{googleQueries.map(g=><div className="insightrow" key={g.query}><span>{g.query}</span><small>{g.impressions.toLocaleString("en-IN")} views · {g.clicks} clicks · avg position {g.position.toFixed(1)}</small></div>)}{googleQueries.length===0&&<p className="empty">No Google data yet. New storefronts take a few weeks to appear in search, and Google reports data with a 2–3 day delay.</p>}</div>
        {googleQueries[0]&&<p className="helptext">Google data for {googleQueries[0].period_start} to {googleQueries[0].period_end}; Google hides rare searches to protect privacy.</p>}
        </>}
      </section>
    </div><aside className="sidecolumn">
      <section className="panel" id="ai"><div className="eyebrow">05 / YOUR CREATIVE COPILOT</div><h2>AI Marketing Studio <span className="aispark">✦</span></h2><p className="helptext">Generate reviewable drafts; nothing is posted automatically.</p><AiDraft orgId={orgId} disabled={!edit}/>
        {drafts.length>0&&<div className="recentdrafts"><h3>Recent drafts</h3>{drafts.map(d=><div key={d.id} className="recentdraft"><strong>{d.channel}</strong><p>{d.content.slice(0,180)}{d.content.length>180?"…":""}</p></div>)}</div>}
      </section>
      <section className="panel" id="billing"><div className="eyebrow">06 / SUBSCRIPTION</div><h2>Plan & billing</h2><div className="billstate"><strong>{sub?.plan || "Unknown"}</strong><span>{sub?.status||"Not available"}</span></div>{sub?.status==="trialing"&&<p className="helptext">Trial ends {new Date(sub.trial_ends_at).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</p>}<p className="helptext">Billing uses Razorpay subscription links when configured.{automation?" Automation hooks are active on your plan.":""}</p><BillingButton orgId={orgId} disabled={!owner}/>{!owner&&<p className="helptext">Only the workspace owner can change the plan.</p>}</section>
      <section className="panel infopanel"><div className="eyebrow">BUILT FOR SCALE</div><h2>One account.<br/>Many businesses.</h2><p>Workspaces use organization-based permissions, separate data and individual billing records.</p><Link href="/dashboard">Switch workspace ↗</Link></section>
    </aside></div>
  </main>;
}
