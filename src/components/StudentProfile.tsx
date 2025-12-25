import StudentFacesUpload from './FaceUploader'
import StudentVisits from './StudentVisits'
import './student-profile.css'

export default function StudentProfile() {
  return (
    <div style={{ padding: 24, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'stretch' }}>
            <StudentFacesUpload />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0, alignItems: 'stretch' }}>
            <StudentVisits />
          </div>
        </div>
      </div>

      <style>
        {`@media (max-width: 980px) {
            div[style*="gridTemplateColumns: '1fr 1fr'"] {
              grid-template-columns: 1fr !important;
            }
          }`}
      </style>
    </div>
  )
}
