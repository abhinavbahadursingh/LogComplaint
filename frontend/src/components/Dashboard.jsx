import React, { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ComplaintForm from './ComplaintForm'
import AiAssistant from './AiAssistant'
import RiskAssessment from './RiskAssessment'
import { bulkUpdate } from '../store/complaintSlice'
import { generateRiskAssessment } from '../store/aiSlice'
import './Dashboard.css'

export default function Dashboard() {
  const dispatch = useDispatch()
  const { extractStatus, extractedFields } = useSelector((s) => s.ai)
  const form = useSelector((s) => s.complaint.form)
  const appliedRef = useRef(null)

  useEffect(() => {
    if (extractStatus === 'done' && extractedFields && appliedRef.current !== extractedFields) {
      appliedRef.current = extractedFields
      dispatch(bulkUpdate(extractedFields))
      dispatch(generateRiskAssessment({ form, extracted: extractedFields }))
    }
  }, [extractStatus, extractedFields, form, dispatch])

  return (
    <div className="dashboard">
      <div className="ambient" aria-hidden="true">
        <span className="ambient-orb ambient-orb--1" />
        <span className="ambient-orb ambient-orb--2" />
        <span className="ambient-orb ambient-orb--3" />
      </div>
      <main className="columns">
        <section className="col col--form">
          <ComplaintForm />
          <RiskAssessment />
        </section>
        <section className="col col--ai">
          <AiAssistant />
        </section>
      </main>
    </div>
  )
}