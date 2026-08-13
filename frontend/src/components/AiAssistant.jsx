import React, { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import {
  uploadComplaintDocument,
  setFileName,
  addChatMessage,
  submitAiMessage,
  clearExtraction
} from '../store/aiSlice'
import {
  SparkleIcon,
  DocumentIcon,
  CloudUploadIcon,
  BotIcon,
  SendIcon,
  LoaderIcon,
  CheckIcon,
  AlertIcon,
  CloseIcon,
  ShieldCheckIcon,
  ClipboardCheckIcon,
  PaperclipIcon
} from './icons/Icons'
import './AiAssistant.css'

const ACCEPTED = '.pdf,.docx,.txt,.eml'
const MAX_MB = 10
const FORMATS = ['PDF', 'DOCX', 'TXT', 'EML']

const WELCOME_MESSAGE =
  'Ready to process new complaints. You can paste the raw email from the customer, or upload a PDF of the complaint report. I will extract the data and run the initial risk assessment.'

// ---------------------------------------------------------------------------
// Status badge — "Pending Triage" / "Saved" / etc.
// Only renders when the complaint form actually carries a status. Wire
// `complaintForm.status` up to whatever field your slice uses once a
// complaint is saved server-side.
// ---------------------------------------------------------------------------
function StatusBadge({ status }) {
  if (!status) return null
  const map = {
    pending_triage: { label: 'Pending Triage', tone: 'amber' },
    saved: { label: 'Saved', tone: 'green' },
    in_review: { label: 'In Review', tone: 'blue' }
  }
  const cfg = map[status] || { label: status, tone: 'gray' }
  return <span className={`status-pill status-pill--${cfg.tone}`}>{cfg.label}</span>
}

// ---------------------------------------------------------------------------
// Attach menu — reached via the paperclip icon in the input bar. Replaces
// the old two-button row that used to live inside the welcome bubble.
// ---------------------------------------------------------------------------
function AttachMenu({ activeTool, onPick, onClose }) {
  return (
    <div className="attach-menu">
      <button type="button" className={`attach-menu-item ${activeTool === 'upload' ? 'attach-menu-item--active' : ''}`} onClick={() => onPick('upload')}>
        <CloudUploadIcon />
        <span>Upload document</span>
      </button>
      <button type="button" className={`attach-menu-item ${activeTool === 'paste' ? 'attach-menu-item--active' : ''}`} onClick={() => onPick('paste')}>
        <DocumentIcon />
        <span>Paste email / text</span>
      </button>
    </div>
  )
}

function UploadZone({ onClose }) {
  const dispatch = useDispatch()
  const state = useSelector((s) => s.ai)
  const { fileName, extractStatus, extractedFields } = state
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef(null)

  const validFile = (file) => {
    if (!file) return false
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase()
    const okExt = ['pdf', 'docx', 'txt', 'eml'].includes(ext)
    const okSize = file.size <= MAX_MB * 1024 * 1024
    if (!okExt) {
      alert(`Unsupported format "${file.name}". Supported formats: PDF, DOCX, TXT, EML.`)
      return false
    }
    if (!okSize) {
      alert(`File exceeds the ${MAX_MB}MB limit.`)
      return false
    }
    return true
  }

  const handleFiles = (files) => {
    if (files && files[0] && validFile(files[0])) {
      dispatch(setFileName(files[0].name))
      dispatch(uploadComplaintDocument(files[0]))
    }
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragActive(false)
    handleFiles(e.dataTransfer.files)
  }

  const done = fileName && extractStatus === 'done'

  return (
    <div className="attach-card">
      <div className="attach-card-head">
        <span className="attach-card-ico">
          <CloudUploadIcon />
        </span>
        <span className="attach-card-title">Upload complaint document</span>
        <button type="button" className="attach-card-close" aria-label="Close upload" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <div
        className={`dropzone ${dragActive ? 'dropzone--active' : ''} ${done ? 'dropzone--done' : ''}`}
        onDragEnter={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current && inputRef.current.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {fileName && (
          <button
            type="button"
            className="dropzone-clear"
            aria-label="Remove uploaded document"
            onClick={(e) => {
              e.stopPropagation()
              dispatch(clearExtraction())
            }}
          >
            <CloseIcon />
          </button>
        )}

        {done ? (
          <>
            <span className="dropzone-icon-wrap dropzone-icon-wrap--good">
              <CheckIcon className="dropzone-icon" />
            </span>
            <p className="dropzone-title">{fileName}</p>
            <p className="dropzone-sub">
              Extracted <strong>{Object.keys(extractedFields || {}).filter((k) => extractedFields[k]).length} fields</strong>{' '}
              — verified &amp; applied to the form
            </p>
            <span className="dropzone-cta">Click to replace document</span>
          </>
        ) : (
          <>
            <span className="dropzone-icon-wrap">
              <CloudUploadIcon className="dropzone-icon" />
            </span>
            <p className="dropzone-title">Drag &amp; drop the complaint report here</p>
            <p className="dropzone-sub">
              or <span className="dropzone-link">click to browse</span>
            </p>
            <span className="dropzone-hint">{FORMATS.join(' · ')} up to {MAX_MB}MB</span>
          </>
        )}
      </div>
    </div>
  )
}

function PasteInput({ onClose }) {
  const dispatch = useDispatch()
  const [text, setText] = useState('')

  const onExtract = () => {
    if (!text.trim()) return
    dispatch(setFileName('Pasted text / email'))
    const sample = new File([text], 'pasted-complaint.txt', { type: 'text/plain' })
    dispatch(uploadComplaintDocument(sample))
    setText('')
    onClose()
  }

  return (
    <div className="attach-card">
      <div className="attach-card-head">
        <span className="attach-card-ico">
          <DocumentIcon />
        </span>
        <span className="attach-card-title">Paste complaint email / text</span>
        <button type="button" className="attach-card-close" aria-label="Close paste" onClick={onClose}>
          <CloseIcon />
        </button>
      </div>
      <textarea
        className="paste-textarea"
        placeholder="Paste an email or free-form complaint text here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        autoFocus
      />
      <div className="paste-actions">
        <span className="paste-wordcount">
          {text.trim() ? `${text.trim().split(/\s+/).filter(Boolean).length} words` : 'Start typing or paste'}
        </span>
        <div className="paste-actions-btns">
          <button className="btn-mini" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-mini btn-mini--primary" onClick={onExtract} disabled={!text.trim()}>
            Extract details
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Extraction / upload progress.
// 0–100%: below ~25% we still call it "uploading" (file being sent/read),
// above that it's "extracting" fields — gives the Uploading state and the
// Extraction 10% → 100% state without needing a separate redux flag. Swap
// the threshold for a real `uploadStatus` field if your slice tracks the
// upload and extraction as distinct async steps.
// ---------------------------------------------------------------------------
function ExtractProgress() {
  const { extractStatus, statusLine } = useSelector((s) => s.ai)
  const [local, setLocal] = useState(0)

  useEffect(() => {
    if (extractStatus === 'processing') {
      setLocal(8)
      const t = setInterval(() => {
        setLocal((p) => (p < 80 ? Math.min(80, p + 3 + Math.random() * 7) : p))
      }, 320)
      return () => clearInterval(t)
    }
    if (extractStatus === 'done') setLocal(100)
    if (extractStatus === 'error') setLocal(0)
  }, [extractStatus])

  const display = Math.floor(local)
  const phaseLabel =
    extractStatus === 'error'
      ? 'EXTRACTION FAILED'
      : extractStatus === 'done'
        ? 'EXTRACTION COMPLETE'
        : display < 25
          ? 'UPLOADING DOCUMENT'
          : 'EXTRACTING FIELDS'

  const lineVariant = extractStatus === 'done' ? 'ok' : extractStatus === 'error' ? 'err' : null

  return (
    <div className={`extract-block ${extractStatus === 'done' ? 'extract-block--done' : extractStatus === 'error' ? 'extract-block--error' : ''}`}>
      <div className="extract-head">
        <span className="extract-label">{phaseLabel}</span>
        <span className="extract-pct">{display}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${display}%` }} />
      </div>
      <div className="extract-status-row">
        {extractStatus === 'processing' && <LoaderIcon className="extract-status-ico spin" />}
        {extractStatus === 'done' && <CheckIcon className="extract-status-ico extract-status-ico--ok" />}
        {extractStatus === 'error' && <AlertIcon className="extract-status-ico extract-status-ico--err" />}
        <div className="extract-status-txt">
          <p className={lineVariant === 'ok' ? 'extract-line--ok' : lineVariant === 'err' ? 'extract-line--err' : ''}>
            {extractStatus === 'processing'
              ? statusLine
              : extractStatus === 'done'
                ? statusLine
                : extractStatus === 'error'
                  ? statusLine || 'Could not read this document.'
                  : 'Awaiting a document…'}
          </p>
          {extractStatus === 'processing' && <span>Please wait, this may take a few moments.</span>}
          {extractStatus === 'done' && <span>Review the extracted details on the left panel.</span>}
          {extractStatus === 'error' && <span>Try re-uploading, or paste the text instead.</span>}
        </div>
      </div>
    </div>
  )
}

export default function AiAssistant() {
  const dispatch = useDispatch()
  const { chatMessages, chatStatus } = useSelector((s) => s.ai)
  const ai = useSelector((s) => s.ai)
  const complaintForm = useSelector((s) => s.complaint?.form)
  const extractedFields = useSelector((s) => s.ai.extractedFields)
  const scrollRef = useRef(null)
  const [draft, setDraft] = useState('')
  const [tool, setTool] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [savedBannerShown, setSavedBannerShown] = useState(false)

  const scrollToBottom = () => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [chatMessages, chatStatus, tool, ai.extractStatus, ai.fileName])

  // Saved-complaint state: fires a one-time confirmation bubble once the
  // complaint form reports a saved id/status. Adjust field names to match
  // your actual slice.
  useEffect(() => {
    if (complaintForm?.id && complaintForm?.status && !savedBannerShown) {
      dispatch(
        addChatMessage({
          role: 'assistant',
          text: `Complaint saved as case #${complaintForm.id}. Status: Pending Triage.`
        })
      )
      setSavedBannerShown(true)
    }
  }, [complaintForm?.id, complaintForm?.status, savedBannerShown, dispatch])

  const send = (text) => {
    const t = (text || draft).trim()
    if (!t || chatStatus === 'thinking') return
    dispatch(addChatMessage({ role: 'user', text: t }))
    setDraft('')
    dispatch(submitAiMessage({ message: t, context: { form: complaintForm, extracted: extractedFields } }))
  }

  const pickTool = (name) => {
    setTool(name)
    setMenuOpen(false)
  }

  const closeTool = () => setTool(null)

  return (
    <div className="ai-panel">
      <header className="ai-header">
        <div className="ai-title-row">
          <span className="ai-spark">
            <SparkleIcon />
          </span>
          <div>
            <h1 className="ai-header-title">AIVOA Copilot</h1>
            <p className="ai-header-sub">
              Drop complaint files or <span className="ai-header-sub-accent">paste text</span> below.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <span className="online-dot" aria-label="Assistant online" />
          <StatusBadge status={complaintForm?.status} />
        </div>
      </header>

      <div ref={scrollRef} className="chat-body">
        {/* Empty / default state — just the welcome bubble, nothing else */}
        <div className="msg">
          <span className="avatar avatar--bot">
            <SparkleIcon />
          </span>
          <div className="msg-bubble msg-bubble--bot">
            <p style={{ margin: 0 }}>{WELCOME_MESSAGE}</p>
          </div>
        </div>

        {tool === 'upload' && (
          <div className="attach-row">
            <UploadZone onClose={closeTool} />
          </div>
        )}
        {tool === 'paste' && (
          <div className="attach-row">
            <PasteInput onClose={closeTool} />
          </div>
        )}

        {/* Uploading / extraction progress — only when a document is in flight */}
        {(ai.fileName || ai.extractStatus !== 'idle') && (
          <div className="attach-row">
            <ExtractProgress />
          </div>
        )}

        {chatMessages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="msg msg--user">
              <div className="msg-bubble msg-bubble--user">{m.text}</div>
              <span className="avatar avatar--user">You</span>
            </div>
          ) : m.role === 'error' ? (
            <div key={m.id} className="msg">
              <span className="avatar avatar--err">
                <AlertIcon />
              </span>
              <div className="msg-bubble msg-bubble--err">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="msg">
              <span className="avatar avatar--bot">
                <BotIcon />
              </span>
              <div className="msg-bubble msg-bubble--bot">{m.text}</div>
            </div>
          )
        )}

        {/* Loading / typing state */}
        {chatStatus === 'thinking' && (
          <div className="msg">
            <span className="avatar avatar--bot">
              <BotIcon />
            </span>
            <div className="msg-bubble msg-bubble--bot msg-bubble--typing">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        {/* Chat-level error state (distinct from extraction errors) */}
        {chatStatus === 'error' && (
          <div className="msg">
            <span className="avatar avatar--err">
              <AlertIcon />
            </span>
            <div className="msg-bubble msg-bubble--err">Something went wrong generating a response. Please try again.</div>
          </div>
        )}
      </div>

      <footer className="chat-footer">
        {menuOpen && <AttachMenu activeTool={tool} onPick={pickTool} onClose={() => setMenuOpen(false)} />}
        <div className="chat-inputbar">
          <button
            type="button"
            className={`attach-btn ${tool ? 'is-active' : ''}`}
            aria-label="Attach a complaint document"
            title="Attach a complaint document"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <PaperclipIcon />
          </button>
          <input
            className="chat-input"
            placeholder="Type a message or paste a complaint…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button
            type="button"
            className="chat-send"
            onClick={() => send()}
            disabled={!draft.trim() || chatStatus === 'thinking'}
            aria-label="Send message"
          >
            <SendIcon />
          </button>
        </div>
        <p className="chat-disclaimer">AI responses may contain errors. Please verify information.</p>
      </footer>
    </div>
  )
}
