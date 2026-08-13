import React, { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import ComplaintForm from './ComplaintForm'
import AiAssistant from './AiAssistant'
import CompletenessChecker from './CompletenessChecker'
import ComplaintAnalysis from './ComplaintAnalysis'
import DuplicateDetector from './DuplicateDetector'
import RootCause from './RootCause'
import { bulkUpdate } from '../store/complaintSlice'
import './Dashboard.css'

export default function Dashboard() {
  const dispatch = useDispatch()
  const { extractStatus, extractedFields } = useSelector((s) => s.ai)
  const appliedRef = useRef(null)

  useEffect(() => {
    if (extractStatus === 'done' && extractedFields && appliedRef.current !== extractedFields) {
      appliedRef.current = extractedFields
      dispatch(bulkUpdate(extractedFields))
    }
  }, [extractStatus, extractedFields, dispatch])

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
          <ComplaintAnalysis />
          <CompletenessChecker />
        </section>
        <section className="col col--ai">
          <AiAssistant />
          <RootCause />
          <DuplicateDetector />
        </section>
      </main>
    </div>
  )
}