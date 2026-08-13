import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { ClipboardCheckIcon, CheckIcon, AlertIcon, LoaderIcon, RefreshIcon, SearchIcon } from './icons/Icons'
import './RootCause.css'

export default function RootCause() {
  const form = useSelector((s) => s.complaint.form)
  const hasData = Object.values(form).some((v) => v !== undefined && v !== null && String(v).trim() !== '')
  const [status, setStatus] = useState('idle') // idle | checking | done | error
  const [result, setResult] = useState({ likelyCauses: [], nextSteps: [], product: null, batch: null })
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  const run = (debounce = 500) => {
    if (!hasData) return
    setStatus('checking')
    setError('')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/ai/root-cause', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: form })
        })
        if (!res.ok) throw new Error('Root cause analysis failed')
        setResult(await res.json())
        setStatus('done')
      } catch (err) {
        setStatus('error')
        setError(err.message)
      }
    }, debounce)
  }

  useEffect(() => {
    if (hasData) run(500)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  if (!hasData) return null

  const ready = status === 'done' && result.likelyCauses?.length

  return (
    <section className="panel rc-card">
      <header className="rc-header">
        <div className="rc-title-row">
          <span className="rc-ico">
            <ClipboardCheckIcon />
          </span>
          <div>
            <h2 className="rc-title">Root Cause Recommendation</h2>
            <p className="rc-subtitle">Investigation guidance for the reported defect</p>
          </div>
        </div>
        <button
          type="button"
          className="rc-regen"
          title="Regenerate root cause guidance"
          aria-label="Regenerate root cause guidance"
          onClick={() => run(0)}
          disabled={status === 'checking'}
        >
          {status === 'checking' ? <LoaderIcon /> : <RefreshIcon />}
        </button>
      </header>

      {status === 'checking' && (
        <div className="rc-banner rc-banner--info">
          <LoaderIcon />
          <span>Analyzing complaint details for likely root causes…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="rc-banner rc-banner--danger">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {ready && (
        <>
          {(result.product || result.batch) && (
            <div className="rc-context">
              {result.product && <span>Product: {result.product}</span>}
              {result.batch && <span>Batch: {result.batch}</span>}
            </div>
          )}

          <div className="rc-block">
            <div className="rc-block-head">
              <SearchIcon />
              <span>Likely root causes</span>
            </div>
            <ul className="rc-list">
              {result.likelyCauses.map((c) => (
                <li key={c} className="rc-list-item">
                  <span className="rc-dot" />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <div className="rc-block">
            <div className="rc-block-head">
              <CheckIcon />
              <span>Recommended investigation steps</span>
            </div>
            <ol className="rc-steps">
              {result.nextSteps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  )
}