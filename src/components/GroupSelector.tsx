import { useEffect, useState } from 'react';
import { listGroups } from '../services/api';

export default function GroupSelector({ onSelect }: { onSelect: (groupId: string) => void }) {
  const [groups, setGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [, setLoading] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    listGroups()
      .then((r) => setGroups(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <label className="block mb-1">Группа</label>
      <select className="p-2 border w-full" onChange={(e) => onSelect(e.target.value)}>
        <option value="">-- выбрать --</option>
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
