/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useContext } from 'react';
import { WsService } from '../services/ws';
import { AuthContext } from '../contexts/AuthContext';
import type { Detection } from '../types';
import { exportAttendanceToXlsx } from '../utils/exportXlsx';
import GroupSelector from './GroupSelector';
import './lecture.css';
import * as api from '../services/api';

const WS_URL = (import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8081') + '/ws/lecture';

type LectureStatus = 'idle' | 'starting' | 'running' | 'stopped' | 'error';

export default function LectureView() {
  const { token } = useContext(AuthContext);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [attendance, setAttendance] = useState<Record<string, { id: string; name?: string; firstSeen: string; lastSeen: string }>>({});
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [lectureStatus, setLectureStatus] = useState<LectureStatus>('idle');
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WsService | null>(null);
  const lastObjectUrl = useRef<string | null>(null);

  // Очистка WS при размонтировании
  useEffect(() => {
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (lastObjectUrl.current) {
        try { URL.revokeObjectURL(lastObjectUrl.current); } catch {}
        lastObjectUrl.current = null;
      }
    };
  }, []);

  const wsMessageHandler = (msg: any) => {
    if (!msg) return;

    if (msg.type === 'binary' && msg.blob instanceof Blob) {
      if (lastObjectUrl.current) {
        try { URL.revokeObjectURL(lastObjectUrl.current); } catch {}
        lastObjectUrl.current = null;
      }
      const url = URL.createObjectURL(msg.blob);
      lastObjectUrl.current = url;
      setImageSrc(url);
      return;
    }

    if ((msg.type === 'frame' || msg.type === 'frame_with_boxes') && typeof msg.imageBase64 === 'string') {
      if (lastObjectUrl.current) {
        try { URL.revokeObjectURL(lastObjectUrl.current); } catch {}
        lastObjectUrl.current = null;
      }
      setImageSrc(msg.imageBase64);
      return;
    }

    if (msg.type === 'detections' && Array.isArray(msg.detections)) {
      setDetections(msg.detections);
      const now = new Date().toISOString();
      setAttendance(prev => {
        const copy = { ...prev };
        msg.detections.forEach((d: Detection) => {
          const id = d.id ?? `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0)*1000)}_${Math.round((d.bbox?.[1] ?? 0)*1000)}`;
          if (!copy[id]) copy[id] = { id, name: d.name, firstSeen: now, lastSeen: now };
          else copy[id].lastSeen = now;
        });
        return copy;
      });
      return;
    }

    if (msg.type === 'log' && typeof msg.text === 'string') {
      console.log('[WS LOG]', msg.text);
      return;
    }

    if (typeof msg === 'string') {
      console.log('[WS STR]', msg);
      return;
    }

    console.log('[WS] unknown message', msg);
  };

  const handleStartLecture = async () => {
    if (!token || !selectedGroup) return;

    setLectureStatus('starting');

    try {
      await api.startLecture(selectedGroup);

      const ws = new WsService(WS_URL);
      wsRef.current = ws;

      ws.onOpen = () => setWsStatus('connected');
      ws.onClose = () => setWsStatus('disconnected');
      ws.onError = () => setWsStatus('disconnected');

      ws.addHandler(wsMessageHandler);
      ws.connect(token);

      setLectureStatus('running');
      setWsStatus('connecting');
    } catch (err) {
      console.error(err);
      setLectureStatus('error');
      setWsStatus('disconnected');
    }
  };

  const handleStopLecture = () => {
    wsRef.current?.send({ action: 'stop_session' });
    wsRef.current?.close();
    wsRef.current = null;

    setLectureStatus('stopped');
    setWsStatus('disconnected');
    setImageSrc(null);
    setDetections([]);
    setAttendance({});
  };

  const downloadXlsx = () => {
    exportAttendanceToXlsx(Object.values(attendance));
  };

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const rect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.font = '14px sans-serif';
    detections.forEach(d => {
      if (!d.bbox) return;
      const [rx, ry, rw, rh] = d.bbox;
      const x = rx * rect.width;
      const y = ry * rect.height;
      const w = rw * rect.width;
      const h = rh * rect.height;

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'lime';
      ctx.strokeRect(x, y, w, h);

      const label = d.name ? `${d.name} ${d.score ? `(${(d.score*100).toFixed(0)}%)` : ''}` : `${d.id ?? 'unknown'}`;
      const padding = 6;
      const metrics = ctx.measureText(label);
      const lh = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x, Math.max(0, y - lh), metrics.width + padding, lh);
      ctx.fillStyle = 'white';
      ctx.fillText(label, x + 4, y - 4);
    });
  }, [imageSrc, detections]);

  return (
    <div className="lecture">
      <div className="lecture-controls">
        <GroupSelector onSelect={g => setSelectedGroup(g || null)} />

        {lectureStatus === 'idle' && (
          <button className="btn primary" onClick={handleStartLecture} disabled={!selectedGroup}>
            Начать лекцию
          </button>
        )}

        {lectureStatus === 'running' && (
          <button className="btn primary" onClick={handleStopLecture}>
            Остановить лекцию
          </button>
        )}

        {lectureStatus === 'error' && (
          <div className="error">
            Поток недоступен
            <button className="btn primary" onClick={handleStartLecture} disabled={!selectedGroup}>Попробовать снова</button>
          </div>
        )}

        <button className="btn secondary" onClick={downloadXlsx}>
          Скачать .xlsx
        </button>

        <div className="ws-status">
          Статус потока: {wsStatus}
        </div>
      </div>

      <div className="video-frame">
        {imageSrc ? (
          <>
            <img ref={imgRef} src={imageSrc} alt="video" />
            <canvas ref={canvasRef} />
          </>
        ) : (
          <div className="video-placeholder">Ожидание видеопотока…</div>
        )}
      </div>

      <div className="panel">
        <h3>Обнаруженные сейчас</h3>
        <ul>
          {detections.map((d, i) => (
            <li key={i}>
              {d.name ?? d.id} {d.score && `(${(d.score * 100).toFixed(0)}%)`}
            </li>
          ))}
        </ul>
      </div>

      <div className="panel">
        <h3>Посещаемость</h3>
        <ul>
          {Object.values(attendance).map(a => (
            <li key={a.id}>
              {a.name ?? a.id}
              <span className="muted">
                {' '}{a.firstSeen} → {a.lastSeen}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
