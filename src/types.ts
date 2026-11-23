export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  role: Role;
  groups?: string[];
  photos?: string[];
}

export interface Detection {
  group: any;
  id?: string;
  name?: string;
  score?: number;
  bbox?: number[];
  user?: {
    isu: string;
    name?: string;
    last_name?: string;
    patronymic?: string;
  };
}

export interface FrameMessage {
  type: 'frame' | 'frame_with_boxes';
  imageBase64: string;
}

export interface DetectionsMessage {
  type: 'detections';
  detections: Detection[];
  ts?: string;
}

export type Department = {
  id: number
  code: string
  alias?: string
  name: string
}

export type Group = {
  code: string
  department_id?: number
  name?: string
  student_count: number
}

export type Lecture = {
  subject_name: string
  group_ids: string[]
  department_ids: number[]
  department_codes: string[]
  status: 'scheduled' | 'running' | 'completed'
  date: string
  id: number
  subject_id: number
  teacher_id: string
}

export const lectureStatus: Record<Lecture['status'], string> = {
  scheduled: 'Запланирована',
  running: 'Идёт',
  completed: 'Завершена',
}

export type Practice = {
  id: number
  date: string
  subject_id?: number
  teacher_id?: string
  group_ids?: string[]
}

export type Subject = {
  id: number
  name: string
}

export type Face = {
  id: string
  user_id?: string
  created_at?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WsMessage = FrameMessage | DetectionsMessage | any;
