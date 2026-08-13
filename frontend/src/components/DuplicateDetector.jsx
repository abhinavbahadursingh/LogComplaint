import React, { useEffect, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { SearchIcon, CheckIcon, AlertIcon, LoaderIcon, RefreshIcon } from './icons/Icons'
import './DuplicateDetector.css'

export default function DuplicateDetector() {
  const form = useSelector((s) => s.complaint.form)
  const hasData = Object.values(form).some((v) => v !== undefined && v !== null && String(v).trim() !== '')
  const [status, setStatus] = useState('idle') // idle | checking | done | error
  const [duplicates, setDuplicates] = useState([])
  const [checked, setChecked] = useState(0)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  const run = (debounce = 600) => {
    if (!hasData) return
    setStatus('checking')
    setError('')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/ai/duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: form })
        })
        if (!res.ok) throw new Error('Duplicate check failed')
        const data = await res.json()
        setDuplicates(data.duplicates || [])
        setChecked(data.checked || 0)
        setStatus('done')
      } catch (err) {
        setStatus('error')
        setError(err.message)
      }
    }, debounce)
  }

  useEffect(() => {
    if (hasData) run(600)
    return () => clearTimeout(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form])

  if (!hasData) return null

  return (
    <section className="panel dup-card">
      <header className="dup-header">
        <div className="dup-title-row">
          <span className="dup-ico">
            <SearchIcon />
          </span>
          <div>
            <h2 className="dup-title">Duplicate Complaint Detection</h2>
            <p className="dup-subtitle">Cross-check against logged complaints</p>
          </div>
        </div>
        <button
          type="button"
          className="dup-regen"
          title="Re-check for duplicates"
          aria-label="Re-check for duplicates"
          onClick={() => run(0)}
          disabled={status === 'checking'}
        >
          {status === 'checking' ? <LoaderIcon /> : <RefreshIcon />}
        </button>
      </header>

      {status === 'checking' && (
        <div className="dup-banner dup-banner--info">
          <LoaderIcon />
          <span>Checking for duplicate complaints…</span>
        </div>
      )}
      {status === 'done' && duplicates.length === 0 && (
        <div className="dup-banner dup-banner--success">
          <CheckIcon />
          <span>No duplicate complaints found{checked ? ` among ${checked} logged` : ''}.</span>
        </div>
      )}
      {status === 'done' && duplicates.length > 0 && (
        <div className="dup-banner dup-banner--warn">
          <AlertIcon />
          <span>
            {duplicates.length} potential duplicate{duplicates.length === 1 ? '' : 's'} found of {checked} logged
            complaints.
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="dup-banner dup-banner--danger">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}

      {status === 'done' && duplicates.length > 0 && (
        <ul className="dup-list">
          {duplicates.map((d) => (
            <li key={d.id} className="dup-item">
              <div className="dup-item-top">
                <span className="dup-score">{Math.min(100, d.score)}%</span>
                <span className="dup-reason">{d.reason || 'matched on key details'}</span>
              </div>
              <div className="dup-item-meta">
                {d.existing.customerName && <span>Customer: {d.existing.customerName}</span>}
                {d.existing.productName && <span>Product: {d.existing.productName}</span>}
                {d.existing.batchNumber && <span>Batch: {d.existing.batchNumber}</span>}
                {d.existing.status && <span>Status: {d.existing.status}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}