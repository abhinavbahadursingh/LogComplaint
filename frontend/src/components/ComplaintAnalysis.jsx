import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { generateAiAnalysis } from '../store/aiSlice'
import { SparkleIcon, AlertIcon, LoaderIcon, CheckIcon, RefreshIcon } from './icons/Icons'
import './ComplaintAnalysis.css'

const levelTone = (level = '') => {
  const t = level.toLowerCase()
  if (t.includes('critical')) return 'ana-risk--critical'
  if (t.includes('high')) return 'ana-risk--high'
  if (t.includes('medium')) return 'ana-risk--medium'
  return 'ana-risk--low'
}

export default function ComplaintAnalysis() {
  const dispatch = useDispatch()
  const form = useSelector((s) => s.complaint.form)
  const extracted = useSelector((s) => s.ai.extractedFields)
  const analysis = useSelector((s) => s.ai.analysis)

  const onGenerate = () => {
    dispatch(generateAiAnalysis({ form, extracted }))
  }

  const ready = form.customerName || form.productName || form.batchNumber || form.description
  const { status, complaintSummary, riskClassification, capaRecommendation, error } = analysis

  return (
    <section className="panel ana-card">
      <header className="ana-header">
        <div className="ana-title-row">
          <span className="ana-ico">
            <SparkleIcon />
          </span>
          <div>
            <h2 className="ana-title">AI Complaint Analysis</h2>
            <p className="ana-subtitle">CAPA recommendation · Complaint summary · Risk classification</p>
          </div>
        </div>
        <button
          type="button"
          className="ana-generate"
          onClick={onGenerate}
          disabled={!ready || status === 'loading'}
        >
          {status === 'loading' ? <LoaderIcon /> : <RefreshIcon />}
          {status === 'loading' ? 'Analyzing…' : 'Generate Analysis'}
        </button>
      </header>

      {status === 'loading' && (
        <div className="ana-banner ana-banner--info">
          <LoaderIcon />
          <span>AI copilot is generating the complaint analysis…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="ana-banner ana-banner--danger">
          <AlertIcon />
          <span>{error}</span>
        </div>
      )}
      {status === 'done' && (
        <div className="ana-banner ana-banner--success">
          <CheckIcon />
          <span>Analysis generated — review below.</span>
        </div>
      )}

      <div className="ana-grid">
        <div className="ana-block">
          <div className="ana-block-head">
            <span className="ana-block-ico ana-block-ico--summary">S</span>
            <h3 className="ana-block-title">Complaint Summary</h3>
          </div>
          <p className="ana-block-text">
            {status === 'done' ? complaintSummary : 'Generate an analysis to see the AI complaint summary here.'}
          </p>
        </div>

        <div className="ana-block">
          <div className="ana-block-head">
            <span className="ana-block-ico ana-block-ico--risk">R</span>
            <h3 className="ana-block-title">AI Risk Classification</h3>
          </div>
          {status === 'done' && riskClassification ? (
            <>
              <div className={`ana-risk ${levelTone(riskClassification.level)}`}>
                <span className="ana-risk-label">{riskClassification.level}</span>
                <span className="ana-risk-score">{riskClassification.score}</span>
              </div>
              <p className="ana-block-text">{riskClassification.rationale}</p>
            </>
          ) : (
            <p className="ana-block-text">Generate an analysis to see the AI risk classification here.</p>
          )}
        </div>

        <div className="ana-block ana-block--full">
          <div className="ana-block-head">
            <span className="ana-block-ico ana-block-ico--capa">C</span>
            <h3 className="ana-block-title">CAPA Recommendation</h3>
          </div>
          {status === 'done' && capaRecommendation ? (
            <>
              <ul className="ana-capa-list">
                {capaRecommendation.actions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ul>
              <p className="ana-block-text ana-capa-narrative">{capaRecommendation.narrative}</p>
            </>
          ) : (
            <p className="ana-block-text">Generate an analysis to see the AI CAPA recommendation here.</p>
          )}
        </div>
      </div>
    </section>
  )
}