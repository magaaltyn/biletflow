import { Component, type ReactNode } from 'react'

/** Shows a friendly message instead of a blank page if a screen crashes while rendering. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }) }
  render() {
    if (!this.state.error) return this.props.children
    return <div className="mx-auto max-w-lg rounded-2xl border border-rose-100 bg-white p-8 text-center"><h1 className="text-xl font-black">Something went wrong on this page</h1><p className="mt-2 break-words text-sm text-slate-500">{this.state.error.message}</p><button onClick={() => window.location.reload()} className="btn-primary mt-5">Reload page</button></div>
  }
}
