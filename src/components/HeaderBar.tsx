import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import './header-bar.css'

export default function HeaderBar() {
  const auth = useContext(AuthContext)
  const navigate = useNavigate()

  const handleLogout = () => {
    try {
      auth?.logout()
    } catch (e) {
      console.warn('Logout failed', e)
    }
    navigate('/login', { replace: true })
  }

  return (
    <header className="header-bar" role="banner">
      <div className="header-inner">
        {/* left placeholder (keeps center visually centered) */}
        <div className="header-left" aria-hidden />
        {/* centered title */}
        <div className="header-center">ITMO Monitoring System</div>

        {/* actions on the right */}
        <div className="header-actions">
          {auth?.user && <div className="header-user" title={auth.user.name}>{auth.user.name}</div>}
          <button className="logout-btn" onClick={handleLogout} aria-label="Выйти из аккаунта">
            Выйти
          </button>
        </div>
      </div>
    </header>
  )
}
