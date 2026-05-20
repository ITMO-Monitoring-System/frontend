import { useEffect, useRef, useState } from 'react'
import './consent.css'

type ConsentModalProps = {
  open: boolean
  title: string
  text: string
  version?: string
  onClose: () => void
  /** Если передан — режим подтверждения (чекбокс + «Принять»). Иначе — режим просмотра. */
  onAccept?: () => void
  acceptLabel?: string
  busy?: boolean
}

export default function ConsentModal({
  open,
  title,
  text,
  version,
  onClose,
  onAccept,
  acceptLabel,
  busy = false,
}: ConsentModalProps) {
  const [checked, setChecked] = useState(false)
  const [scrolledToEnd, setScrolledToEnd] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const isAcceptMode = typeof onAccept === 'function'

  useEffect(() => {
    if (open) {
      setChecked(false)
      setScrolledToEnd(false)
    }
  }, [open])

  // Если текст помещается без прокрутки — считаем его прочитанным.
  useEffect(() => {
    if (!open) return
    const el = bodyRef.current
    if (el && el.scrollHeight <= el.clientHeight + 4) {
      setScrolledToEnd(true)
    }
  }, [open, text])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setScrolledToEnd(true)
    }
  }

  return (
    <div className="consent-overlay" onClick={() => !busy && onClose()}>
      <div className="consent-modal" onClick={(e) => e.stopPropagation()}>
        <div className="consent-modal-header">
          <h3>{title}</h3>
          <button
            className="consent-close"
            onClick={onClose}
            disabled={busy}
            type="button"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="consent-modal-body" ref={bodyRef} onScroll={onScroll}>
          {text}
        </div>

        {version && <div className="consent-version">Редакция документа: {version}</div>}

        <div className="consent-modal-footer">
          {isAcceptMode ? (
            <>
              <label className="consent-check">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!scrolledToEnd || busy}
                  onChange={(e) => setChecked(e.target.checked)}
                />
                <span>
                  Я ознакомлен(а) и согласен(на) с условиями
                  {!scrolledToEnd && ' (пролистайте текст до конца)'}
                </span>
              </label>
              <div className="consent-actions">
                <button
                  className="consent-btn consent-btn-ghost"
                  onClick={onClose}
                  disabled={busy}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="consent-btn consent-btn-primary"
                  onClick={onAccept}
                  disabled={!checked || busy}
                  type="button"
                >
                  {busy ? 'Сохранение…' : acceptLabel ?? 'Принять'}
                </button>
              </div>
            </>
          ) : (
            <div className="consent-actions">
              <button
                className="consent-btn consent-btn-primary"
                onClick={onClose}
                type="button"
              >
                Закрыть
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
