import React, { useState } from 'react';
import { Shield, Lock, Mail, KeyRound, X, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { User } from '../types.ts';
import { apiFetch } from '../utils/api.ts';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminLoginSuccess: (adminUser: User, token: string) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onAdminLoginSuccess,
}) => {
  const [email, setEmail] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !securityKey) {
      setError('Please provide administrative email and security passkey.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), securityKey: securityKey.trim(), masterKey: securityKey.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Admin verification failed');
      }

      onAdminLoginSuccess(data.user || data.adminUser, data.token);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id="admin-login-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    >
      <div
        id="admin-login-dialog"
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-xl shadow-2xl p-6 relative overflow-hidden"
      >
        {/* Subtle decorative security background glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <button
          id="close-admin-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-800 transition"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Administrator Console</h3>
            <p className="text-xs text-zinc-400">Restricted authority portal & permission engine</p>
          </div>
        </div>

        {error && (
          <div
            id="admin-login-error"
            className="mb-4 p-3 bg-red-950/50 border border-red-800/60 rounded-lg text-xs text-red-300 flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Authorized Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                id="admin-email-input"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter administrator email"
                className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Security Passkey
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
              <input
                id="admin-key-input"
                type={showPass ? 'text' : 'password'}
                required
                value={securityKey}
                onChange={e => setSecurityKey(e.target.value)}
                placeholder="Enter security key"
                className="w-full pl-9 pr-10 py-2 text-sm bg-zinc-950 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                title={showPass ? 'Hide passkey' : 'Show passkey'}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Database authentication gate</span>
              <span className="font-mono text-zinc-400">Master RLS Node</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              id="admin-login-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-zinc-950 font-semibold text-sm rounded-lg shadow transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Authenticate Admin</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
