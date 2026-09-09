import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Smartphone,
  Sliders,
  Database,
  ScrollText,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  FolderLock,
  ArrowRightLeft,
  Trash2,
  Lock,
  Globe,
  Download,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { User, RegistrationRequest, DeviceChangeRequest, VaultFile, AuditLog, AdminStats } from '../types.ts';

interface AdminDashboardProps {
  adminUser: User;
  token: string;
  onExitAdmin: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  adminUser,
  token,
  onExitAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<'requests' | 'users' | 'files' | 'supabase' | 'audit'>('requests');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [existingUsers, setExistingUsers] = useState<User[]>([]);
  const [registrationRequests, setRegistrationRequests] = useState<RegistrationRequest[]>([]);
  const [deviceChangeRequests, setDeviceChangeRequests] = useState<DeviceChangeRequest[]>([]);
  const [allFiles, setAllFiles] = useState<VaultFile[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [supabaseSql, setSupabaseSql] = useState<string>('');
  const [supabaseStatus, setSupabaseStatus] = useState<any>(null);
  const [checkingSupabase, setCheckingSupabase] = useState(false);
  const [syncingSupabase, setSyncingSupabase] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ message: string; success: boolean } | null>(null);

  const [copiedSql, setCopiedSql] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Deletion modal state (replaces window.confirm which is blocked by iframe security)
  const [pendingDelete, setPendingDelete] = useState<{
    type: 'user' | 'file' | 'registration' | 'device-change';
    id: string;
    name: string;
    table: string;
    detail?: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch admin console data
  const loadAdminData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/dashboard-data', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch admin data');
      }

      setStats(data.stats);

      // Defensively deduplicate lists by ID to ensure completely unique React keys
      const rawUsers: User[] = data.existingUsers || [];
      setExistingUsers(rawUsers.filter((u, idx, arr) => arr.findIndex(t => t.id === u.id) === idx));

      const rawRegs: any[] = data.requestLogins || [];
      setRegistrationRequests(rawRegs.filter((r, idx, arr) => arr.findIndex(t => t.id === r.id) === idx));

      const rawDcrs: any[] = data.deviceChangeRequests || [];
      setDeviceChangeRequests(rawDcrs.filter((d, idx, arr) => arr.findIndex(t => t.id === d.id) === idx));

      const rawFiles: any[] = data.allFiles || [];
      setAllFiles(rawFiles.filter((f, idx, arr) => arr.findIndex(t => t.id === f.id) === idx));

      const rawLogs: any[] = data.auditLogs || [];
      setAuditLogs(rawLogs.filter((l, idx, arr) => arr.findIndex(t => t.id === l.id) === idx));
    } catch (err: any) {
      setActionError(err.message || 'Error loading dashboard records');
    } finally {
      setLoading(false);
    }
  };

  // Fetch Supabase status
  const loadSupabaseStatus = async () => {
    setCheckingSupabase(true);
    try {
      const res = await fetch('/api/admin/supabase-status', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });
      const data = await res.json();
      setSupabaseStatus(data);
    } catch (err) {
      console.error('Failed to load Supabase status:', err);
    } finally {
      setCheckingSupabase(false);
    }
  };

  // Fetch Supabase SQL script
  const loadSupabaseSql = async () => {
    try {
      const res = await fetch('/api/admin/supabase-sql', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });
      const text = await res.text();
      setSupabaseSql(text);
    } catch (err) {
      console.error('Failed to load Supabase SQL script:', err);
    }
  };

  const handleSyncToSupabase = async () => {
    setSyncingSupabase(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/admin/sync-supabase', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback({
          success: true,
          message: `All tables synced to Supabase successfully! (${data.counts?.users || 0} users, ${data.counts?.files || 0} files, ${data.counts?.registrations || 0} registrations, ${data.counts?.deviceChanges || 0} device changes).`,
        });
        triggerNotice('Database synchronized with Supabase tables');
        loadSupabaseStatus();
      } else {
        setSyncFeedback({
          success: false,
          message: `Sync warning: ${data.error || 'Check if tables exist in your Supabase project.'}`,
        });
      }
    } catch (err: any) {
      setSyncFeedback({
        success: false,
        message: `Failed to trigger sync: ${err.message}`,
      });
    } finally {
      setSyncingSupabase(false);
    }
  };

  useEffect(() => {
    loadAdminData();
    loadSupabaseSql();
    loadSupabaseStatus();
  }, []);

  const triggerNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 4500);
  };

  // Approve New Registration
  const handleApproveRegistration = async (requestId: string) => {
    setProcessingId(requestId);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/requests/approve-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');

      triggerNotice(data.message || 'User approved successfully');
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'Error processing approval');
    } finally {
      setProcessingId(null);
    }
  };

  // Reject Registration
  const handleRejectRegistration = async (requestId: string) => {
    const reason = prompt('Please specify rejection reason (optional):') || 'Declined by administrator';
    setProcessingId(requestId);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/requests/reject-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({ requestId, reason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed');

      triggerNotice('Registration request rejected');
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'Error rejecting request');
    } finally {
      setProcessingId(null);
    }
  };

  // Approve Device Change
  const handleApproveDeviceChange = async (requestId: string) => {
    setProcessingId(requestId);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/requests/approve-device-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Device approval failed');

      triggerNotice(data.message || 'Device change approved');
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'Error approving device change');
    } finally {
      setProcessingId(null);
    }
  };

  // Reject Device Change
  const handleRejectDeviceChange = async (requestId: string) => {
    setProcessingId(requestId);
    setActionError(null);
    try {
      const res = await fetch('/api/admin/requests/reject-device-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed');

      triggerNotice('Device change request rejected');
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'Error rejecting device change');
    } finally {
      setProcessingId(null);
    }
  };

  // Update Granular Permissions
  const handleTogglePermission = async (
    targetUser: User,
    permissionKey: keyof User['permissions'],
    newValue: boolean
  ) => {
    const updatedPermissions = {
      ...targetUser.permissions,
      [permissionKey]: newValue,
    };

    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({
          permissions: updatedPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update permission');

      setExistingUsers(prev =>
        prev.map(u => (u.id === targetUser.id ? { ...u, permissions: updatedPermissions } : u))
      );
      triggerNotice(`Updated permission "${permissionKey}" for ${targetUser.email}`);
    } catch (err: any) {
      setActionError(err.message || 'Permission update error');
    }
  };

  // Toggle Account Status (active vs suspended)
  const handleToggleStatus = async (targetUser: User) => {
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${targetUser.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
        body: JSON.stringify({
          permissions: targetUser.permissions,
          status: nextStatus,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status update failed');

      setExistingUsers(prev =>
        prev.map(u => (u.id === targetUser.id ? { ...u, status: nextStatus } : u))
      );
      triggerNotice(`Account ${targetUser.email} is now ${nextStatus}`);
    } catch (err: any) {
      setActionError(err.message || 'Status change error');
    }
  };

  // Unified Delete Confirmation and Execution (replaces blocked window.confirm)
  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    setActionError(null);
    try {
      let url = '';
      if (pendingDelete.type === 'user') {
        url = `/api/admin/users/${pendingDelete.id}`;
      } else if (pendingDelete.type === 'file') {
        url = `/api/files/${pendingDelete.id}`;
      } else if (pendingDelete.type === 'registration') {
        url = `/api/admin/requests/registration/${pendingDelete.id}`;
      } else if (pendingDelete.type === 'device-change') {
        url = `/api/admin/requests/device-change/${pendingDelete.id}`;
      }

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete record');

      if (pendingDelete.type === 'user') {
        setExistingUsers(prev => prev.filter(u => u.id !== pendingDelete.id));
        triggerNotice(`User ${pendingDelete.name} permanently deleted from vault & Supabase`);
      } else if (pendingDelete.type === 'file') {
        setAllFiles(prev => prev.filter(f => f.id !== pendingDelete.id));
        triggerNotice(`File ${pendingDelete.name} permanently deleted from vault & Supabase`);
      } else if (pendingDelete.type === 'registration') {
        setRegistrationRequests(prev => prev.filter(r => r.id !== pendingDelete.id));
        triggerNotice(`Registration request for ${pendingDelete.name} deleted from Supabase`);
      } else if (pendingDelete.type === 'device-change') {
        setDeviceChangeRequests(prev => prev.filter(d => d.id !== pendingDelete.id));
        triggerNotice(`Device change request for ${pendingDelete.name} deleted from Supabase`);
      }

      setPendingDelete(null);
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'Deletion error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Helper trigger methods for opening the in-app confirmation modal
  const handleDeleteUser = (userId: string, email: string) => {
    setPendingDelete({
      type: 'user',
      id: userId,
      name: email,
      table: 'existing_users',
      detail: `Account: ${email}`,
    });
  };

  const handleAdminDeleteFile = (fileId: string, fileName?: string) => {
    setPendingDelete({
      type: 'file',
      id: fileId,
      name: fileName || fileId,
      table: 'uploaded_files',
      detail: `File Record: ${fileName || fileId}`,
    });
  };

  const handleDeleteRegistration = (requestId: string, applicantEmail: string) => {
    setPendingDelete({
      type: 'registration',
      id: requestId,
      name: applicantEmail,
      table: 'request_logins',
      detail: `Login Registration Request for: ${applicantEmail}`,
    });
  };

  const handleDeleteDeviceChange = (requestId: string, applicantEmail: string) => {
    setPendingDelete({
      type: 'device-change',
      id: requestId,
      name: applicantEmail,
      table: 'device_change_requests',
      detail: `Hardware Device Swap Request for: ${applicantEmail}`,
    });
  };

  // Download File as Admin (Master access to every file: private and public)
  const handleAdminDownloadFile = async (file: VaultFile) => {
    setProcessingId(file.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/files/${file.id}/download`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-device-id': adminUser.deviceId,
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to download file');

      const a = document.createElement('a');
      a.href = data.dataUrl;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      triggerNotice(`Admin downloaded ${file.fileName} (${file.isPrivate ? 'Private' : 'Public'})`);
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || 'File download error');
    } finally {
      setProcessingId(null);
    }
  };

  // Copy Supabase SQL
  const handleCopySql = () => {
    navigator.clipboard.writeText(supabaseSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const pendingRegistrationsCount = registrationRequests.filter(r => r.status === 'pending').length;
  const pendingDeviceChangesCount = deviceChangeRequests.filter(d => d.status === 'pending').length;
  const totalPending = pendingRegistrationsCount + pendingDeviceChangesCount;

  return (
    <div
      id="admin-dashboard"
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500 selection:text-black"
    >
      {/* Top Admin Navigation Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 sticky top-0 z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold tracking-tight text-zinc-100">
                  MASTER ADMINISTRATIVE CONSOLE
                </h1>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Supabase RLS Engine
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Admin: {adminUser.email}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadAdminData}
              title="Refresh database records"
              className="p-2 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              id="exit-admin-btn"
              onClick={onExitAdmin}
              className="py-1.5 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit Console</span>
            </button>
          </div>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Existing Users</span>
              <Users className="w-4 h-4 text-sky-400" />
            </div>
            <span className="text-xl font-bold font-mono text-zinc-100">
              {stats?.totalUsers ?? existingUsers.length}
            </span>
          </div>

          <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Pending Approvals</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-amber-400">{totalPending}</span>
              <span className="text-[11px] text-zinc-500 font-mono">
                ({pendingRegistrationsCount} reg / {pendingDeviceChangesCount} dev)
              </span>
            </div>
          </div>

          <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Vault Files</span>
              <FolderLock className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xl font-bold font-mono text-zinc-100">
              {stats?.totalFiles ?? allFiles.length}
            </span>
          </div>

          <div className="p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between text-zinc-400 text-xs mb-1">
              <span>Privacy Breakdown</span>
              <Lock className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xs font-mono text-zinc-300">
              <span className="text-blue-400">{stats?.publicFiles ?? 0} Public</span> /{' '}
              <span className="text-amber-400">{stats?.privateFiles ?? 0} Private</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Notification Toasts */}
      {actionNotice && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-3 bg-emerald-950/60 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
        </div>
      )}

      {actionError && (
        <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4">
          <div className="p-3 bg-red-950/60 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {/* Admin Tab Controls */}
      <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-6">
        <div className="flex items-center gap-2 border-b border-zinc-800 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-2 px-3.5 text-xs font-medium rounded-t-lg transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-zinc-900 text-amber-400 border-b-2 border-amber-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Pending Approvals</span>
            {totalPending > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-zinc-950">
                {totalPending}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('users')}
            className={`py-2 px-3.5 text-xs font-medium rounded-t-lg transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'users'
                ? 'bg-zinc-900 text-amber-400 border-b-2 border-amber-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Users & Granular Permissions</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`py-2 px-3.5 text-xs font-medium rounded-t-lg transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'files'
                ? 'bg-zinc-900 text-amber-400 border-b-2 border-amber-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <FolderLock className="w-3.5 h-3.5" />
            <span>All Vault Files</span>
          </button>

          <button
            onClick={() => setActiveTab('supabase')}
            className={`py-2 px-3.5 text-xs font-medium rounded-t-lg transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'supabase'
                ? 'bg-zinc-900 text-amber-400 border-b-2 border-amber-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Supabase RLS Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`py-2 px-3.5 text-xs font-medium rounded-t-lg transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-zinc-900 text-amber-400 border-b-2 border-amber-500'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            <span>Audit Logs</span>
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-zinc-400">Loading database records...</p>
          </div>
        ) : (
          <>
            {/* 1. PENDING APPROVALS TAB */}
            {activeTab === 'requests' && (
              <div className="space-y-8">
                {/* Section A: New User Registration Requests */}
                <div
                  id="admin-registration-requests-section"
                  className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5 shadow-sm space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-400" />
                        <span>New User Registration Requests</span>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                          Table: request_logins
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        First-time users requesting initial hardware device binding and account creation
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-zinc-950 border border-zinc-800 text-zinc-300">
                        Total: {registrationRequests.length}
                      </span>
                      {registrationRequests.some(r => r.status === 'pending') && (
                        <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 font-semibold animate-pulse">
                          {registrationRequests.filter(r => r.status === 'pending').length} Pending
                        </span>
                      )}
                    </div>
                  </div>

                  {registrationRequests.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center bg-zinc-900/40 text-xs text-zinc-500">
                      No registration requests submitted yet.
                    </div>
                  ) : (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                            <tr>
                              <th className="py-3 px-4">Applicant</th>
                              <th className="py-3 px-4">Gmail ID</th>
                              <th className="py-3 px-4">Mobile</th>
                              <th className="py-3 px-4">Captured Device ID</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60">
                            {registrationRequests.map((req, idx) => (
                              <tr key={`reg-req-${req.id}-${idx}`} className="hover:bg-zinc-800/30 transition">
                                <td className="py-3 px-4 font-medium text-zinc-200">{req.name}</td>
                                <td className="py-3 px-4 text-zinc-300 font-mono">{req.email}</td>
                                <td className="py-3 px-4 text-zinc-300 font-mono">{req.phone}</td>
                                <td className="py-3 px-4 text-amber-400 font-mono text-[11px]">
                                  {req.deviceId}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                      req.status === 'approved'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : req.status === 'rejected'
                                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                                    }`}
                                  >
                                    {req.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {req.status === 'pending' ? (
                                      <>
                                        <button
                                          onClick={() => handleApproveRegistration(req.id)}
                                          disabled={processingId === req.id}
                                          className="py-1 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                                          title="Approve registration & grant account login"
                                        >
                                          <CheckCircle2 className="w-3.5 h-3.5" />
                                          <span>Approve & Grant Login</span>
                                        </button>
                                        <button
                                          onClick={() => handleRejectRegistration(req.id)}
                                          disabled={processingId === req.id}
                                          className="py-1 px-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/50 text-rose-300 hover:text-rose-100 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                                          title="Reject registration request"
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                          <span>Reject</span>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[11px] text-zinc-500 mr-1">Processed</span>
                                    )}
                                    <button
                                      onClick={() => handleDeleteRegistration(req.id, req.email)}
                                      disabled={processingId === req.id}
                                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-transparent hover:border-red-500/30 transition cursor-pointer"
                                      title="Permanently delete request from Supabase table request_logins"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span className="sr-only">Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section B: Device Change Requests */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                        <span>Device Change Requests</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          Table: device_change_requests
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Existing approved users requesting to re-bind their account to a new physical device
                      </p>
                    </div>
                  </div>

                  {deviceChangeRequests.length === 0 ? (
                    <div className="p-8 border border-zinc-800 rounded-xl text-center bg-zinc-900/40 text-xs text-zinc-500">
                      No device change requests pending.
                    </div>
                  ) : (
                    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                            <tr>
                              <th className="py-3 px-4">User</th>
                              <th className="py-3 px-4">Gmail ID</th>
                              <th className="py-3 px-4">Registered Phone</th>
                              <th className="py-3 px-4">Old Device ID</th>
                              <th className="py-3 px-4">New Device ID</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4 text-right">Action</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-zinc-800/60">
                            {deviceChangeRequests.map((dcr, idx) => (
                              <tr key={`dcr-${dcr.id}-${idx}`} className="hover:bg-zinc-800/30 transition">
                                <td className="py-3 px-4 font-medium text-zinc-200">{dcr.name}</td>
                                <td className="py-3 px-4 text-zinc-300 font-mono">{dcr.email}</td>
                                <td className="py-3 px-4 text-zinc-300 font-mono">{dcr.phone}</td>
                                <td className="py-3 px-4 text-zinc-500 font-mono text-[11px] line-through">
                                  {dcr.oldDeviceId}
                                </td>
                                <td className="py-3 px-4 text-amber-400 font-mono text-[11px]">
                                  {dcr.newDeviceId}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                      dcr.status === 'approved'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : dcr.status === 'rejected'
                                        ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                    }`}
                                  >
                                    {dcr.status}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {dcr.status === 'pending' ? (
                                      <>
                                        <button
                                          onClick={() => handleApproveDeviceChange(dcr.id)}
                                          disabled={processingId === dcr.id}
                                          className="py-1 px-2.5 bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold rounded text-xs transition cursor-pointer flex items-center gap-1 shadow-sm"
                                          title="Approve device hardware binding swap"
                                        >
                                          <ArrowRightLeft className="w-3.5 h-3.5" />
                                          <span>Approve Device Swap</span>
                                        </button>
                                        <button
                                          onClick={() => handleRejectDeviceChange(dcr.id)}
                                          disabled={processingId === dcr.id}
                                          className="py-1 px-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/50 text-rose-300 hover:text-rose-100 rounded text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                                          title="Reject device change request"
                                        >
                                          <XCircle className="w-3.5 h-3.5" />
                                          <span>Reject</span>
                                        </button>
                                      </>
                                    ) : (
                                      <span className="text-[11px] text-zinc-500 mr-1">Processed</span>
                                    )}
                                    <button
                                      onClick={() => handleDeleteDeviceChange(dcr.id, dcr.email)}
                                      disabled={processingId === dcr.id}
                                      className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-red-950 text-zinc-400 hover:text-red-300 border border-transparent hover:border-red-500/30 transition cursor-pointer"
                                      title="Permanently delete request from Supabase table device_change_requests"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span className="sr-only">Delete</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. USERS & GRANULAR PERMISSIONS TAB */}
            {activeTab === 'users' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>Existing Approved Users</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        Table: existing_users
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Configure granular role permissions per user: Public Uploads, Private Uploads, Deletion, Download
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                        <tr>
                          <th className="py-3 px-4">User</th>
                          <th className="py-3 px-4">
                            <span>Bound Device ID</span>{' '}
                            <span className="text-[9px] text-amber-400/90 font-mono font-normal block sm:inline">
                              (Admin Unrestricted)
                            </span>
                          </th>
                          <th className="py-3 px-4 text-center">Upload Public</th>
                          <th className="py-3 px-4 text-center">Upload Private</th>
                          <th className="py-3 px-4 text-center">Delete Own</th>
                          <th className="py-3 px-4 text-center">Download</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4 text-right">Delete</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {existingUsers.map((user, idx) => {
                          const isMaster = user.role === 'admin';

                          return (
                            <tr key={`user-${user.id}-${idx}`} className="hover:bg-zinc-800/30 transition">
                              <td className="py-3 px-4">
                                <div className="font-semibold text-zinc-100">{user.name}</div>
                                <div className="text-[11px] text-zinc-400 font-mono">{user.email}</div>
                                <div className="text-[10px] text-zinc-500 font-mono">{user.phone}</div>
                              </td>

                              <td className="py-3 px-4 font-mono text-[11px] text-amber-400 max-w-[180px] truncate">
                                {user.deviceId}
                              </td>

                              {/* Granular Permission: Can Upload Public */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() =>
                                    !isMaster &&
                                    handleTogglePermission(
                                      user,
                                      'canUploadPublic',
                                      !user.permissions.canUploadPublic
                                    )
                                  }
                                  disabled={isMaster}
                                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                                    user.permissions.canUploadPublic
                                      ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                      : 'bg-zinc-800 text-zinc-500'
                                  } ${!isMaster ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {user.permissions.canUploadPublic ? 'ALLOW' : 'DENY'}
                                </button>
                              </td>

                              {/* Granular Permission: Can Upload Private */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() =>
                                    !isMaster &&
                                    handleTogglePermission(
                                      user,
                                      'canUploadPrivate',
                                      !user.permissions.canUploadPrivate
                                    )
                                  }
                                  disabled={isMaster}
                                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                                    user.permissions.canUploadPrivate
                                      ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                      : 'bg-zinc-800 text-zinc-500'
                                  } ${!isMaster ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {user.permissions.canUploadPrivate ? 'ALLOW' : 'DENY'}
                                </button>
                              </td>

                              {/* Granular Permission: Can Delete Own Files */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() =>
                                    !isMaster &&
                                    handleTogglePermission(
                                      user,
                                      'canDeleteOwn',
                                      !user.permissions.canDeleteOwn
                                    )
                                  }
                                  disabled={isMaster}
                                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                                    user.permissions.canDeleteOwn
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-zinc-800 text-zinc-500'
                                  } ${!isMaster ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {user.permissions.canDeleteOwn ? 'ALLOW' : 'DENY'}
                                </button>
                              </td>

                              {/* Granular Permission: Can Download */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() =>
                                    !isMaster &&
                                    handleTogglePermission(
                                      user,
                                      'canDownload',
                                      !user.permissions.canDownload
                                    )
                                  }
                                  disabled={isMaster}
                                  className={`px-2.5 py-1 rounded text-[11px] font-mono transition ${
                                    user.permissions.canDownload
                                      ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                      : 'bg-zinc-800 text-zinc-500'
                                  } ${!isMaster ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {user.permissions.canDownload ? 'ALLOW' : 'DENY'}
                                </button>
                              </td>

                              {/* Account Status */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => !isMaster && handleToggleStatus(user)}
                                  disabled={isMaster}
                                  className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition ${
                                    user.status === 'active'
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                  } ${!isMaster ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                                >
                                  {user.status}
                                </button>
                              </td>

                              {/* Delete Account */}
                              <td className="py-3 px-4 text-right">
                                {!isMaster && (
                                  <button
                                    onClick={() => handleDeleteUser(user.id, user.email)}
                                    title="Revoke user account"
                                    className="p-1.5 rounded-lg bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-300 transition cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 3. ALL VAULT FILES TAB */}
            {activeTab === 'files' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>All Vault Files</span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                        Table: uploaded_files
                      </span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Complete inventory of public and private files stored across user accounts
                    </p>
                  </div>
                </div>

                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                        <tr>
                          <th className="py-3 px-4">File Name</th>
                          <th className="py-3 px-4">Visibility</th>
                          <th className="py-3 px-4">Uploader</th>
                          <th className="py-3 px-4">Size</th>
                          <th className="py-3 px-4">Downloads</th>
                          <th className="py-3 px-4">Uploaded Date</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {allFiles.map((file, idx) => (
                          <tr key={`admin-file-${file.id}-${idx}`} className="hover:bg-zinc-800/30 transition">
                            <td className="py-3 px-4 font-medium text-zinc-200 flex items-center gap-2">
                              <FileText className="w-4 h-4 text-zinc-400 shrink-0" />
                              <span className="truncate max-w-xs">{file.fileName}</span>
                            </td>
                            <td className="py-3 px-4">
                              {file.isPrivate ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                  <Lock className="w-3 h-3" />
                                  <span>Private</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  <Globe className="w-3 h-3" />
                                  <span>Public</span>
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-zinc-300 font-mono">
                              {file.uploaderName} ({file.uploaderEmail})
                            </td>
                            <td className="py-3 px-4 text-zinc-400 font-mono text-[11px]">
                              {(file.fileSize / 1024).toFixed(1)} KB
                            </td>
                            <td className="py-3 px-4 text-zinc-300 font-mono text-[11px]">
                              <div className="flex items-center gap-1.5" title={`${file.downloadCount || 0} total downloads by ${(file.downloadedBy || []).join(', ') || 'none'}`}>
                                <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>{file.downloadedBy?.length || 0} people</span>
                                <span className="text-[10px] text-zinc-500">({file.downloadCount || 0})</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-zinc-400 text-[11px]">
                              {new Date(file.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleAdminDownloadFile(file)}
                                  disabled={processingId === file.id}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-zinc-950 text-zinc-300 transition cursor-pointer"
                                  title={`Admin Download: ${file.fileName} (${file.isPrivate ? 'Private' : 'Public'})`}
                                >
                                  {processingId === file.id ? (
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Download className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleAdminDeleteFile(file.id)}
                                  className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950 text-zinc-400 hover:text-rose-300 transition cursor-pointer"
                                  title="Delete file"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* 4. SUPABASE & RLS ARCHITECTURE TAB */}
            {activeTab === 'supabase' && (
              <div className="space-y-6">
                {/* Live Connection & Table Status */}
                <div className="p-4 bg-zinc-900/90 border border-zinc-800 rounded-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-sm font-semibold text-zinc-100">
                          Supabase Project Integration
                        </h3>
                        <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Connected (Backend Secret Key Active)
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 font-mono mt-1">
                        Endpoint: https://mzkklxgptpifgmzstegs.supabase.co
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleSyncToSupabase}
                        disabled={syncingSupabase}
                        className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncingSupabase ? 'animate-spin' : ''}`} />
                        <span>{syncingSupabase ? 'Syncing Tables...' : 'Sync to Supabase Now'}</span>
                      </button>

                      <button
                        onClick={loadSupabaseStatus}
                        disabled={checkingSupabase}
                        className="py-1.5 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${checkingSupabase ? 'animate-spin' : ''}`} />
                        <span>Verify Tables</span>
                      </button>
                    </div>
                  </div>

                  {syncFeedback && (
                    <div
                      className={`p-3 rounded-lg text-xs flex items-start gap-2 ${
                        syncFeedback.success
                          ? 'bg-emerald-950/40 border border-emerald-800/40 text-emerald-300'
                          : 'bg-amber-950/40 border border-amber-800/40 text-amber-300'
                      }`}
                    >
                      {syncFeedback.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <span>{syncFeedback.message}</span>
                    </div>
                  )}

                  {/* Tables Status Matrix */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-zinc-800/80">
                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-300">admin_credentials</span>
                      {supabaseStatus?.tables?.admin_credentials ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-300">existing_users</span>
                      {supabaseStatus?.tables?.existing_users ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-300">request_logins</span>
                      {supabaseStatus?.tables?.request_logins ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-300">device_change_requests</span>
                      {supabaseStatus?.tables?.device_change_requests ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>

                    <div className="p-2.5 rounded-lg bg-zinc-950/60 border border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-zinc-300">uploaded_files</span>
                      {supabaseStatus?.tables?.uploaded_files ? (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          READY
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          PENDING
                        </span>
                      )}
                    </div>
                  </div>

                  {!supabaseStatus?.allTablesReady && (
                    <div className="p-3 bg-amber-950/40 border border-amber-800/40 rounded-lg text-xs text-amber-300 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Notice:</strong> One or more tables are pending confirmation. Click <strong>Verify Tables</strong> or <strong>Sync to Supabase Now</strong> to confirm table readiness and sync your data.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 5. AUDIT LOGS TAB */}
            {activeTab === 'audit' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                      <span>Security & Operational Audit Trail</span>
                    </h3>
                    <p className="text-xs text-zinc-400">
                      Cryptographic and operational record of device logins, file actions, and administrative decisions
                    </p>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-amber-300 font-mono self-start sm:self-auto">
                    <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>7-Day Auto-Purge Lifecycle Active</span>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl flex items-center gap-2 text-xs text-zinc-400">
                  <Clock className="w-4 h-4 text-zinc-500 shrink-0" />
                  <span>
                    Audit logs are retained for <strong className="text-zinc-200">7 days</strong>. Any log records older than 7 days are automatically purged by the server background task.
                  </span>
                </div>

                <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-950/70 border-b border-zinc-800 text-zinc-400 uppercase font-mono text-[10px]">
                        <tr>
                          <th className="py-3 px-4">Timestamp</th>
                          <th className="py-3 px-4">Action</th>
                          <th className="py-3 px-4">Actor</th>
                          <th className="py-3 px-4">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-zinc-500 font-sans text-xs">
                              No audit logs within the active 7-day retention window.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log, idx) => (
                            <tr key={`audit-log-${log.id}-${idx}`} className="hover:bg-zinc-800/30 transition">
                              <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString()}
                              </td>
                              <td className="py-3 px-4 text-amber-400 font-semibold">{log.action}</td>
                              <td className="py-3 px-4 text-zinc-300">{log.actor}</td>
                              <td className="py-3 px-4 text-zinc-400">{log.details}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* In-App Deletion Confirmation Modal (Guaranteed to work inside iframe) */}
      {pendingDelete && (
        <div
          id="admin-delete-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150"
        >
          <div
            id="admin-delete-modal-card"
            className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4"
          >
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-zinc-100">
                  Confirm Permanent Deletion
                </h3>
                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                  Are you sure you want to permanently delete{' '}
                  <span className="font-mono text-amber-400 font-semibold">{pendingDelete.name}</span>?
                </p>
              </div>
            </div>

            <div className="p-3 bg-zinc-950/80 rounded-xl border border-zinc-800 space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Record Type:</span>
                <span className="font-medium text-zinc-200 capitalize">
                  {pendingDelete.type.replace('-', ' ')}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Supabase Cloud Table:</span>
                <span className="font-mono text-emerald-400 font-semibold bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                  {pendingDelete.table}
                </span>
              </div>
              {pendingDelete.detail && (
                <div className="text-[11px] text-zinc-400 pt-1.5 border-t border-zinc-900 font-mono">
                  {pendingDelete.detail}
                </div>
              )}
            </div>

            <div className="text-[11px] text-zinc-400 bg-red-500/5 border border-red-500/15 p-3 rounded-lg leading-relaxed">
              ⚠️ This will delete the record from both local database storage and the connected Supabase cloud table. This action cannot be reversed.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-2 shadow-lg shadow-red-950/50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting from Supabase...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete from Supabase & Vault</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
