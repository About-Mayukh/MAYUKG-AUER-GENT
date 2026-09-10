import React, { useState, useEffect } from 'react';
import {
  Shield,
  Upload,
  Download,
  Trash2,
  Lock,
  Globe,
  Search,
  FileText,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  File,
  LogOut,
  SlidersHorizontal,
  HardDrive,
  User as UserIcon,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Users,
  RefreshCw,
  Bell,
} from 'lucide-react';
import { User, VaultFile, AppNotification } from '../types.ts';
import { maskDeviceId } from '../utils/deviceMask';
import { UploadModal } from './UploadModal.tsx';
import { UserNotificationsModal } from './UserNotificationsModal.tsx';
import { apiFetch, connectRealtimeStream } from '../utils/api.ts';

interface VaultDashboardProps {
  currentUser: User;
  token: string;
  onLogout: () => void;
  onOpenAdminConsole?: () => void;
}

export const VaultDashboard: React.FC<VaultDashboardProps> = ({
  currentUser,
  token,
  onLogout,
  onOpenAdminConsole,
}) => {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'public' | 'private' | 'my-uploads'>('public');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<VaultFile | null>(null);

  // Real-time Notifications State
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  // Fetch files from backend (Strict Privacy isolation enforced on server)
  const loadFiles = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await apiFetch('/api/files', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch vault files');
      }
      const raw: VaultFile[] = data.files || [];
      setFiles(raw.filter((f, idx, arr) => arr.findIndex(t => t.id === f.id) === idx));
    } catch (err: any) {
      setActionError(err.message || 'Error loading file inventory');
    } finally {
      setLoading(false);
    }
  };

  // Fetch notifications for current user
  const loadNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await apiFetch('/api/notifications', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {
      // Non-blocking
    } finally {
      setLoadingNotifications(false);
    }
  };

  const handleMarkAsRead = async (notifId: string) => {
    try {
      const res = await apiFetch(`/api/notifications/${notifId}/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => (n.id === notifId ? { ...n, isRead: true } : n))
        );
      }
    } catch {
      // Ignore
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await apiFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      }
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadFiles();
    loadNotifications();

    // Connect to Real-time Stream (supports cloud SSE and GitHub Pages local event bus)
    const unsubscribe = connectRealtimeStream((parsed) => {
      if (parsed.type === 'NOTIFICATION') {
        loadNotifications();
      } else if (
        parsed.type === 'FILES_UPDATED' ||
        parsed.type === 'DATA_SYNC' ||
        parsed.type === 'USERS_UPDATED'
      ) {
        loadFiles();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentUser.id]);

  // Download handler
  const handleDownload = async (file: VaultFile) => {
    setDownloadingId(file.id);
    setActionError(null);

    try {
      const res = await apiFetch(`/api/files/${file.id}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Download failed');
      }

      // Trigger browser download
      const a = document.createElement('a');
      a.href = data.dataUrl;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Optimistically update file download count and list of downloaders
      setFiles(prev =>
        prev.map(f => {
          if (f.id === file.id) {
            const count = data.downloadCount ?? ((f.downloadCount || 0) + 1);
            const userIdentifier = currentUser.email || 'You';
            const downloadedBy = data.downloadedBy ?? (
              f.downloadedBy && f.downloadedBy.includes(userIdentifier)
                ? f.downloadedBy
                : [...(f.downloadedBy || []), userIdentifier]
            );
            return { ...f, downloadCount: count, downloadedBy };
          }
          return f;
        })
      );

      setActionSuccess(`Downloaded ${data.fileName}`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Could not download file');
    } finally {
      setDownloadingId(null);
    }
  };

  // Delete handler - strictly enforced: users can delete their own files, but NOT others'
  const handleDelete = (file: VaultFile) => {
    if (file.uploaderId !== currentUser.id && currentUser.role !== 'admin') {
      setActionError('Permission denied: You can only delete files you uploaded yourself.');
      return;
    }
    // Open in-app confirmation modal (works safely inside iframe)
    setPendingDeleteFile(file);
  };

  const confirmDeleteFile = async () => {
    if (!pendingDeleteFile) return;

    setDeletingId(pendingDeleteFile.id);
    setActionError(null);

    try {
      const res = await apiFetch(`/api/files/${pendingDeleteFile.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': currentUser.deviceId,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Deletion failed');
      }

      setFiles(prev => prev.filter(f => f.id !== pendingDeleteFile.id));
      setActionSuccess(`File "${pendingDeleteFile.fileName}" deleted from vault & Supabase`);
      setPendingDeleteFile(null);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (err: any) {
      setActionError(err.message || 'Could not delete file');
    } finally {
      setDeletingId(null);
    }
  };

  // Filter files based on tab and search
  const filteredFiles = files.filter(file => {
    // Tab filter
    if (activeTab === 'public' && file.isPrivate) return false;
    if (activeTab === 'private' && !file.isPrivate) return false;
    if (activeTab === 'my-uploads' && file.uploaderId !== currentUser.id) return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        file.fileName.toLowerCase().includes(q) ||
        file.uploaderName.toLowerCase().includes(q) ||
        file.uploaderEmail.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const publicFilesCount = files.filter(f => !f.isPrivate).length;
  const privateFilesCount = files.filter(f => f.isPrivate && f.uploaderId === currentUser.id).length;
  const myUploadsCount = files.filter(f => f.uploaderId === currentUser.id).length;

  const getFileIcon = (mimeType: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) {
      return <ImageIcon className="w-5 h-5 text-sky-400" />;
    }
    if (mimeType.includes('pdf') || ext === 'pdf') {
      return <FileText className="w-5 h-5 text-rose-400" />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'html', 'css', 'json', 'sql'].includes(ext)) {
      return <FileCode className="w-5 h-5 text-emerald-400" />;
    }
    return <File className="w-5 h-5 text-zinc-400" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return 'Recent';
    }
  };

  return (
    <div
      id="vault-dashboard"
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black"
    >
      {/* Top Application Header */}
      <header className="border-b border-zinc-800/90 bg-zinc-900/60 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shadow-sm">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-zinc-100">SECURE VAULT STORAGE</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Device Authorized
                </span>
              </div>
              <p className="text-xs text-zinc-400 font-mono truncate max-w-xs sm:max-w-md">
                Device: <span title="Hardware fingerprint masked for security">{maskDeviceId(currentUser.deviceId)}</span>
              </p>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-3">
            {currentUser.role === 'admin' && onOpenAdminConsole && (
              <button
                id="header-admin-console-btn"
                onClick={onOpenAdminConsole}
                className="py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Admin Console</span>
              </button>
            )}

            {/* User Real-Time Notifications Button */}
            <button
              id="user-notifications-btn"
              onClick={() => setShowNotificationsModal(true)}
              className="relative p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-amber-400 hover:border-amber-500/40 transition cursor-pointer flex items-center justify-center group"
              title="Notifications from Administrator"
              aria-label="View notifications"
            >
              <Bell className="w-4 h-4 transition group-hover:scale-105" />
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span
                  id="notifications-badge"
                  className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-amber-500 text-zinc-950 text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-pulse"
                >
                  {notifications.filter(n => !n.isRead).length > 99
                    ? '99+'
                    : notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>

            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-semibold text-zinc-200">{currentUser.name}</span>
              <span className="text-[11px] text-zinc-400">{currentUser.email}</span>
            </div>

            <button
              id="user-logout-btn"
              onClick={onLogout}
              title="Sign out device"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-rose-400 hover:border-rose-900/50 transition cursor-pointer"
              aria-label="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex flex-col gap-6">
        {/* Top Control Bar: Upload Action, Tabs, Search */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          {/* Tabs: Public Vault vs Private Vault vs My Uploads */}
          <div className="flex items-center p-1 bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-x-auto">
            <button
              id="tab-public-vault"
              onClick={() => setActiveTab('public')}
              className={`py-2 px-3.5 rounded-lg text-xs font-medium flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === 'public'
                  ? 'bg-zinc-800 text-zinc-100 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Public Vault (Shared)</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400">
                {publicFilesCount}
              </span>
            </button>

            <button
              id="tab-private-vault"
              onClick={() => setActiveTab('private')}
              className={`py-2 px-3.5 rounded-lg text-xs font-medium flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === 'private'
                  ? 'bg-zinc-800 text-zinc-100 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>My Private Vault</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400">
                {privateFilesCount}
              </span>
            </button>

            <button
              id="tab-my-uploads"
              onClick={() => setActiveTab('my-uploads')}
              className={`py-2 px-3.5 rounded-lg text-xs font-medium flex items-center gap-2 transition whitespace-nowrap cursor-pointer ${
                activeTab === 'my-uploads'
                  ? 'bg-zinc-800 text-zinc-100 shadow'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
              <span>My Uploads</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-zinc-900 text-zinc-400">
                {myUploadsCount}
              </span>
            </button>
          </div>

          {/* Search and Upload Button */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
              <input
                id="file-search-input"
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search files or uploader..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <button
              id="open-upload-modal-btn"
              onClick={() => setIsUploadOpen(true)}
              className="py-2 px-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs rounded-xl shadow transition flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>Upload File</span>
            </button>
          </div>
        </div>

        {/* Feedback alerts */}
        {actionSuccess && (
          <div
            id="action-success-toast"
            className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {actionError && (
          <div
            id="action-error-toast"
            className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* File Inventory Grid */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-zinc-400">Accessing encrypted storage tables...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="py-20 text-center border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/30 p-8">
            <div className="w-12 h-12 rounded-full bg-zinc-800/80 flex items-center justify-center text-zinc-500 mx-auto mb-3">
              <HardDrive className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-medium text-zinc-300 mb-1">No Files Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto mb-4">
              {searchQuery
                ? 'No files matched your search keywords.'
                : activeTab === 'private'
                ? 'You have not uploaded any private files yet.'
                : 'No files uploaded in this section yet. Be the first to upload!'}
            </p>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="py-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-lg transition cursor-pointer"
            >
              Upload First File
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map((file, idx) => {
              const isOwner = file.uploaderId === currentUser.id || currentUser.role === 'admin';

              return (
                <div
                  key={`vault-file-${file.id}-${idx}`}
                  id={`file-card-${file.id}`}
                  className="bg-zinc-900/80 border border-zinc-800/90 rounded-xl p-4 flex flex-col justify-between hover:border-zinc-700/80 transition shadow-sm group"
                >
                  <div>
                    {/* Top Row: Privacy Badge & Date */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {file.isPrivate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Lock className="w-3 h-3" />
                          <span>Private File</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          <Globe className="w-3 h-3" />
                          <span>Public Shared</span>
                        </span>
                      )}

                      <span className="text-[11px] text-zinc-500">{formatDate(file.createdAt)}</span>
                    </div>

                    {/* File Info */}
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-zinc-950 border border-zinc-800 flex items-center justify-center shrink-0">
                        {getFileIcon(file.mimeType, file.fileName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4
                          className="text-xs font-medium text-zinc-200 truncate group-hover:text-amber-400 transition"
                          title={file.fileName}
                        >
                          {file.fileName}
                        </h4>
                        <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          {formatFileSize(file.fileSize)}
                        </p>
                      </div>
                    </div>

                    {/* Download Counter - Visible to everyone and file owner */}
                    <div className="flex items-center justify-between text-[11px] bg-zinc-950/70 border border-zinc-800/80 px-2.5 py-1.5 rounded-lg mb-3">
                      <div className="flex items-center gap-1.5 text-zinc-300">
                        <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>
                          <strong className="text-zinc-100 font-semibold">{file.downloadedBy?.length || 0}</strong>{' '}
                          {(file.downloadedBy?.length || 0) === 1 ? 'person downloaded' : 'people downloaded'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-zinc-500" title={`${file.downloadCount || 0} total downloads`}>
                        {file.downloadCount || 0} {(file.downloadCount || 0) === 1 ? 'dl' : 'dls'}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Row: Uploader details & Action buttons */}
                  <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs">
                    <div className="min-w-0 pr-2">
                      <p className="text-[11px] text-zinc-400 truncate">
                        {file.uploaderId === currentUser.id ? 'Uploaded by you' : `By ${file.uploaderName}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Download Button (Available for all authorized viewers) */}
                      <button
                        id={`download-file-${file.id}`}
                        onClick={() => handleDownload(file)}
                        disabled={downloadingId === file.id}
                        title="Download file"
                        className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 transition cursor-pointer"
                        aria-label="Download"
                      >
                        {downloadingId === file.id ? (
                          <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                      </button>

                      {/* 
                        DELETE BUTTON RULE:
                        "user can delete their own uploaded file but not delete other uploaded file."
                      */}
                      {isOwner ? (
                        <button
                          id={`delete-file-${file.id}`}
                          onClick={() => handleDelete(file)}
                          disabled={deletingId === file.id}
                          title="Delete file"
                          className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-950/60 hover:border-rose-800/40 text-zinc-400 hover:text-rose-300 transition cursor-pointer"
                          aria-label="Delete"
                        >
                          {deletingId === file.id ? (
                            <span className="inline-block w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      ) : (
                        <span
                          title="Only the owner can delete this file"
                          className="p-1.5 text-zinc-600 cursor-not-allowed opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Upload File Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        currentUser={currentUser}
        token={token}
        onUploadSuccess={newFile => {
          loadFiles();
          setActionSuccess(`File "${newFile.fileName}" uploaded to ${newFile.isPrivate ? 'Private' : 'Public'} vault`);
          setTimeout(() => setActionSuccess(null), 4000);
        }}
      />

      {/* In-App Delete File Confirmation Modal */}
      {pendingDeleteFile && (
        <div
          id="user-file-delete-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            id="user-file-delete-modal-card"
            className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-zinc-100">
                  Delete File
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete{' '}
                  <span className="font-mono text-amber-400 font-semibold">{pendingDeleteFile.fileName}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>File Size:</span>
                <span className="font-mono text-zinc-200">
                  {(pendingDeleteFile.fileSize / 1024).toFixed(1)} KB
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Vault Visibility:</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${pendingDeleteFile.isPrivate ? 'bg-amber-500/10 text-amber-400' : 'bg-blue-500/10 text-blue-400'}`}>
                  {pendingDeleteFile.isPrivate ? 'Private File' : 'Public File'}
                </span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 bg-red-500/5 border border-red-500/15 p-2.5 rounded-lg">
              ⚠️ This will remove the file from secure local storage and the connected Supabase cloud table.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDeleteFile(null)}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteFile}
                disabled={Boolean(deletingId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 shadow-lg shadow-red-950/50"
              >
                {deletingId ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* User Real-Time Notifications Modal */}
      <UserNotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        notifications={notifications}
        onMarkAsRead={handleMarkAsRead}
        onMarkAllAsRead={handleMarkAllAsRead}
        isLoading={loadingNotifications}
      />
    </div>
  );
};
