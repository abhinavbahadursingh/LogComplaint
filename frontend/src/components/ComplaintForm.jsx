import React from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { updateField, resetForm, saveComplaint } from '../store/complaintSlice'
import { FormField, TextInput, SelectInput, DateInput, TextArea } from './fields/FormField'
import { ResetIcon, SaveIcon, LoaderIcon, CheckIcon, AlertIcon, ShieldCheckIcon } from './icons/Icons'
import './ComplaintForm.css'

const sources = ['Portal / Web form', 'Email', 'Phone Call', 'Field Representative', 'Distributor', 'Regulatory Body', 'Social Media']
const sentence = (label) => ({ label, value: label })

const complaintTypes = [
  sentence('Appearance / Visual Defect'),
  sentence('Packaging Issue'),
  sentence('Labeling Error'),
  sentence('Strength / Dosage Issue'),
  sentence('Contamination'),
  sentence('Physical / Chemical Property'),
  sentence('Microbial Issue'),
  sentence('Storage / Stability Concern'),
  sentence('Other')
]
const severities = [
  sentence('Low — Minor cosmetic issue'),
  sentence('Medium — Moderate, localized impact'),
  sentence('High — Potential safety / regulatory concern'),
  sentence('Critical — Immediate recall consideration')
]
const priorities = [
  sentence('Low'),
  sentence('Normal'),
  sentence('High'),
  sentence('Urgent')
]

function Section({ index, title, children }) {
  return (
    <section className="form-section">
      <div className="section-head">
        <span className="section-num">{index}</span>
        <span className="section-title">{title}</span>
      </div>
      <div className="section-body">{children}</div>
    </section>
  )
}

function StatusBanner() {
  const { status, error, lastSavedId } = useSelector((s) => s.complaint)
  if (status === 'saved') {
    return (
      <div className="form-banner form-banner--success">
        <CheckIcon />
        <span>Complaint saved successfully{lastSavedId ? ` (ref: ${lastSavedId})` : ''}. Awaiting triage.</span>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="form-banner form-banner--danger">
        <AlertIcon />
        <span>{error}</span>
      </div>
    )
  }
  return null
}

export default function ComplaintForm() {
  const dispatch = useDispatch()
  const form = useSelector((s) => s.complaint.form)
  const saveStatus = useSelector((s) => s.complaint.status)

  const set = (field, value) => dispatch(updateField({ field, value }))

  const onSave = (e) => {
    e.preventDefault()
    dispatch(saveComplaint(form))
  }

  const onReset = (e) => {
    e.preventDefault()
    dispatch(resetForm())
  }

  return (
    <div className="panel form-panel">
      <header className="panel-header">
        <div>
          <h1 className="panel-title">Log Customer Complaint</h1>
          <p className="panel-subtitle">API &amp; FDF Quality Assurance Module</p>
        </div>
        <span className="badge badge--outline">
          <ShieldCheckIcon />
          Pending Triage
        </span>
      </header>

      <StatusBanner />

      <form className="complaint-form" onSubmit={onSave}>
        <Section index={1} title="Origin & Customer Details">
          <div className="grid grid--2">
            <FormField label="Complaint Source">
              <SelectInput
                name="complaintSource"
                value={form.complaintSource}
                onChange={set}
                options={sources}
                placeholder="Select source"
              />
            </FormField>
            <FormField label="Customer Name" required>
              <TextInput
                name="customerName"
                value={form.customerName}
                onChange={set}
                placeholder="e.g. Acme Pharmaceuticals"
              />
            </FormField>
          </div>
        </Section>

        <Section index={2} title="Product & Batch Identification">
          <div className="grid grid--2">
            <FormField label="Product Name" required>
              <TextInput
                name="productName"
                value={form.productName}
                onChange={set}
                placeholder="e.g. Amoxicillin 250mg Capsules"
              />
            </FormField>
            <FormField label="Product Strength / Grade">
              <TextInput
                name="productStrength"
                value={form.productStrength}
                onChange={set}
                placeholder="e.g. 250 mg / USP Grade"
              />
            </FormField>
            <FormField label="Batch / Lot Number" required>
              <TextInput
                name="batchNumber"
                value={form.batchNumber}
                onChange={set}
                placeholder="e.g. 24A10235"
              />
            </FormField>
            <FormField label="Quantity Affected">
              <TextInput
                name="quantityAffected"
                value={form.quantityAffected}
                onChange={set}
                placeholder="e.g. 4"
                suffix="kg"
              />
            </FormField>
            <FormField label="Manufacturing Date">
              <DateInput name="manufacturingDate" value={form.manufacturingDate} onChange={set} />
            </FormField>
            <FormField label="Expiry Date">
              <DateInput name="expiryDate" value={form.expiryDate} onChange={set} />
            </FormField>
          </div>
        </Section>

        <Section index={3} title="Complaint Details">
          <div className="grid grid--2">
            <FormField label="Complaint Type" required>
              <SelectInput
                name="complaintType"
                value={form.complaintType}
                onChange={set}
                options={complaintTypes}
                placeholder="Select type"
              />
            </FormField>
            <FormField label="Complaint Date" required>
              <DateInput name="complaintDate" value={form.complaintDate} onChange={set} />
            </FormField>
          </div>
          
        </Section>

        <Section index={4} title="Initial Assessment & Priority">
          <div className="grid grid--2">
            <FormField label="Initial Severity" required>
              <SelectInput
                name="severity"
                value={form.severity}
                onChange={set}
                options={severities}
                placeholder="Assess initial severity"
              />
            </FormField>
            <FormField label="Priority" required>
              <SelectInput
                name="priority"
                value={form.priority}
                onChange={set}
                options={priorities}
                placeholder="Set priority"
              />
            </FormField>
          </div>
        </Section>

        <footer className="form-actions">
          <button type="button" className="btn btn--outline" onClick={onReset}>
            <ResetIcon />
            Reset Form
          </button>
          <button type="submit" className="btn btn--primary" disabled={saveStatus === 'saving'}>
            {saveStatus === 'saving' ? <LoaderIcon /> : <SaveIcon />}
            {saveStatus === 'saving' ? 'Saving…' : 'Save Complaint'}
          </button>
        </footer>
      </form>
    </div>
  )
}