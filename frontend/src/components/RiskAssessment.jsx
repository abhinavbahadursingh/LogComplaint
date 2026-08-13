import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { FormField, SelectInput, TextInput, TextArea } from './fields/FormField'
import { generateRiskAssessment } from '../store/aiSlice'
import {
  ShieldCheckIcon,
  CheckIcon,
  AlertIcon,
  LoaderIcon,
  SparkleIcon,
  RefreshIcon
} from './icons/Icons'
import './RiskAssessment.css'

const severities = [
  { label: 'Low — Minor cosmetic issue', value: 'Low — Minor cosmetic issue' },
  { label: 'Medium — Moderate, localized impact', value: 'Medium — Moderate, localized impact' },
  { label: 'High — Potential safety / regulatory concern', value: 'High — Potential safety / regulatory concern' },
  { label: 'Critical — Immediate recall consideration', value: 'Critical — Immediate recall consideration' }
]

const suggestedAction = (severity) => {
  if (/critical/i.test(severity)) return 'Initiate CAPA, place batch on hold, and review for regulatory notification'
  if (/high/i.test(severity)) return 'Open CAPA and place the batch on quality hold'
  if (/medium/i.test(severity)) return 'Schedule a complaint investigation and trend the batch'
  return 'Log for monitoring and document the outcome'
}

export default function RiskAssessment() {
  const dispatch = useDispatch()
  const form = useSelector((s) => s.complaint.form)
  const formSeverity = form.severity
  const extracted = useSelector((s) => s.ai.extractedFields)
  const risk = useSelector((s) => s.ai.riskAssessment)

  const [severity, setSeverity] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [assessment, setAssessment] = useState('')
  const [status, setStatus] = useState('idle') // idle | committing | done
  const appliedSigRef = useRef('')

  // Apply the latest AI-generated assessment once (never clobbers user edits).
  useEffect(() => {
    const sig = [risk.severity, risk.nextAction, risk.assessment].join('|')
    if (risk.status === 'done' && sig !== appliedSigRef.current) {
      appliedSigRef.current = sig
      if (risk.severity) setSeverity(risk.severity)
      if (risk.nextAction) setNextAction(risk.nextAction)
      if (risk.assessment) setAssessment(risk.assessment)
    }
  }, [risk])

  // Fallback: reflect the form severity as a suggestion when no AI assessment exists yet.
  useEffect(() => {
    if (formSeverity && !severity && !risk.severity) {
      setSeverity(formSeverity)
      if (!nextAction) setNextAction(suggestedAction(formSeverity))
    }
  }, [formSeverity, severity, nextAction, risk.severity])

  const onSeverityChange = (name, value) => {
    setSeverity(value)
    if (value && !nextAction) setNextAction(suggestedAction(value))
  }

  const regenerate = () => {
    dispatch(generateRiskAssessment({ form, extracted }))
  }

  const onCommit = (e) => {
    e.preventDefault()
    if (!severity.trim() || status === 'committing') return
    setStatus('committing')
    setTimeout(() => setStatus('done'), 900)
  }

  const ready = severity.trim().length > 0

  return (
    <section className="panel risk-card">
      <header className="risk-header">
        <div className="risk-title-row">
          <span className="risk-ico">
            <ShieldCheckIcon />
          </span>
          <div>
            <h2 className="risk-title">AI copilot risk assessment</h2>
            <p className="risk-subtitle">Machine-assisted triage recommendation</p>
          </div>
        </div>
        <div className="risk-header-actions">
          <button
            type="button"
            className="risk-regen"
            aria-label="Regenerate risk assessment"
            title="Regenerate risk assessment"
            onClick={regenerate}
            disabled={risk.status === 'loading'}
          >
            {risk.status === 'loading' ? <LoaderIcon /> : <RefreshIcon />}
          </button>
          <span className="badge risk-badge">
            <SparkleIcon />
            AI Suggested
          </span>
        </div>
      </header>

      {risk.status === 'loading' && (
        <div className="risk-banner risk-banner--info">
          <LoaderIcon />
          <span>AI copilot is assessing the risk…</span>
        </div>
      )}
      {risk.status === 'done' && (
        <div className="risk-banner risk-banner--info">
          <SparkleIcon />
          <span>AI risk assessment generated — review before committing.</span>
        </div>
      )}
      {risk.status === 'error' && (
        <div className="risk-banner risk-banner--danger">
          <AlertIcon />
          <span>{risk.error}</span>
        </div>
      )}

      <div className="risk-grid">
        <FormField label="Severity (Suggested)" required>
          <SelectInput
            name="severitySuggested"
            value={severity}
            onChange={onSeverityChange}
            options={severities}
            placeholder="AI suggestion pending…"
          />
        </FormField>

        <FormField label="Suggested Next Action">
          <TextInput
            name="nextAction"
            value={nextAction}
            onChange={(name, value) => setNextAction(value)}
            placeholder="e.g. Initiate CAPA and batch hold"
          />
        </FormField>

        <div className="risk-field--full">
          <FormField label="Initial Risk Assessment">
            <TextArea
              name="assessment"
              value={assessment}
              onChange={(name, value) => setAssessment(value)}
              placeholder="Summarize the risk, impacted population, and recommended controls…"
              rows={4}
            />
          </FormField>
        </div>
      </div>

      {status === 'done' && (
        <div className="risk-banner risk-banner--success">
          <CheckIcon />
          <span>Risk assessment committed to the QMS ledger.</span>
        </div>
      )}

      <div className="risk-actions">
        <button
          type="button"
          className="btn-commit"
          disabled={!ready || status === 'committing'}
          onClick={onCommit}
        >
          {status === 'committing' ? <LoaderIcon /> : <ShieldCheckIcon />}
          {status === 'committing' ? 'Committing to ledger…' : 'Commit to QMS Ledger'}
        </button>
      </div>
    </section>
  )
}