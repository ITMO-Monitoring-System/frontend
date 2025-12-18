import { useEffect, useState } from 'react'
import { listGroups } from '../services/api'
import './group-selector.css'

type Group = { id: string; name: string }

export default function GroupSelector({
  onSelect,
}: {
  onSelect: (groupId: string | null) => void
}) {
  const [groups, setGroups] = useState<Group[]>([])

  useEffect(() => {
    listGroups()
      .then(r => setGroups(r.data))
      .catch(() => {})
  }, [])

  return (
    <div className="group-selector">
      <label>Группа</label>
      <select onChange={e => onSelect(e.target.value || null)}>
        <option value="">— выбрать —</option>
        {groups.map(g => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  )
}
