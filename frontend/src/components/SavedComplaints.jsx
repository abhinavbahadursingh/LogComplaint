import React, { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchComplaints } from '../store/complaintSlice'
import { ClipboardCheckIcon, LoaderIcon, AlertIcon, RefreshIcon, CalendarIcon } from './icons/Icons'
import './SavedComplaints.css'

const fmtDate = (iso) => {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return String(iso).slice(0, 10)
}

export default function SavedComplaints() {
  const dispatch = useDispatch()
  const { list, listStatus, listError } = useSelector((s) => s.complaint)

  useEffect(() => {
    if (listStatus === 'idle') dispatch(fetchComplaints())
  }, [listStatus, dispatch])

  const refresh = () => dispatch(fetchComplaints())

  return (
    <div className="panel saved-panel">
      <div className="panel-header saved-header">
        <div>
          <h2 className="panel-title">Saved Complaints</h2>
          <p className="panel-subtitle">Complaints captured and stored via the intake API</p>
        </div>
        <div className="saved-tools">
          <span className="badge badge--outline saved-count">{list.length}</span>
          <button
            type="button"
            className="icon-btn"
            onClick={refresh}
            title="Refresh"
            disabled={listStatus === 'loading'}
          >
            <RefreshIcon />
          </button>
        </div>
      </div>

      {listStatus === 'loading' && (
        <div className="saved-state">
          <LoaderIcon />
          <span>Loading complaints…</span>
        </div>
      )}

      {listStatus === 'error' && (
        <div className="saved-state saved-state--error">
          <AlertIcon />
          <span>{listError || 'Failed to load complaints.'}</span>
        </div>
      )}

      {listStatus === 'idle' && list.length === 0 && (
        <div className="saved-state">
          <ClipboardCheckIcon />
          <span>No complaints saved yet.</span>
        </div>
      )}

      {listStatus === 'idle' && list.length > 0 && (
        <ul className="saved-list">
          {list.map((c) => (
            <li className="saved-item" key={c.id}>
              <div className="saved-item-main">
                <div className="saved-item-title">
                  <span className="saved-customer">{c.customerName || '—'}</span>
                </div>
                <div className="saved-item-sub">
                  {c.productName && <span className="saved-chip">{c.productName}</span>}
                  {c.batchNumber && <span className="saved-chip">Batch {c.batchNumber}</span>}
                  {c.complaintType && <span className="saved-chip">{c.complaintType}</span>}
                </div>
              </div>
              <div className="saved-item-meta">
                <span className="saved-date">
                  <CalendarIcon />
                  {fmtDate(c.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}