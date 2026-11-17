import { Link } from 'react-router-dom'

export function Privacy() {
  return <div className="card mx-auto max-w-3xl p-6 text-sm leading-7 text-slate-600 sm:p-8">
    <h1 className="text-2xl font-black text-ink">Privacy notice (academic demo)</h1>
    <p className="mt-3">BiletFlow is a university Software Engineering project running entirely on your own computer (localhost). Data you enter — account details, orders, support messages — is stored only in the local PostgreSQL database of this installation.</p>
    <ul className="mt-3 list-disc pl-5"><li>Passwords are stored as bcrypt hashes, never in plain text.</li><li>No real payment card or bank data is collected. All payments, payouts and refunds are DEMO transactions.</li><li>E-mails are delivered to a local test inbox (Mailpit), not to the real internet.</li><li>Favourites and language choice are kept in your browser’s local storage for convenience.</li></ul>
  </div>
}

export function NotFound() {
  return <div className="py-24 text-center"><p className="text-6xl font-black text-brand">404</p><h1 className="mt-3 text-xl font-bold">Page not found</h1><Link to="/" className="btn-primary mt-6">Back to events</Link></div>
}
