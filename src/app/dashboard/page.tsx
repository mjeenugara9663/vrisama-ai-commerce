import Link from "next/link";
import { createWorkspace, signOut } from "@/app/actions";
import { requireUser } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function DashboardHome({ searchParams }: {searchParams:Promise<{error?:string}>}) {
  const { db, user } = await requireUser();
  const { data: memberships } = await db.from("org_members").select("org_id,role").eq("user_id",user.id);
  const ids = (memberships ?? []).map(m=>m.org_id);
  const { data: orgs } = ids.length ? await db.from("organizations").select("id,name,slug").in("id",ids).order("created_at",{ascending:false}) : {data:[]};
  const { error } = await searchParams;
  return <main className="shell workspacepage"><div className="pagehead"><div><div className="eyebrow">FOUNDER CONSOLE</div><h1>Your businesses<span className="dot">.</span></h1><p>Each workspace is independently secured, managed and billed.</p></div><form action={signOut}><button className="btn btnoutline">Sign out</button></form></div>
    {error && <div className="notice">Could not create the workspace. Check your details, or choose another slug.</div>}
    <section className="workspacesection"><h2>Active workspaces <span className="muted">({orgs?.length ?? 0})</span></h2><div className="workspacegrid">
      {(orgs ?? []).map((org)=><Link className="workspacecard" href={`/dashboard/${org.id}`} key={org.id}><span className="workspaceicon">{org.name.slice(0,1).toUpperCase()}</span><div><h3>{org.name}</h3><p>/s/{org.slug}</p><span>Manage workspace ↗</span></div></Link>)}
      <div className="workspacecard createcard"><div className="eyebrow">+ ADD A BUSINESS</div><h3>Create a new workspace</h3><form action={createWorkspace} className="formstack"><label>Business name<input name="name" required minLength={2} maxLength={100} placeholder="e.g. Vrisama Fashion"/></label><label>Optional URL slug<input name="slug" maxLength={45} placeholder="e.g. vrisama-fashion"/></label><button className="btn btnprimary full">Create workspace →</button></form></div>
    </div></section>
  </main>;
}
