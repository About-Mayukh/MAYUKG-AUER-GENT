import React, { useState } from 'react';
import {
  Send,
  X,
  Bell,
  Users,
  User as UserIcon,
  AlertTriangle,
  ShieldAlert,
  Info,
  CheckCircle2,
  Trash2,
  Clock,
  Radio,
  History,
} from 'lucide-react';
import { User, AppNotification } from '../types.ts';

interface SendNotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  adminDeviceId: string;
  existingUsers: User[];
  preselectedUser?: User | null;
  onNotificationSent: (notification: AppNotification) => void;
}

export const SendNotificationModal: React.FC<SendNotificationModalProps> = ({
  isOpen,
  onClose,
  token,
  adminDeviceId,
  existingUsers,
  preselectedUser,
  onNotificationSent,
}) => {
  const [targetType, setTargetType] = useState<'all' | 'specific'>(
    preselectedUser ? 'specific' : 'all'
  );
  const [selectedUserId, setSelectedUserId] = useState<string>(
    preselectedUser ? preselectedUser.id : (existingUsers[0]?.id || '')
  );
  const [notifType, setNotifType] = useState<'info' | 'warning' | 'alert' | 'success'>('info');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState<AppNotification[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/admin/notifications', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminDeviceId,
        },
      });
      const data = await res.json();
      if (res.ok) {
        setHistoryList(data.notifications || []);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleHistory = () => {
    if (!showHistory) {
      loadHistory();
    }
    setShowHistory(!showHistory);
  };

  const handleDeleteHistoryItem = async (notifId: string) => {
    setDeletingId(notifId);
    try {
      const res = await fetch(`/api/admin/notifications/${notifId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminDeviceId,
        },
      });
      if (res.ok) {
        setHistoryList(prev => prev.filter(n => n.id !== notifId));
      }
    } catch {
      // Ignore
    } finally {
      setDeletingId(null);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      setSendError('Please provide both a notification title and message.');
      return;
    }

    setIsSending(true);
    setSendError(null);
    setSendSuccess(null);

    let targetUserId = 'ALL';
    let targetEmail = 'ALL';

    if (targetType === 'specific') {
      const targetUser = existingUsers.find(u => u.id === selectedUserId);
      if (!targetUser) {
        setSendError('Selected target user not found');
        setIsSending(false);
        return;
      }
      targetUserId = targetUser.id;
      targetEmail = targetUser.email;
    }

    try {
      const res = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminDeviceId,
        },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          targetUserId,
          targetEmail,
          type: notifType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch notification');
      }

      setSendSuccess(
        `Notification dispatched in real time to ${
          targetType === 'all' ? 'All Registered Users' : targetEmail
        } and synced to Supabase database.`
      );
      setTitle('');
      setMessage('');
      onNotificationSent(data.notification);

      if (showHistory) {
        loadHistory();
      }
    } catch (err: any) {
      setSendError(err.message || 'Error sending notification');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      id="send-notification-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        id="send-notification-modal"
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100 tracking-tight">
                  Dispatch User Notification
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" />
                  Real-time Supabase Sync
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Broadcast announcements or send targeted security alerts directly to users.
              </p>
            </div>
          </div>

          <button
            id="close-send-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Switcher: Send Form vs Sent History */}
        <div className="px-4 sm:px-5 py-2.5 bg-zinc-950/70 border-b border-zinc-800/80 flex items-center justify-between">
          <span className="text-xs text-zinc-400">
            {showHistory ? 'Sent Notifications Log' : 'Compose Live Announcement'}
          </span>
          <button
            id="toggle-notif-history-btn"
            type="button"
            onClick={handleToggleHistory}
            className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 transition cursor-pointer"
          >
            <History className="w-3.5 h-3.5" />
            <span>{showHistory ? 'Compose Message' : 'View Sent History'}</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {showHistory ? (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
                  <Clock className="w-6 h-6 animate-spin text-zinc-600" />
                  <span>Loading sent notifications history...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs">
                  No notifications recorded yet.
                </div>
              ) : (
                historyList.map(item => (
                  <div
                    key={item.id}
                    className="p-3 bg-zinc-950 border border-zinc-800/80 rounded-xl flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-zinc-100">{item.title}</span>
                        <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                          {item.type}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 whitespace-pre-wrap">{item.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 font-mono">
                        <span>Target: {item.targetEmail || 'ALL'}</span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteHistoryItem(item.id)}
                      disabled={deletingId === item.id}
                      title="Delete notification from vault and Supabase"
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4">
              {/* Feedback messages */}
              {sendError && (
                <div className="p-3 bg-rose-950/60 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}
              {sendSuccess && (
                <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{sendSuccess}</span>
                </div>
              )}

              {/* Target Audience Selector */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Target Recipient
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    id="target-all-users-btn"
                    onClick={() => setTargetType('all')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer ${
                      targetType === 'all'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>All Registered Users</span>
                  </button>

                  <button
                    type="button"
                    id="target-specific-user-btn"
                    onClick={() => setTargetType('specific')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition cursor-pointer ${
                      targetType === 'specific'
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" />
                    <span>Specific User</span>
                  </button>
                </div>
              </div>

              {/* Specific User Dropdown */}
              {targetType === 'specific' && (
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Select Target User
                  </label>
                  <select
                    id="target-user-select"
                    value={selectedUserId}
                    onChange={e => setSelectedUserId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                  >
                    {existingUsers.map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notification Severity / Type */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Notification Type & Priority
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifType('info')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      notifType === 'info'
                        ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5 text-sky-400" />
                    <span>Notice</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotifType('warning')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      notifType === 'warning'
                        ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Warning</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotifType('alert')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      notifType === 'alert'
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                    <span>Critical</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNotifType('success')}
                    className={`py-2 px-2.5 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      notifType === 'success'
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Success</span>
                  </button>
                </div>
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Notification Title
                </label>
                <input
                  id="notif-title-input"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Scheduled Security Maintenance / Access Update"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              {/* Message text area */}
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Notification Message
                </label>
                <textarea
                  id="notif-message-input"
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Enter the detailed announcement or message to be delivered to authorized device screens..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 resize-none"
                  required
                />
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  id="submit-notification-btn"
                  disabled={isSending || !title.trim() || !message.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'Transmitting & Syncing...' : 'Send Live Notification'}</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 text-center">
          <p className="text-[10px] text-zinc-500 font-mono">
            Direct Zero-Trust Push • Stored in Supabase `notifications` table
          </p>
        </div>
      </div>
    </div>
  );
};
