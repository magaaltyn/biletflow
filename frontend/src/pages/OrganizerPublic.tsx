import { useNavigate, useParams } from 'react-router-dom'
import { BadgeCheck, Globe, Mail, MapPin } from 'lucide-react'
import { api } from '../lib/api'
import type { EventItem, Organizer } from '../lib/types'
import EventCard from '../components/EventCard'
import { Empty, ErrorState, Loading, useAsync } from '../components/ui'

export default function OrganizerPublic() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, error, loading, reload } = useAsync(() => api.get<Organizer & { events: EventItem[] }>(`/organizers/${id}`), [id])
  if (loading) return <Loading/>
  if (error || !data) return <ErrorState message={error ?? 'Organizer not found'} onRetry={reload}/>
  return <div>
    <div className="card flex flex-wrap items-center gap-5 p-6">{data.logo_url ? <img src={data.logo_url} alt="" className="h-20 w-20 rounded-2xl object-cover"/> : <span className="grid h-20 w-20 place-items-center rounded-2xl bg-blue-50 text-3xl font-black text-brand">{data.name[0]}</span>}<div className="min-w-0 flex-1"><h1 className="flex items-center gap-2 text-2xl font-black">{data.name}{data.verification_status === 'verified' && <BadgeCheck className="text-brand"/>}</h1>{data.description && <p className="mt-1 max-w-2xl text-sm text-slate-600">{data.description}</p>}<div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">{data.city && <span className="flex items-center gap-1"><MapPin size={13}/>{data.city}</span>}{data.contact_email && <a href={`mailto:${data.contact_email}`} className="flex items-center gap-1 hover:text-brand"><Mail size={13}/>{data.contact_email}</a>}{data.website && <a href={data.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-brand"><Globe size={13}/>{data.website}</a>}</div></div></div>
    <h2 className="mt-8 text-xl font-extrabold">Upcoming events</h2>
    <div className="mt-4">{data.events.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{data.events.map((e, i) => <EventCard key={e.id} event={e} index={i} onOpen={() => nav(`/events/${e.id}`)}/>)}</div> : <Empty title="No upcoming events"/>}</div>
  </div>
}
