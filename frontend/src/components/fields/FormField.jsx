import React from 'react'
import { CalendarIcon, ChevronDownIcon } from '../icons/Icons'

export function FormField({ label, required, hint, children }) {
  return (
    <label className="form-field">
      <span className="form-label">
        {label}
        {required && <span className="req">*</span>}
        {hint && <span className="form-hint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export function TextInput({ name, value, onChange, placeholder, prefix, suffix }) {
  return (
    <div className={`control ${prefix || suffix ? 'control--affix' : ''}`}>
      {prefix && <span className="affix affix--prefix">{prefix}</span>}
      <input
        type="text"
        name={name}
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(name, e.target.value)}
      />
      {suffix && <span className="affix affix--suffix">{suffix}</span>}
    </div>
  )
}

export function SelectInput({ name, value, onChange, options, placeholder }) {
  return (
    <div className="control control--select">
      <select
        name={name}
        className="input"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => {
          const val = typeof opt === 'object' ? opt.value : opt
          const label = typeof opt === 'object' ? opt.label : opt
          return (
            <option key={val} value={val}>
              {label}
            </option>
          )
        })}
      </select>
      <span className="chevron" aria-hidden="true">
        <ChevronDownIcon />
      </span>
    </div>
  )
}

export function DateInput({ name, value, onChange }) {
  return (
    <div className="control control--date">
      <input
        type="date"
        name={name}
        className="input"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
      />
      <span className="affix affix--suffix affix--icon">
        <CalendarIcon />
      </span>
    </div>
  )
}

export function TextArea({ name, value, onChange, placeholder, rows }) {
  return (
    <textarea
      name={name}
      className="input textarea"
      rows={rows || 4}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(name, e.target.value)}
    />
  )
}