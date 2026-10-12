'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CircleAlert, LogOut, RefreshCw, Search, Wifi, WifiOff, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Invoice = {
  id: string
  seller_name: string | null
  vat_number: string | null
  invoice_timestamp: string | null
  total_including_vat: number | string | null
  vat_amount: number | string | null
  is_duplicate?: boolean | null
}

const fields = 'id,seller_name,vat_number,invoice_timestamp,total_including_vat,vat_amount,is_duplicate'
const currency = new Intl.NumberFormat('en-SA', { style: 'currency', currency: 'SAR', minimumFractionDigits: 2 })
const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' })

function money(value: Invoice['total_including_vat']) { return currency.format(Number(value ?? 0)) }
function formatDate(value: string | null) { if (!value) return 'Not available'; const raw = value.includes('Z') || value.includes('+') ? value : `${value}+03:00`; return date.format(new Date(raw)) }
function todayRiyadh(value: string | null) { if (!value) return false; const raw = value.includes('Z') || value.includes('+') ? value : `${value}+03:00`; return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date(raw)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date()) }

export default function Page() {
  const supabase = createClient()
  const [session, setSession] = useState<any>(null)
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [realtime, setRealtime] = useState<'connecting' | 'connected' | 'error'>('connecting')
  const [queue, setQueue] = useState<Invoice[]>([])

  async function loadInvoices() {
    setLoading(true); setError('')
    const { data, error: fetchError } = await supabase.from('invoices').select(fields).eq('is_duplicate', false).order('invoice_timestamp', { ascending: false })
    if (fetchError) setError('Invoices could not be loaded. Check the table read policy for authenticated users.')
    else setInvoices((data ?? []) as Invoice[])
    setLoading(false)
  }

  useEffect(() => { supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) }); const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next)); return () => listener.subscription.unsubscribe() }, [supabase])
  useEffect(() => { if (!session) return; loadInvoices(); const channel = supabase.channel('invoice-inserts').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invoices' }, (payload) => { const invoice = payload.new as Invoice; if (invoice.is_duplicate) return; setInvoices((current) => current.some((item) => item.id === invoice.id) ? current : [invoice, ...current]); setQueue((current) => [...current, invoice]); }).subscribe((status) => setRealtime(status === 'SUBSCRIBED' ? 'connected' : status === 'CHANNEL_ERROR' ? 'error' : 'connecting')); return () => { supabase.removeChannel(channel) } }, [session, supabase])

  const visible = useMemo(() => invoices.filter((invoice) => `${invoice.seller_name ?? ''} ${invoice.vat_number ?? ''}`.toLowerCase().includes(query.toLowerCase())), [invoices, query])
  const total = invoices.reduce((sum, invoice) => sum + Number(invoice.total_including_vat ?? 0), 0)
  const vat = invoices.reduce((sum, invoice) => sum + Number(invoice.vat_amount ?? 0), 0)
  const today = invoices.filter((invoice) => todayRiyadh(invoice.invoice_timestamp)).length
  const activePopup = queue[0]

  async function signIn(event: React.FormEvent) { event.preventDefault(); setAuthError(''); const { error: signInError } = await supabase.auth.signInWithPassword({ email, password }); if (signInError) setAuthError('Invalid email or password. If your email is unconfirmed, check your inbox.') }
  async function signOut() { await supabase.auth.signOut(); setInvoices([]) }

  if (!ready) return <main className="center-state"><RefreshCw className="spin" size={22} /><span>Connecting securely…</span></main>
  if (!session) return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">IB</div><p className="eyebrow">IMAN BAKERY</p><h1>Invoice Dashboard</h1><p className="muted">Sign in to view your ZATCA invoices.</p><form onSubmit={signIn}><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>{authError && <p className="form-error"><CircleAlert size={16} />{authError}</p>}<button className="primary wide" type="submit">Sign in</button></form><p className="auth-note">Private read-only access · Saudi Arabia</p></section></main>

  return <main className="dashboard"><header className="topbar"><div className="brand"><div className="brand-mark small">IB</div><div><p className="eyebrow">IMAN BAKERY</p><h1>Invoice Dashboard</h1></div></div><div className="header-actions"><span className={`connection ${realtime === 'connected' ? 'online' : ''}`}><span className="status-dot" />{realtime === 'connected' ? 'Live connection' : realtime === 'error' ? 'Realtime unavailable' : 'Connecting'}</span><button className="ghost" onClick={signOut}><LogOut size={17} />Sign out</button></div></header><div className="content"><div className="intro"><div><p className="eyebrow">OVERVIEW</p><h2>Invoices</h2><p className="muted">Your latest tax invoices, all in one place.</p></div><button className="primary" onClick={loadInvoices} disabled={loading}><RefreshCw size={17} className={loading ? 'spin' : ''} />Refresh</button></div><section className="stats"><Stat label="Invoices" value={String(invoices.length)} tone="green" /><Stat label="Total including VAT" value={money(total)} tone="cream" /><Stat label="VAT total" value={money(vat)} tone="blue" /><Stat label="Received today" value={String(today)} tone="lavender" /></section><div className="toolbar"><div className="search"><Search size={18} /><input aria-label="Search invoices" placeholder="Search by seller or VAT number" value={query} onChange={(e) => setQuery(e.target.value)} /></div><p className="result-count">{visible.length} {visible.length === 1 ? 'invoice' : 'invoices'}</p></div>{error ? <div className="empty error-state"><CircleAlert size={28} /><h3>We couldn&apos;t load invoices</h3><p>{error}</p></div> : visible.length === 0 ? <div className="empty"><div className="empty-icon"><CheckCircle2 size={25} /></div><h3>{query ? 'No matching invoices' : 'No invoices yet'}</h3><p>{query ? 'Try a different seller name or VAT number.' : 'New invoices from your Shortcut will appear here automatically.'}</p></div> : <section className="invoice-grid">{visible.map((invoice) => <InvoiceCard key={invoice.id} invoice={invoice} />)}</section>}</div>{activePopup && <div className="modal-backdrop"><section className="success-modal" role="dialog" aria-modal="true" aria-labelledby="success-title"><button className="close" aria-label="Close" onClick={() => setQueue((current) => current.slice(1))}><X size={19} /></button><div className="success-icon"><CheckCircle2 size={27} /></div><p className="eyebrow">NEW INVOICE</p><h2 id="success-title">Invoice added successfully</h2><p className="muted">A new invoice is ready in your dashboard.</p><div className="modal-details"><Detail label="Seller name" value={activePopup.seller_name ?? 'Not available'} /><Detail label="VAT number" value={activePopup.vat_number ?? 'Not available'} /><Detail label="Invoice timestamp" value={formatDate(activePopup.invoice_timestamp)} /><Detail label="Total including VAT" value={money(activePopup.total_including_vat)} /><Detail label="VAT amount" value={money(activePopup.vat_amount)} /></div><button className="primary wide" onClick={() => setQueue((current) => current.slice(1))}>OK</button></section></div>}</main>
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) { return <article className={`stat ${tone}`}><p>{label}</p><strong>{value}</strong></article> }
function Detail({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b dir={label === 'Seller name' ? 'auto' : undefined}>{value}</b></div> }
function InvoiceCard({ invoice }: { invoice: Invoice }) { return <article className="invoice-card"><div className="invoice-heading"><div className="seller" dir="auto">{invoice.seller_name || 'Unnamed seller'}</div><span className="verified"><CheckCircle2 size={15} />Valid record</span></div><p className="vat" dir="ltr">VAT {invoice.vat_number || 'Not available'}</p><div className="invoice-details"><Detail label="Invoice timestamp" value={formatDate(invoice.invoice_timestamp)} /><Detail label="Total including VAT" value={money(invoice.total_including_vat)} /><Detail label="VAT amount" value={money(invoice.vat_amount)} /></div></article> }
