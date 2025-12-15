/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, useContext } from 'react';
import { WsService } from '../services/ws';
import { AuthContext } from '../contexts/AuthContext';
import type { Detection } from '../types';
import { exportAttendanceToXlsx } from '../utils/exportXlsx';
import GroupSelector from './GroupSelector';

const WS_URL = (import.meta.env.VITE_WS_BASE ?? 'ws://localhost:8081') + '/ws/lecture';

export default function LectureView() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { token, user } = useContext(AuthContext);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [attendance, setAttendance] = useState<
    Record<string, { id: string; name?: string; firstSeen: string; lastSeen: string }>
  >({});
  const [sessionActive, setSessionActive] = useState(false);
  const [modeUseBackendBoxes, setModeUseBackendBoxes] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WsService | null>(null);

  useEffect(() => {
    const ws = new WsService(WS_URL);
    ws.connect(token ?? undefined);
    const handler = (msg: any) => {
      if (!msg || !msg.type) return;
      if ((msg.type === 'frame' || msg.type === 'frame_with_boxes') && msg.imageBase64) {
        setImageSrc(msg.imageBase64);
      }
      if (msg.type === 'detections' && Array.isArray(msg.detections)) {
        setDetections(msg.detections);
        const now = new Date().toISOString();
        setAttendance((prev) => {
          const copy = { ...prev };
          msg.detections.forEach((d: Detection) => {
            const id =
              d.id ??
              `${d.name ?? 'unknown'}_${Math.round((d.bbox?.[0] ?? 0) * 1000)}_${Math.round((d.bbox?.[1] ?? 0) * 1000)}`;
            if (!copy[id]) copy[id] = { id, name: d.name, firstSeen: now, lastSeen: now };
            else copy[id].lastSeen = now;
          });
          return copy;
        });
      }
    };

    ws.addHandler(handler);
    wsRef.current = ws;
    return () => {
      ws.removeHandler(handler);
      ws.close();
      wsRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !img) return;

    const draw = () => {
      const rect = img.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const skipBoxes =
        modeUseBackendBoxes &&
        imageSrc &&
        imageSrc.startsWith('data:') &&
        lastMessageWasFrameWithBoxes.current;

      if (!skipBoxes) {
        ctx.lineWidth = 2;
        ctx.font = '14px sans-serif';
        detections.forEach((d) => {
          if (!d.bbox) return;
          const [rx, ry, rw, rh] = d.bbox;
          const x = rx * rect.width;
          const y = ry * rect.height;
          const w = rw * rect.width;
          const h = rh * rect.height;

          ctx.strokeStyle = 'lime';
          ctx.strokeRect(x, y, w, h);

          const label = d.name
            ? `${d.name} ${d.score ? `(${(d.score * 100).toFixed(0)}%)` : ''}`
            : `${d.id ?? 'unknown'}`;
          const padding = 6;
          const metrics = ctx.measureText(label);
          const lh = 18;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x, Math.max(0, y - lh), metrics.width + padding, lh);
          ctx.fillStyle = 'white';
          ctx.fillText(label, x + 4, y - 4);
        });
      } else {
        ctx.font = '12px sans-serif';
        detections.forEach((d) => {
          if (!d.bbox) return;
          const [rx, ry] = d.bbox;
          const x = rx * rect.width;
          const y = ry * rect.height;
          const label = d.name ?? d.id ?? '';
          if (!label) return;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          const metrics = ctx.measureText(label);
          ctx.fillRect(x, Math.max(0, y - 16), metrics.width + 6, 16);
          ctx.fillStyle = 'white';
          ctx.fillText(label, x + 3, y - 4);
        });
      }
    };

    const lastMessageWasFrameWithBoxes = { current: false };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [imageSrc, detections, modeUseBackendBoxes]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const lastMsgTypeRef = useRef<string | null>(null);
  useEffect(() => {}, []);

  const startSession = () => {
    wsRef.current?.send({ action: 'start_session', groupId: selectedGroup });
    setSessionActive(true);
  };
  const stopSession = () => {
    wsRef.current?.send({ action: 'stop_session' });
    setSessionActive(false);
  };

  const downloadXlsx = () => {
    const arr = Object.values(attendance);
    exportAttendanceToXlsx(arr);
  };

  return (
    <div>
      <div className="mb-2 flex gap-2 items-center">
        <GroupSelector onSelect={(g) => setSelectedGroup(g || null)} />
        <button
          onClick={sessionActive ? stopSession : startSession}
          className="px-3 py-1 bg-indigo-600 text-white rounded"
        >
          {sessionActive ? 'Остановить лекцию' : 'Начать лекцию'}
        </button>
        <button onClick={downloadXlsx} className="px-3 py-1 bg-slate-600 text-white rounded">
          Скачать .xlsx
        </button>
        <label className="ml-2 inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={modeUseBackendBoxes}
            onChange={(e) => setModeUseBackendBoxes(e.target.checked)}
          />
          Использовать квадраты, нарисованные бэком
        </label>
      </div>

      <div className="relative bg-black" style={{ width: '100%', height: 480 }}>
        {imageSrc ? (
          <>
            <img
              ref={imgRef}
              src={imageSrc}
              alt="frame"
              className="w-full h-full object-contain"
              onLoad={() => {
                /* draws from effect */
              }}
            />
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
            />
          </>
        ) : (
          <div className="text-white p-4">Ожидание видеопотока...</div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-semibold">Задетекченные сейчас</h3>
        <ul className="list-disc ml-6">
          {detections.map((d, i) => (
            <li key={i}>
              {d.name ?? d.id} {d.score ? `— ${(d.score * 100).toFixed(0)}%` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <h3 className="font-semibold">Посещаемость (сессия)</h3>
        <ul className="list-disc ml-6">
          {Object.values(attendance).map((a) => (
            <li key={a.id}>
              {a.name ?? a.id} — {a.firstSeen} — {a.lastSeen}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
