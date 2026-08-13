import React from 'react'
import { useSelector } from 'react-redux'
import { checkCompleteness, OPTIONAL_FIELDS, isFilled } from '../utils/completeness'
import { ClipboardCheckIcon, CheckIcon, AlertIcon, InfoIcon } from './icons/Icons'
import './CompletenessChecker.css'

export default function CompletenessChecker() {
  const form = useSelector((s) => s.complaint.form)
  const hasData = Object.values(form).some((v) => v !== undefined && v !== null && String(v).trim() !== '')
  if (!hasData) return null
  const result = checkCompleteness(form)
  const optionalFilled = OPTIONAL_FIELDS.filter((f) => isFilled(form[f.key])).length

  return (
    <section className="panel check-card">
      <header className="check-header">
        <div className="check-title-row">
          <span className="check-ico">
            <ClipboardCheckIcon />
          </span>
          <div>
            <h2 className="check-title">Completeness Checker</h2>
            <p className="check-subtitle">QA intake readiness checklist</p>
          </div>
        </div>
        <span className={`badge check-badge check-badge--${result.complete ? 'ok' : 'warn'}`}>
          {result.complete ? <CheckIcon /> : <AlertIcon />}
          {result.complete ? 'Complete' : `${result.missing.length} missing`}
        </span>
      </header>

      {result.complete ? (
        <div className="check-banner check-banner--success">
          <CheckIcon />
          <span>Complaint record is complete — ready for triage.</span>
        </div>
      ) : (
        <div className="check-banner check-banner--warn">
          <AlertIcon />
          <span>
            {result.missing.length} required field{result.missing.length === 1 ? '' : 's'} still missing.
            Missing fields are highlighted in the form below.
          </span>
        </div>
      )}

      <div className="check-progress">
        <div className="check-progress-head">
          <span className="check-progress-label">Required fields</span>
          <span className="check-progress-count">
            {result.filledCount}/{result.requiredCount}
          </span>
        </div>
        <div className="check-bar">
          <div
            className={`check-bar-fill check-bar-fill--${result.complete ? 'ok' : 'warn'}`}
            style={{ width: `${result.score}%` }}
          />
        </div>
        <span className="check-percent">{result.score}%</span>
      </div>

      <ul className="check-list">
        {result.required.map((f) => (
          <li key={f.key} className={`check-item ${f.filled ? 'check-item--ok' : 'check-item--miss'}`}>
            <span className="check-item-ico">{f.filled ? <CheckIcon /> : <AlertIcon />}</span>
            <span className="check-item-label">{f.label}</span>
            <span className="check-item-state">{f.filled ? 'filled' : 'missing'}</span>
          </li>
        ))}
      </ul>

      <div className="check-optional">
        <div className="check-optional-head">
          <InfoIcon />
          <span>
            Optional fields ({optionalFilled}/{OPTIONAL_FIELDS.length} filled) — recommended for full traceability
          </span>
        </div>
        <ul className="check-optional-list">
          {OPTIONAL_FIELDS.map((f) => (
            <li key={f.key} className={`check-optional-item ${isFilled(form[f.key]) ? 'check-optional-item--ok' : ''}`}>
              <span className="check-optional-dot" />
              {f.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}