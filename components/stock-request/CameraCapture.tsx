'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compressImage, validateImageFile } from '@/lib/stock-request/client';
import { Spinner, secondaryButton, primaryButton } from './ui';

type Mode = 'idle' | 'starting' | 'live' | 'preview' | 'unavailable';

/**
 * ถ่ายรูปจากกล้องในหน้าเว็บ → ดูตัวอย่าง → ถ่ายใหม่/ยืนยัน
 * ถ้าไม่มีกล้องหรือไม่ได้รับอนุญาต จะให้เลือกรูปจากเครื่องแทน
 */
export default function CameraCapture({ value, onChange }: { value: Blob | null; onChange: (photo: Blob | null) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(value ? 'preview' : 'idle');
  const [message, setMessage] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const previewUrl = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const startCamera = async () => {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMode('unavailable');
      setMessage('อุปกรณ์หรือเบราว์เซอร์นี้เปิดกล้องจากหน้าเว็บไม่ได้ กรุณาเลือกรูปจากเครื่องแทน');
      return;
    }
    setMode('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('live');
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => undefined);
        }
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setMode('unavailable');
      setMessage(
        name === 'NotAllowedError'
          ? 'ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์ หรือเลือกรูปจากเครื่องแทน'
          : name === 'NotFoundError' || name === 'OverconstrainedError'
            ? 'ไม่พบกล้องบนอุปกรณ์นี้ กรุณาเลือกรูปจากเครื่องแทน'
            : 'เปิดกล้องไม่สำเร็จ กรุณาเลือกรูปจากเครื่องแทน',
      );
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setProcessing(true);
    try {
      // ครอปให้ตรงกับที่เห็นในกรอบ (ภาพสดแสดงแบบ object-cover) — รูปที่ได้จะเหมือนที่เห็นตอนถ่าย
      const sourceW = video.videoWidth;
      const sourceH = video.videoHeight;
      const boxRatio = video.clientWidth && video.clientHeight ? video.clientWidth / video.clientHeight : 4 / 3;
      let cropW = sourceW;
      let cropH = sourceH;
      if (sourceW / sourceH > boxRatio) cropW = Math.round(sourceH * boxRatio);
      else cropH = Math.round(sourceW / boxRatio);
      const canvas = document.createElement('canvas');
      canvas.width = cropW;
      canvas.height = cropH;
      canvas.getContext('2d')?.drawImage(video, (sourceW - cropW) / 2, (sourceH - cropH) / 2, cropW, cropH, 0, 0, cropW, cropH);
      const raw = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
      if (!raw) throw new Error('ถ่ายรูปไม่สำเร็จ');
      onChange(await compressImage(raw));
      stopStream();
      setMode('preview');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ถ่ายรูปไม่สำเร็จ');
    } finally {
      setProcessing(false);
    }
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      setMessage(invalid);
      return;
    }
    setProcessing(true);
    setMessage(null);
    try {
      onChange(await compressImage(file));
      stopStream();
      setMode('preview');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'อ่านไฟล์รูปไม่สำเร็จ');
    } finally {
      setProcessing(false);
    }
  };

  const retake = () => {
    onChange(null);
    void startCamera();
  };

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-slate-900">
        {mode === 'live' && <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />}
        {mode === 'preview' && previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="ตัวอย่างรูปสินค้า" className="h-full w-full object-contain" />
        )}
        {(mode === 'idle' || mode === 'unavailable') && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-slate-300">
            <span className="text-5xl">📷</span>
            <p className="text-sm font-semibold">ถ่ายรูปสินค้า 1 รูป</p>
          </div>
        )}
        {(mode === 'starting' || processing) && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 text-white">
            <Spinner className="h-8 w-8" />
          </div>
        )}
      </div>

      {message && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{message}</p>}

      <div className="grid grid-cols-2 gap-2">
        {mode === 'live' ? (
          <>
            <button type="button" className={secondaryButton} onClick={() => { stopStream(); setMode(value ? 'preview' : 'idle'); }}>
              ยกเลิก
            </button>
            <button type="button" className={primaryButton} onClick={capture} disabled={processing}>
              📸 ถ่ายรูป
            </button>
          </>
        ) : mode === 'preview' ? (
          <>
            <button type="button" className={secondaryButton} onClick={retake}>
              🔄 ถ่ายใหม่
            </button>
            <button type="button" className={secondaryButton} onClick={() => fileRef.current?.click()}>
              🖼️ เลือกรูปอื่น
            </button>
          </>
        ) : (
          <>
            <button type="button" className={primaryButton} onClick={startCamera} disabled={mode === 'starting'}>
              📷 เปิดกล้อง
            </button>
            <button type="button" className={secondaryButton} onClick={() => fileRef.current?.click()}>
              🖼️ เลือกจากเครื่อง
            </button>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
    </div>
  );
}
