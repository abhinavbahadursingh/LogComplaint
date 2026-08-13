import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { bulkUpdate } from './complaintSlice'

let msgId = 0
const nextId = () => `m${++msgId}`

export const uploadComplaintDocument = createAsyncThunk(
  'ai/uploadComplaintDocument',
  async (file, { dispatch, rejectWithValue }) => {
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/ai/extract', {
        method: 'POST',
        body
      })
      if (!res.ok) throw new Error('Extraction failed')
      const data = await res.json()
      if (data.fields && Object.keys(data.fields).length > 0) {
        dispatch(bulkUpdate(data.fields))
      }
      return data
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

export const submitAiMessage = createAsyncThunk(
  'ai/submitAiMessage',
  async ({ message, context }, { dispatch, rejectWithValue }) => {
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, context: context || null })
      })
      if (!res.ok) throw new Error('Chat request failed')
      const data = await res.json()
      if (data.extracted && Object.keys(data.extracted).length > 0) {
        dispatch(bulkUpdate(data.extracted))
      }
      return data
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

export const generateRiskAssessment = createAsyncThunk(
  'ai/generateRiskAssessment',
  async ({ form, extracted }, { rejectWithValue }) => {
    try {
      const res = await fetch('/api/ai/risk-assessment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { ...form, ...extracted } })
      })
      if (!res.ok) throw new Error('Risk assessment generation failed')
      return await res.json()
    } catch (err) {
      return rejectWithValue(err.message)
    }
  }
)

const aiSlice = createSlice({
  name: 'ai',
  initialState: {
    fileName: null,
    extractStatus: 'idle', // idle | uploading | processing | done | error
    progress: 0,
    statusLine: 'Awaiting a document…',
    extractedFields: {},
    chatMessages: [],
    chatInput: '',
    chatStatus: 'idle',
    chatError: null,
    riskAssessment: {
      status: 'idle', // idle | loading | done | error
      severity: '',
      nextAction: '',
      assessment: '',
      error: null
    }
  },
  reducers: {
    setFileName(state, action) {
      state.fileName = action.payload
    },
    setChatInput(state, action) {
      state.chatInput = action.payload
    },
    addChatMessage(state, action) {
      const { role, text } = action.payload
      state.chatMessages.push({ id: nextId(), role, text })
    },
    clearChat(state) {
      state.chatMessages = []
      state.chatError = null
    },
    clearExtraction(state) {
      state.fileName = null
      state.extractStatus = 'idle'
      state.progress = 0
      state.statusLine = 'Awaiting a document…'
      state.extractedFields = {}
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(uploadComplaintDocument.pending, (state) => {
        state.extractStatus = 'processing'
        state.statusLine = 'Analyzing document content and extracting key details…'
      })
      .addCase(uploadComplaintDocument.fulfilled, (state, action) => {
        const f = action.payload?.fields || {}
        const count = Object.keys(f).filter((k) => f[k]).length
        state.extractStatus = 'done'
        state.progress = 100
        state.statusLine =
          count > 0
            ? `Extraction complete — ${count} fields populated the form.`
            : 'Extraction complete — no fields could be extracted from this document.'
        state.extractedFields = f
      })
      .addCase(uploadComplaintDocument.rejected, (state, action) => {
        state.extractStatus = 'error'
        state.statusLine = action.payload || 'Extraction failed.'
        state.progress = 0
      })
      .addCase(submitAiMessage.pending, (state) => {
        state.chatStatus = 'thinking'
        state.chatError = null
      })
      .addCase(submitAiMessage.fulfilled, (state, action) => {
        state.chatStatus = 'idle'
        state.chatMessages.push({
          id: nextId(),
          role: 'assistant',
          text: action.payload?.reply || 'Here is what I found in the complaint details.'
        })
        if (action.payload?.extracted) {
          state.extractedFields = action.payload.extracted
        }
      })
      .addCase(submitAiMessage.rejected, (state, action) => {
        state.chatStatus = 'error'
        state.chatError = action.payload || 'Assistant failed to respond.'
      })
      .addCase(generateRiskAssessment.pending, (state) => {
        state.riskAssessment.status = 'loading'
        state.riskAssessment.error = null
      })
      .addCase(generateRiskAssessment.fulfilled, (state, action) => {
        state.riskAssessment.status = 'done'
        state.riskAssessment.severity = action.payload?.severity || ''
        state.riskAssessment.nextAction = action.payload?.nextAction || ''
        state.riskAssessment.assessment = action.payload?.assessment || ''
      })
      .addCase(generateRiskAssessment.rejected, (state, action) => {
        state.riskAssessment.status = 'error'
        state.riskAssessment.error = action.payload || 'Risk assessment generation failed.'
      })
  }
})

export const {
  setFileName,
  setChatInput,
  addChatMessage,
  clearChat,
  clearExtraction
} = aiSlice.actions
export default aiSlice.reducer