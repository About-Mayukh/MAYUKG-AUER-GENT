import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  Lock,
  Globe,
  FileText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { User, VaultFile } from '../types.ts';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  token: string;
  onUploadSuccess: (newFile: VaultFile) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  token,
  onUploadSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Check permissions
  const canUploadPublic = currentUser.permissions.canUploadPublic || currentUser.role === 'admin';
  const canUploadPrivate = currentUser.permissions.canUploadPrivate || currentUser.role === 'admin';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 40 * 1024 * 1024) {
        setError('File exceeds maximum size limit of 40MB');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size > 40 * 1024 * 1024) {
        setError('File exceeds maximum size limit of 40MB');
        return;
      }
      setSelectedFile(file);
      setError(null);
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError('Please select a file to upload');
      return;
    }

    if (isPrivate && !canUploadPrivate) {
      setError('Your account lacks permission to upload private files');
      return;
    }

    if (!isPrivate && !canUploadPublic) {
      setError('Your account lacks permission to upload public files');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const dataUrl = await readFileAsDataUrl(selectedFile);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          mimeType: selectedFile.type || 'application/octet-stream',
          isPrivate,
          dataUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      onUploadSuccess(data.file);
      onClose();
    } catch (err: any) {
      setError(err.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      id="upload-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-150"
    >
      <div
        id="upload-dialog"
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-zinc-100 shadow-2xl relative"
      >
        <button
          id="close-upload-btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Upload to Secure Vault</h3>
            <p className="text-xs text-zinc-400">Configure file privacy and isolation rules</p>
          </div>
        </div>

        {error && (
          <div
            id="upload-error"
            className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-5">
          {/* Drag and Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center ${
              isDragging
                ? 'border-amber-500 bg-amber-500/5'
                : 'border-zinc-700/80 hover:border-zinc-600 bg-zinc-950/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center gap-3 text-left w-full p-2">
                <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-amber-400 shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="truncate flex-1">
                  <p className="text-xs font-medium text-zinc-200 truncate">{selectedFile.name}</p>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Binary file'}
                  </p>
                </div>
                <span className="text-xs text-amber-400 hover:underline">Change</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-400 mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-xs font-medium text-zinc-200">
                  Click to select or drag and drop file here
                </p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  Supports documents, images, archives, code, and PDFs (Max 40MB)
                </p>
              </>
            )}
          </div>

          {/* PRIVACY FEATURE: PRIVATE VS PUBLIC */}
          <div>
            <label className="block text-xs font-semibold text-zinc-300 mb-2">
              Access Visibility Setting
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Option 1: Public */}
              <div
                onClick={() => canUploadPublic && setIsPrivate(false)}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  !isPrivate
                    ? 'border-blue-500 bg-blue-500/10 text-blue-100'
                    : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700'
                } ${!canUploadPublic ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-semibold">Public Vault</span>
                  </div>
                  {!isPrivate && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Visible & downloadable by all authorized network users.
                </p>
              </div>

              {/* Option 2: Private */}
              <div
                onClick={() => canUploadPrivate && setIsPrivate(true)}
                className={`p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  isPrivate
                    ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                    : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:border-zinc-700'
                } ${!canUploadPrivate ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-semibold">Private Only</span>
                  </div>
                  {isPrivate && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
                </div>
                <p className="text-[11px] text-zinc-400 leading-snug">
                  Strictly isolated. Only you can view, download, or delete this file.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-zinc-500 mt-2">
              Note: You can delete files you upload. Other users cannot delete your files.
            </p>
          </div>

          <div className="pt-2">
            <button
              id="confirm-upload-btn"
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs sm:text-sm rounded-lg shadow transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {uploading ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                  <span>Encrypting & Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Upload to {isPrivate ? 'Private Vault' : 'Public Vault'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
