export const REQUIRED_FIELDS = [
  { key: 'customerName', label: 'Customer Name' },
  { key: 'productName', label: 'Product Name' },
  { key: 'batchNumber', label: 'Batch / Lot Number' },
  { key: 'complaintType', label: 'Complaint Type' },
  { key: 'complaintDate', label: 'Complaint Date' },
  { key: 'description', label: 'Description / Details' }
]

export const OPTIONAL_FIELDS = [
  { key: 'complaintSource', label: 'Complaint Source' },
  { key: 'productStrength', label: 'Product Strength / Grade' },
  { key: 'quantityAffected', label: 'Quantity Affected' },
  { key: 'manufacturingDate', label: 'Manufacturing Date' },
  { key: 'expiryDate', label: 'Expiry Date' }
]

export const isFilled = (v) => v !== undefined && v !== null && String(v).trim() !== ''

export function checkCompleteness(form = {}) {
  const required = REQUIRED_FIELDS.map((f) => ({ ...f, filled: isFilled(form[f.key]) }))
  const filledCount = required.filter((f) => f.filled).length
  const requiredCount = required.length
  const missing = required.filter((f) => !f.filled)
  return {
    complete: missing.length === 0,
    filledCount,
    requiredCount,
    score: Math.round((filledCount / requiredCount) * 100),
    required,
    missing
  }
}