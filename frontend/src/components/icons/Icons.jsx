const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
}

const I = ({ children, ...props }) => (
  <svg {...base} {...props} aria-hidden="true">
    {children}
  </svg>
)

export const SparkleIcon = (p) => (
  <I {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
  </I>
)

export const CloudUploadIcon = (p) => (
  <I {...p}>
    <path d="M7 18a4 4 0 0 1-.5-7.97A6 6 0 0 1 18 9.5 3.5 3.5 0 0 1 17.5 18h-3" />
    <path d="M12 14v-6m-3 3l3-3 3 3" />
  </I>
)

export const DocumentIcon = (p) => (
  <I {...p}>
    <path d="M6 2.5h8l4 4V21.5H6z" />
    <path d="M14 2.5v4h4" />
    <path d="M9 12h6M9 15.5h6M9 8.5h2" />
  </I>
)

export const BotIcon = (p) => (
  <I {...p}>
    <rect x="4" y="8" width="16" height="11" rx="3" />
    <path d="M12 8V4m0 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
    <path d="M12 19v2M9 13h.01M15 13h.01" />
  </I>
)

export const SendIcon = (p) => (
  <I {...p}>
    <path d="M4 12l16-7-4.5 14-3.5-6.5L4 12z" />
  </I>
)

export const PaperPlaneIcon = SendIcon

export const InfoIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </I>
)

export const CalendarIcon = (p) => (
  <I {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </I>
)

export const ResetIcon = (p) => (
  <I {...p}>
    <path d="M3 12a9 9 0 1 0 2.6-6.3" />
    <path d="M3 4v4h4" />
  </I>
)

export const SaveIcon = (p) => (
  <I {...p}>
    <path d="M4 3h13l3 3v15H4z" />
    <path d="M8 3v6h8V3M8 21v-7h8v7" />
  </I>
)

export const ShieldCheckIcon = (p) => (
  <I {...p}>
    <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </I>
)

export const ClipboardCheckIcon = (p) => (
  <I {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" />
    <path d="M9 12l2 2 4-4" />
  </I>
)

export const LoaderIcon = (p) => (
  <I {...p} className={`spin ${p.className || ''}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </I>
)

export const CheckIcon = (p) => (
  <I {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </I>
)

export const AlertIcon = (p) => (
  <I {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </I>
)

export const TrashIcon = (p) => (
  <I {...p}>
    <path d="M4 7h16M9 7V5h6v2m-8 0l1 13h8l1-13" />
    <path d="M10 11v6M14 11v6" />
  </I>
)

export const CloseIcon = (p) => (
  <I {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </I>
)

export const FileIcon = (p) => (
  <I {...p}>
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z" />
    <path d="M14 2v5h5" />
  </I>
)

export const SearchIcon = (p) => (
  <I {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M16.5 16.5L21 21" />
  </I>
)

export const ChevronDownIcon = (p) => (
  <I {...p}>
    <path d="M6 9l6 6 6-6" />
  </I>
)

export const PaperclipIcon = (p) => (
  <I {...p}>
    <path d="M21.4 11.1l-9.4 9.4a5.5 5.5 0 0 1-7.8-7.8l9.4-9.4a3.7 3.7 0 0 1 5.2 5.2l-9.4 9.4a1.9 1.9 0 0 1-2.7-2.7l8.6-8.6" />
  </I>
)

export const RefreshIcon = (p) => (
  <I {...p}>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </I>
)

export default I