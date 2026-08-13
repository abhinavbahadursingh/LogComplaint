import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

const initialForm = {
  complaintSource: '',
  customerName: '',
  productName: '',
  productStrength: '',
  batchNumber: '',
  manufacturingDate: '',
  expiryDate: '',
  quantityAffected: '',
  complaintType: '',
  complaintDate: '',
  description: '',
  severity: '',
  priority: ''
}

export const saveComplaint = createAsyncThunk(
  'complaint/saveComplaint',
  async (payload, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`)
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

// Partial application of extracted fields onto real form keys if the backend
// returns them under known aliases.
const aliasMap = {
  complaint_source: 'complaintSource',
  customer_name: 'customerName',
  product_name: 'productName',
  product_strength: 'productStrength',
  strength: 'productStrength',
  batch_number: 'batchNumber',
  batch_lot: 'batchNumber',
  manufacturing_date: 'manufacturingDate',
  expiry_date: 'expiryDate',
  quantity_affected: 'quantityAffected',
  complaint_type: 'complaintType',
  complaint_date: 'complaintDate',
  description: 'description',
  severity: 'severity',
  priority: 'priority'
}

const complaintSlice = createSlice({
  name: 'complaint',
  initialState: {
    form: initialForm,
    status: 'idle',
    error: null,
    lastSavedId: null
  },
  reducers: {
    updateField(state, action) {
      const { field, value } = action.payload
      state.form[field] = value
    },
    bulkUpdate(state, action) {
      const patch = action.payload || {}
      Object.keys(aliasMap).forEach((key) => {
        const val = patch[key]
        if (val !== undefined && val !== null && val !== '') {
          state.form[aliasMap[key]] = val
        }
      })
    },
    resetForm(state) {
      state.form = { ...initialForm }
      state.status = 'idle'
      state.error = null
      state.lastSavedId = null
    },
    clearError(state) {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(saveComplaint.pending, (state) => {
        state.status = 'saving'
        state.error = null
      })
      .addCase(saveComplaint.fulfilled, (state, action) => {
        state.status = 'saved'
        state.lastSavedId = action.payload?.id ?? action.payload?._id ?? null
      })
      .addCase(saveComplaint.rejected, (state, action) => {
        state.status = 'error'
        state.error = action.payload || action.error?.message || 'Save failed'
      })
  }
})

export const { updateField, bulkUpdate, resetForm, clearError } = complaintSlice.actions
export default complaintSlice.reducer