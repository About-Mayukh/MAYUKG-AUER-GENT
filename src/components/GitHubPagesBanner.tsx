import React, { useState, useEffect } from 'react';
import { Globe, Server, Settings, Check, X, ExternalLink, HardDrive } from 'lucide-react';
import { isStaticHosting, getCustomBackendUrl, setCustomBackendUrl } from '../utils/api.ts';

export const GitHubPagesBanner: React.FC = () => {
  const [isStatic, setIsStatic] = useState(false);
  const [backendUrl, setBackendUrl] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setIsStatic(isStaticHosting());
    setBackendUrl(getCustomBackendUrl());
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomBackendUrl(backendUrl);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      setShowModal(false);
      window.location.reload();
    }, 1000);
  };

  // If not on static hosting (e.g. localhost with node server), we still allow opening settings via key or show small indicator if static
  if (!isStatic && !backendUrl) {
    return null;
  }

  return (
    <>
      {/* Top / Floating Pill */}
      <div className="fixed bottom-3 right-3 z-50 flex items-center">
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 border border-zinc-700/80 rounded-full text-[11px] font-medium backdrop-blur-md shadow-lg transition cursor-pointer"
          title="GitHub Pages & Backend Connection Settings"
        >
          <Globe className="w-3.5 h-3.5 text-amber-400" />
          <span>{backendUrl ? 'Connected Backend' : 'GitHub Pages Mode'}</span>
          <Settings className="w-3 h-3 text-zinc-400" />
        </button>
      </div>

      {/* Settings Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-zinc-100">GitHub Pages Settings</h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-zinc-300">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2">
                <div className="flex items-center gap-2 font-semibold text-zinc-200">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Standalone Browser Storage Active</span>
                </div>
                <p className="text-zinc-400 text-[11px] leading-relaxed">
                  You are running this on static hosting (like GitHub Pages). User accounts, files,
                  notifications, and device requests are safely stored inside your browser's
                  encrypted local storage.
                </p>
              </div>

              <form onSubmit={handleSave} className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Optional: Connect Remote Backend Server
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Server className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-3" />
                      <input
                        type="url"
                        placeholder="https://your-vault-backend.onrender.com"
                        value={backendUrl}
                        onChange={(e) => setBackendUrl(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-xs text-zinc-200 focus:outline-none focus:border-amber-500 font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Leave blank to use the built-in browser storage engine.
                  </p>
                </div>

                {savedNotice && (
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[11px] flex items-center gap-2">
                    <Check className="w-3.5 h-3.5" />
                    <span>Configuration updated! Reloading...</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold rounded-lg text-xs transition"
                  >
                    Save & Apply
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
