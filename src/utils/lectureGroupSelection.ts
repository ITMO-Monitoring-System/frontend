import type { Group } from '../types'

type GroupsByDepartment = Partial<Record<number, Group[]>>
type GroupOverrides = Partial<Record<number, string[]>>

function selectedGroups(groups: Group[], override: string[] | undefined) {
  if (override === undefined) return groups
  const codes = new Set(override)
  return groups.filter(group => codes.has(group.code))
}

export function toggleLectureGroup(groups: Group[], override: string[] | undefined, code: string) {
  const codes = selectedGroups(groups, override).map(group => group.code)
  return codes.includes(code) ? codes.filter(selected => selected !== code) : [...codes, code]
}

export function summarizeLectureGroups(
  departmentIds: number[],
  groupsByDepartment: GroupsByDepartment,
  overrides: GroupOverrides,
) {
  const groups = departmentIds.flatMap(id => selectedGroups(groupsByDepartment[id] ?? [], overrides[id]))
  return {
    groupIds: groups.map(group => group.code),
    studentCount: groups.every(group => Number.isInteger(group.student_count))
      ? groups.reduce((total, group) => total + group.student_count, 0)
      : null,
    complete: departmentIds.every(id => groupsByDepartment[id] !== undefined),
  }
}
