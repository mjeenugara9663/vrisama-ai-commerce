import Link from "next/link";
export default function Home() {
  return <main>
    <section className="hero shell">
      <div className="eyebrow"><span className="spark"/> YOUR BUSINESS, ONE COMMAND CENTER</div>
      <h1>Launch a business.<br/><span className="gradient-text">Run it intelligently.</span></h1>
      <p>Build your digital storefront, manage leads and generate marketing content — all from a unified AI-powered workspace.</p>
      <div className="heroactions"><Link className="btn btnprimary" href="/login">Start your free trial →</Link><Link className="btn btnoutline" href="/#features">Explore the platform ↓</Link></div>
      <div className="herofoot"><span>✧ 14-day trial</span><span>✧ Separate business workspaces</span><span>✧ Draft-first AI</span></div>
      <div className="dashboardmock" aria-label="Illustration of the product dashboard">
        <div className="mocksidebar"><span className="mocklogo">V</span><span>Overview</span><span>Storefront</span><span>Products</span><span>Leads</span><span>AI Studio</span><span>Billing</span></div>
        <div className="mockmain"><div className="eyebrow">YOUR BUSINESS AT A GLANCE</div><h3>Good morning, Founder ✦</h3>
          <div className="mockgrid"><div><small>VISITORS</small><strong>1,284</strong><span>↑ Example</span></div><div><small>NEW LEADS</small><strong>48</strong><span>↑ Example</span></div><div><small>ACTIVE PRODUCTS</small><strong>12</strong><span>● Live preview</span></div></div>
          <div className="mockbottom"><div className="mockchart"><div className="chartheading">Growth overview · illustrative</div><div className="chartbars">{[28,52,40,68,54,85,73,100,81,95,88,120].map((h,i)=><i key={i} style={{height:`${h}px`}}/>)}</div></div><div className="mockassistant"><div className="eyebrow">AI STUDIO</div><strong>Let&apos;s create something great.</strong><p>Write campaign content for a new collection.</p><span>Generate draft →</span></div></div>
        </div>
      </div>
    </section>
    <section id="features" className="section shell"><div className="sectionlabel">ONE PLATFORM. MANY POSSIBILITIES.</div><h2>Everything to move your<br/>business forward.</h2><div className="featuregrid">
      {[
        ["01","Storefront builder","Publish a polished catalog storefront and capture customer inquiries."],
        ["02","Product catalog","Manage products, descriptions, prices and visibility per business."],
        ["03","Lead command center","Track inquiries and move each lead from new to closed."],
        ["04","AI marketing studio","Create channel-specific copy drafts, with human review before posting."],
        ["05","Multi-tenant security","Each business has its own workspace, roles and protected data."],
        ["06","Automation-ready","Connect your internal n8n workflows and subscription billing."]
      ].map(([n,t,d])=><article className="feature" key={n}><div className="featuretop"><span>{n}</span><span>✳</span></div><h3>{t}</h3><p>{d}</p></article>)}
    </div></section>
    <section id="pricing" className="section shell"><div className="sectionlabel">GROW ON YOUR TERMS</div><h2>Simple, transparent pricing.</h2><p className="sectiondesc">Illustrative launch pricing. Usage caps apply; integrations and ad spend may cost extra.</p>
      <div className="pricinggrid">{[{t:"Starter",p:"999",d:"For small shops",a:["1 storefront","50 AI drafts / month","Leads & catalog"]},{t:"Business",p:"2,499",d:"For growing teams",a:["1 storefront","300 AI drafts / month","Internal automation hooks"]},{t:"Growth",p:"5,999",d:"For ambitious brands",a:["1 storefront","1,000 AI drafts / month","Higher usage allowance"]}].map((p,i)=><article className={`pricecard ${i===1?'featured':''}`} key={p.t}><span className="plan">{p.t}</span><h3>₹{p.p}<small>/mo</small></h3><p>{p.d}</p><ul>{p.a.map(t=><li key={t}>✓ {t}</li>)}</ul><Link className="btn btnoutline full" href="/login">Start trial →</Link></article>)}</div>
    </section>
  </main>;
}
