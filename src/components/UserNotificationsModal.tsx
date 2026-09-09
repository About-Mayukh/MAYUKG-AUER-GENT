import React, { useState } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Check,
  Info,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Radio,
} from 'lucide-react';
import { AppNotification } from '../types.ts';

interface UserNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  isLoading: boolean;
}

export const UserNotificationsModal: React.FC<UserNotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  isLoading,
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  if (!isOpen) return null;

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const filteredList = filter === 'unread' ? notifications.filter(n => !n.isRead) : notifications;

  const handleMarkOne = async (id: string) => {
    setMarkingId(id);
    try {
      await onMarkAsRead(id);
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await onMarkAllAsRead();
    } finally {
      setMarkingAll(false);
    }
  };

  const getTypeStyle = (type: AppNotification['type']) => {
    switch (type) {
      case 'warning':
        return {
          badgeBg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
          borderLeft: 'border-l-amber-500',
        };
      case 'alert':
        return {
          badgeBg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          icon: <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />,
          borderLeft: 'border-l-rose-500',
        };
      case 'success':
        return {
          badgeBg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          borderLeft: 'border-l-emerald-500',
        };
      case 'info':
      default:
        return {
          badgeBg: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
          icon: <Info className="w-4 h-4 text-sky-400 shrink-0" />,
          borderLeft: 'border-l-sky-500',
        };
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recent';
    }
  };

  return (
    <div
      id="user-notifications-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
    >
      <div
        id="user-notifications-modal"
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-zinc-100 tracking-tight">Security Notifications</h2>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {unreadCount} unread
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Live Real-Time Stream Active</span>
              </div>
            </div>
          </div>

          <button
            id="close-notifications-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter and Bulk Actions Bar */}
        <div className="px-4 py-2.5 bg-zinc-950/70 border-b border-zinc-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-zinc-900 p-0.5 rounded-lg border border-zinc-800">
            <button
              id="filter-all-notifs-btn"
              onClick={() => setFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer ${
                filter === 'all'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              id="filter-unread-notifs-btn"
              onClick={() => setFilter('unread')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition cursor-pointer ${
                filter === 'unread'
                  ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              id="mark-all-read-btn"
              onClick={handleMarkAll}
              disabled={markingAll}
              className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1.5 font-medium px-2 py-1 rounded hover:bg-amber-500/10 transition cursor-pointer disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>{markingAll ? 'Marking...' : 'Mark all read'}</span>
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading && notifications.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 text-xs flex flex-col items-center gap-2">
              <Clock className="w-6 h-6 animate-spin text-zinc-600" />
              <span>Checking live notifications...</span>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-500">
                <Bell className="w-6 h-6 opacity-60" />
              </div>
              <p className="text-xs font-medium text-zinc-300 mt-1">
                {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
              </p>
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Administrative security notices, system broadcasts, and device updates will appear here in real time.
              </p>
            </div>
          ) : (
            filteredList.map(notif => {
              const style = getTypeStyle(notif.type);
              const isUnread = !notif.isRead;

              return (
                <div
                  key={notif.id}
                  id={`notif-card-${notif.id}`}
                  className={`p-3.5 rounded-xl border transition-all relative ${
                    isUnread
                      ? 'bg-zinc-800/60 border-zinc-700/80 shadow-sm'
                      : 'bg-zinc-900/40 border-zinc-800/60 opacity-80 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className="mt-0.5">{style.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="text-xs font-semibold text-zinc-100 break-words">
                            {notif.title}
                          </h3>
                          <span
                            className={`text-[9px] uppercase font-mono px-1.5 py-0.2 rounded border ${style.badgeBg}`}
                          >
                            {notif.type}
                          </span>
                          {isUnread && (
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          )}
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed break-words whitespace-pre-wrap">
                          {notif.message}
                        </p>

                        <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500 font-mono">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimestamp(notif.createdAt)}
                          </span>
                          <span>From: {notif.senderEmail || 'Administrator'}</span>
                          {notif.targetEmail && notif.targetEmail !== 'ALL' && (
                            <span className="text-amber-400/80">Direct to you</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {isUnread && (
                      <button
                        id={`mark-read-btn-${notif.id}`}
                        onClick={() => handleMarkOne(notif.id)}
                        disabled={markingId === notif.id}
                        title="Mark as read"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700/60 transition cursor-pointer shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-zinc-950/80 border-t border-zinc-800 text-center">
          <p className="text-[10px] text-zinc-500 font-mono">
            Zero-Trust Vault • Real-time Supabase Synchronized
          </p>
        </div>
      </div>
    </div>
  );
};
