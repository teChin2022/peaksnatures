"use client";

import { useState, useRef } from "react";
import { CheckCircle2, Upload, Camera, ImageIcon, X, Loader2 } from "lucide-react";

export default function UploadSlipPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  // Resolve params
  if (!sessionId) {
    params.then((p) => setSessionId(p.sessionId));
  }

  const handleFileSelect = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
    setError(null);
  };

  const handleRemove = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (galleryRef.current) galleryRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!file || !sessionId) return;
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("slip", file);

      const res = await fetch(`/api/slip-upload/${sessionId}`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      setDone(true);
    } catch {
      setError("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">
            Upload Complete!
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Your payment slip has been uploaded successfully. You can close this page and return to your computer.
          </p>
          <p className="mt-1 text-sm text-gray-500">
            อัปโหลดสลิปสำเร็จแล้ว! คุณสามารถปิดหน้านี้และกลับไปที่คอมพิวเตอร์ได้
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <Upload className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-gray-900">
            Upload Payment Slip
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            อัปโหลดสลิปการโอนเงิน
          </p>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
        />

        <div className="mt-6 space-y-3">
          {preview ? (
            <div className="rounded-xl border bg-white p-4">
              <div className="relative mx-auto w-fit">
                <img
                  src={preview}
                  alt="Slip preview"
                  className="mx-auto max-h-72 rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={handleRemove}
                  className="absolute -right-2 -top-2 rounded-full bg-red-500 p-1 text-white shadow-md hover:bg-red-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {error && (
                <p className="mt-3 text-center text-sm text-red-600">{error}</p>
              )}

              <button
                onClick={handleUpload}
                disabled={uploading}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Slip / อัปโหลดสลิป
                  </>
                )}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => galleryRef.current?.click()}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white p-5 text-left transition-colors active:bg-gray-50"
              >
                <div className="rounded-lg bg-blue-50 p-3">
                  <ImageIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Choose from Gallery / เลือกจากแกลเลอรี
                  </p>
                  <p className="text-xs text-gray-400">
                    Select your transfer screenshot
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="flex w-full items-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white p-5 text-left transition-colors active:bg-gray-50"
              >
                <div className="rounded-lg bg-blue-50 p-3">
                  <Camera className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    Take Photo / ถ่ายรูป
                  </p>
                  <p className="text-xs text-gray-400">
                    Take a photo of your transfer slip
                  </p>
                </div>
              </button>
            </>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Your slip will be verified automatically
          <br />
          สลิปของคุณจะถูกตรวจสอบอัตโนมัติ
        </p>
      </div>
    </div>
  );
}
