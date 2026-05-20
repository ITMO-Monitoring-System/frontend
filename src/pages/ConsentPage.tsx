import { Link } from 'react-router-dom'
import {
  PERSONAL_DATA_CONSENT_TITLE,
  PERSONAL_DATA_CONSENT_TEXT,
  PERSONAL_DATA_CONSENT_VERSION,
  BIOMETRIC_CONSENT_TITLE,
  BIOMETRIC_CONSENT_TEXT,
  BIOMETRIC_CONSENT_VERSION,
} from '../legal/consent'
import '../components/consent.css'

export default function ConsentPage() {
  return (
    <div className="consent-page">
      <div className="consent-doc">
        <h2>{PERSONAL_DATA_CONSENT_TITLE}</h2>
        <div className="consent-doc-text">{PERSONAL_DATA_CONSENT_TEXT}</div>
        <div className="consent-version">Редакция документа: {PERSONAL_DATA_CONSENT_VERSION}</div>
      </div>

      <div className="consent-doc">
        <h2>{BIOMETRIC_CONSENT_TITLE}</h2>
        <div className="consent-doc-text">{BIOMETRIC_CONSENT_TEXT}</div>
        <div className="consent-version">Редакция документа: {BIOMETRIC_CONSENT_VERSION}</div>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/login">← Назад ко входу</Link>
      </div>
    </div>
  )
}
