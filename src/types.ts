export type Role = 'student' | 'teacher' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  groups?: string[];
  photos?: string[];
}

export interface Detection {
  id?: string;
  name?: string;
  bbox?: [number, number, number, number]; // x,y,w,h relative (0..1)
  score?: number;
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
}

export type Lecture = {
  id: number
  date: string
  subject_id?: number
  teacher_id?: string
  group_ids?: string[]
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
