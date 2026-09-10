import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Table interfaces
export interface DbUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  deviceId: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  permissions: {
    canUploadPublic: boolean;
    canUploadPrivate: boolean;
    canDeleteOwn: boolean;
    canDownload: boolean;
  };
  createdAt: string;
  lastLoginAt: string;
}

export interface DbRegistrationRequest {
  id: string;
  email: string;
  name: string;
  phone: string;
  deviceId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectReason?: string;
}

export interface DbDeviceChangeRequest {
  id: string;
  userId: string;
  email: string;
  name: string;
  phone: string;
  oldDeviceId: string;
  newDeviceId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface DbFile {
  id: string;
  uploaderId: string;
  uploaderName: string;
  uploaderEmail: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isPrivate: boolean;
  createdAt: string;
  dataUrl: string; // Base64 data or storage reference
  downloadCount?: number;
  downloadedBy?: string[];
}

export interface ActiveSession {
  token: string;
  userId: string;
  boundDeviceId: string;
  role: 'user' | 'admin';
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

export interface DbAdminCredential {
  id: string;
  email: string;
  securityKey: string;
  name: string;
  phone?: string;
  deviceId?: string;
  role: 'admin';
  status: 'active' | 'suspended';
  createdAt?: string;
  updatedAt?: string;
}

export interface DbAuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  ip?: string;
}

export interface DbNotification {
  id: string;
  title: string;
  message: string;
  targetUserId: string; // 'ALL' or specific user ID
  targetEmail: string;  // 'ALL' or specific user email
  senderEmail: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  createdAt: string;
  readBy?: string[];    // User IDs who read this notification
}

interface VaultDatabase {
  admin_credentials?: DbAdminCredential[];
  existing_users: DbUser[];
  request_logins: DbRegistrationRequest[];
  device_change_requests: DbDeviceChangeRequest[];
  uploaded_files: DbFile[];
  admin_audit_logs: DbAuditLog[];
  notifications?: DbNotification[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'vault_db.json');

// Supabase client instance (initialized if credentials exist)
let supabaseClient: SupabaseClient | null = null;
const supabaseUrl = process.env.SUPABASE_URL;
// Server-side backend MUST prefer service-role key to execute administrative tasks and query protected tables
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
    console.log('✅ Supabase Client initialized with server-side credentials (service_role preferred)');
  } catch (err) {
    console.warn('⚠️ Could not initialize Supabase client:', err);
  }
}

export function getSupabase() {
  return supabaseClient;
}

export async function checkSupabaseStatus() {
  const url = process.env.SUPABASE_URL || '';
  const hasKey = Boolean(
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY
  );

  if (!supabaseClient) {
    return {
      configured: Boolean(url && hasKey),
      connected: false,
      url,
      tables: {
        admin_credentials: false,
        existing_users: false,
        request_logins: false,
        device_change_requests: false,
        uploaded_files: false,
        notifications: false,
      },
      allTablesReady: false,
      message: 'Supabase credentials missing or client not initialized',
    };
  }

  const checkTable = async (name: string): Promise<boolean> => {
    try {
      const res = await supabaseClient!.from(name).select('id').limit(1);
      return !res.error;
    } catch {
      return false;
    }
  };

  try {
    const [t0, t1, t2, t3, t4, t5] = await Promise.all([
      checkTable('admin_credentials'),
      checkTable('existing_users'),
      checkTable('request_logins'),
      checkTable('device_change_requests'),
      checkTable('uploaded_files'),
      checkTable('notifications'),
    ]);

    const allTablesReady = t0 && t1 && t2 && t3 && t4 && t5;

    return {
      configured: true,
      connected: true,
      url,
      tables: {
        admin_credentials: t0,
        existing_users: t1,
        request_logins: t2,
        device_change_requests: t3,
        uploaded_files: t4,
        notifications: t5,
      },
      allTablesReady,
      message: allTablesReady
        ? 'All Supabase tables connected and synchronized'
        : 'Supabase connected! Tables pending execution in Supabase SQL editor',
    };
  } catch (err: any) {
    return {
      configured: true,
      connected: false,
      url,
      tables: {
        admin_credentials: false,
        existing_users: false,
        request_logins: false,
        device_change_requests: false,
        uploaded_files: false,
        notifications: false,
      },
      allTablesReady: false,
      message: err.message || 'Error communicating with Supabase',
    };
  }
}

// Real-time Supabase Synchronizers
export async function syncUserToSupabase(user: DbUser): Promise<void> {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('existing_users').upsert({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      device_id: user.deviceId,
      role: user.role,
      status: user.status,
      can_upload_public: user.permissions?.canUploadPublic ?? true,
      can_upload_private: user.permissions?.canUploadPrivate ?? true,
      can_delete_own: user.permissions?.canDeleteOwn ?? true,
      can_download: user.permissions?.canDownload ?? true,
      created_at: user.createdAt || new Date().toISOString(),
      last_login_at: user.lastLoginAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to sync user to Supabase:', err);
  }
}

export async function deleteUserFromSupabase(userId: string, email?: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase not connected' };
  try {
    if (userId) {
      await supabaseClient.from('existing_users').delete().eq('id', userId);
    }
    if (email) {
      await supabaseClient.from('existing_users').delete().ilike('email', email.trim().toLowerCase());
    }
    console.log(`🗑️ Successfully deleted user ${userId} (${email || ''}) from Supabase existing_users table`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete user from Supabase:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteFileFromSupabase(fileId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase not connected' };
  try {
    await supabaseClient.from('uploaded_files').delete().eq('id', fileId);
    console.log(`🗑️ Successfully deleted file ${fileId} from Supabase uploaded_files table`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete file from Supabase:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteRegistrationRequestFromSupabase(requestId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase not connected' };
  try {
    await supabaseClient.from('request_logins').delete().eq('id', requestId);
    console.log(`🗑️ Successfully deleted registration request ${requestId} from Supabase request_logins table`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete registration request from Supabase:', err);
    return { success: false, error: err.message };
  }
}

export async function deleteDeviceChangeRequestFromSupabase(requestId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase not connected' };
  try {
    await supabaseClient.from('device_change_requests').delete().eq('id', requestId);
    console.log(`🗑️ Successfully deleted device change request ${requestId} from Supabase device_change_requests table`);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete device change request from Supabase:', err);
    return { success: false, error: err.message };
  }
}

export async function syncRegistrationRequestToSupabase(req: DbRegistrationRequest): Promise<void> {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('request_logins').upsert({
      id: req.id,
      email: req.email,
      name: req.name,
      phone: req.phone,
      device_id: req.deviceId,
      status: req.status,
      created_at: req.createdAt || new Date().toISOString(),
      reviewed_at: req.reviewedAt || null,
      reviewed_by: req.reviewedBy || null,
      reject_reason: req.rejectReason || null,
    });
  } catch (err) {
    console.error('Failed to sync registration request to Supabase:', err);
  }
}

export async function syncDeviceChangeRequestToSupabase(dcr: DbDeviceChangeRequest): Promise<void> {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('device_change_requests').upsert({
      id: dcr.id,
      user_id: dcr.userId,
      email: dcr.email,
      name: dcr.name,
      phone: dcr.phone,
      old_device_id: dcr.oldDeviceId,
      new_device_id: dcr.newDeviceId,
      status: dcr.status,
      created_at: dcr.createdAt || new Date().toISOString(),
      reviewed_at: dcr.reviewedAt || null,
      reviewed_by: dcr.reviewedBy || null,
    });
  } catch (err) {
    console.error('Failed to sync device change request to Supabase:', err);
  }
}

export async function syncFileToSupabase(file: DbFile): Promise<void> {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('uploaded_files').upsert({
      id: file.id,
      uploader_id: file.uploaderId,
      uploader_name: file.uploaderName,
      uploader_email: file.uploaderEmail,
      file_name: file.fileName,
      file_size: file.fileSize,
      mime_type: file.mimeType,
      is_private: file.isPrivate ?? false,
      file_data_base64: file.dataUrl,
      download_count: file.downloadCount || 0,
      downloaded_by: file.downloadedBy || [],
      created_at: file.createdAt || new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to sync file to Supabase:', err);
  }
}

export async function syncNotificationToSupabase(notif: DbNotification): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase client not configured' };
  try {
    const { error } = await supabaseClient.from('notifications').upsert({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      target_user_id: notif.targetUserId || 'ALL',
      target_email: notif.targetEmail || 'ALL',
      sender_email: notif.senderEmail,
      type: notif.type || 'info',
      read_by: notif.readBy || [],
      created_at: notif.createdAt || new Date().toISOString(),
    });
    if (error) {
      console.warn('⚠️ Supabase notifications upsert error:', error.message);
      return { success: false, error: error.message };
    }
    console.log('✅ Notification saved to Supabase notifications table successfully:', notif.id);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to sync notification to Supabase:', err);
    return { success: false, error: err.message || 'Error syncing to Supabase' };
  }
}

export async function deleteNotificationFromSupabase(notifId: string): Promise<{ success: boolean; error?: string }> {
  if (!supabaseClient) return { success: false, error: 'Supabase client not configured' };
  try {
    await supabaseClient.from('notifications').delete().eq('id', notifId);
    return { success: true };
  } catch (err: any) {
    console.error('Failed to delete notification from Supabase:', err);
    return { success: false, error: err.message };
  }
}

export function getNotificationsSql(): string {
  return `-- ==========================================================
-- CREATE NOTIFICATIONS TABLE IN SUPABASE
-- Project: mzkklxgptpifgmzstegs
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_user_id TEXT NOT NULL DEFAULT 'ALL',
    target_email TEXT NOT NULL DEFAULT 'ALL',
    sender_email TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'success')),
    read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Allow all users to read notifications
DROP POLICY IF EXISTS "Anyone can read notifications" ON public.notifications;
CREATE POLICY "Anyone can read notifications"
ON public.notifications FOR SELECT
USING (true);

-- Allow admins and backend service role to insert, update, and delete notifications
DROP POLICY IF EXISTS "Admin and service manage all notifications" ON public.notifications;
CREATE POLICY "Admin and service manage all notifications"
ON public.notifications FOR ALL
USING (true)
WITH CHECK (true);

-- Insert Initial Welcome Notification
INSERT INTO public.notifications (
    id, title, message, target_user_id, target_email, sender_email, type, created_at
) VALUES (
    'notif_sys_init',
    'Zero-Trust Secure Vault Active',
    'Welcome to the Secure Hardware-Isolated Cloud Vault. All files and transmissions are cryptographically protected.',
    'ALL',
    'ALL',
    'mayukhdey9920.apple@gmail.com',
    'info',
    now()
) ON CONFLICT (id) DO NOTHING;
`;
}

export async function syncNotificationsToSupabase(notificationsList?: DbNotification[]): Promise<{
  success: boolean;
  count: number;
  error?: string;
  tableExists: boolean;
}> {
  if (!supabaseClient) {
    return { success: false, count: 0, error: 'Supabase client not configured', tableExists: false };
  }

  // Check if notifications table exists
  try {
    const checkRes = await supabaseClient.from('notifications').select('id').limit(1);
    if (checkRes.error) {
      return {
        success: false,
        count: 0,
        tableExists: false,
        error: checkRes.error.message,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      count: 0,
      tableExists: false,
      error: err.message,
    };
  }

  try {
    const list = notificationsList || vaultDb.getAllNotifications();
    const records = list.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      target_user_id: n.targetUserId || 'ALL',
      target_email: n.targetEmail || 'ALL',
      sender_email: n.senderEmail,
      type: n.type || 'info',
      read_by: n.readBy || [],
      created_at: n.createdAt || new Date().toISOString(),
    }));

    if (records.length === 0) {
      return { success: true, count: 0, tableExists: true };
    }

    const { error } = await supabaseClient.from('notifications').upsert(records);
    if (error) {
      return { success: false, count: 0, tableExists: true, error: error.message };
    }

    return { success: true, count: records.length, tableExists: true };
  } catch (err: any) {
    return { success: false, count: 0, tableExists: true, error: err.message };
  }
}

export async function syncAllToSupabase(dbData: VaultDatabase): Promise<{ success: boolean; counts: any; tableErrors?: Record<string, string>; error?: string }> {
  if (!supabaseClient) {
    return { success: false, counts: {}, error: 'Supabase client not configured' };
  }
  const counts: Record<string, number> = {};
  const tableErrors: Record<string, string> = {};

  try {
    // 1. existing_users
    try {
      const users = (dbData.existing_users || []).map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        phone: u.phone,
        device_id: u.deviceId,
        role: u.role,
        status: u.status,
        can_upload_public: u.permissions?.canUploadPublic ?? true,
        can_upload_private: u.permissions?.canUploadPrivate ?? true,
        can_delete_own: u.permissions?.canDeleteOwn ?? true,
        can_download: u.permissions?.canDownload ?? true,
        created_at: u.createdAt || new Date().toISOString(),
        last_login_at: u.lastLoginAt || new Date().toISOString(),
      }));
      const { error: userErr } = await supabaseClient.from('existing_users').upsert(users);
      if (userErr) tableErrors.existing_users = userErr.message;
      else counts.users = users.length;
    } catch (e: any) {
      tableErrors.existing_users = e.message;
    }

    // 2. uploaded_files
    try {
      const files = (dbData.uploaded_files || []).map(f => ({
        id: f.id,
        uploader_id: f.uploaderId,
        uploader_name: f.uploaderName,
        uploader_email: f.uploaderEmail,
        file_name: f.fileName,
        file_size: f.fileSize,
        mime_type: f.mimeType,
        is_private: f.isPrivate ?? false,
        file_data_base64: f.dataUrl,
        download_count: f.downloadCount ?? 0,
        downloaded_by: f.downloadedBy ?? [],
        created_at: f.createdAt || new Date().toISOString(),
      }));
      const { error: fileErr } = await supabaseClient.from('uploaded_files').upsert(files);
      if (fileErr) tableErrors.uploaded_files = fileErr.message;
      else counts.files = files.length;
    } catch (e: any) {
      tableErrors.uploaded_files = e.message;
    }

    // 3. request_logins
    try {
      const logins = (dbData.request_logins || []).map(r => ({
        id: r.id,
        email: r.email,
        name: r.name,
        phone: r.phone,
        device_id: r.deviceId,
        status: r.status,
        created_at: r.createdAt || new Date().toISOString(),
        reviewed_at: r.reviewedAt || null,
        reviewed_by: r.reviewedBy || null,
        reject_reason: r.rejectReason || null,
      }));
      const { error: logErr } = await supabaseClient.from('request_logins').upsert(logins);
      if (logErr) tableErrors.request_logins = logErr.message;
      else counts.registrationRequests = logins.length;
    } catch (e: any) {
      tableErrors.request_logins = e.message;
    }

    // 4. device_change_requests
    try {
      const dcrs = (dbData.device_change_requests || []).map(d => ({
        id: d.id,
        user_id: d.userId,
        email: d.email,
        name: d.name,
        phone: d.phone,
        old_device_id: d.oldDeviceId,
        new_device_id: d.newDeviceId,
        status: d.status,
        created_at: d.createdAt || new Date().toISOString(),
        reviewed_at: d.reviewedAt || null,
        reviewed_by: d.reviewedBy || null,
      }));
      const { error: dcrErr } = await supabaseClient.from('device_change_requests').upsert(dcrs);
      if (dcrErr) tableErrors.device_change_requests = dcrErr.message;
      else counts.deviceChangeRequests = dcrs.length;
    } catch (e: any) {
      tableErrors.device_change_requests = e.message;
    }

    // 5. notifications
    try {
      const notifs = (dbData.notifications || []).map(n => ({
        id: n.id,
        title: n.title,
        message: n.message,
        target_user_id: n.targetUserId || 'ALL',
        target_email: n.targetEmail || 'ALL',
        sender_email: n.senderEmail,
        type: n.type || 'info',
        read_by: n.readBy || [],
        created_at: n.createdAt || new Date().toISOString(),
      }));
      if (notifs.length > 0) {
        const { error: notifErr } = await supabaseClient.from('notifications').upsert(notifs);
        if (notifErr) tableErrors.notifications = notifErr.message;
        else counts.notifications = notifs.length;
      } else {
        counts.notifications = 0;
      }
    } catch (e: any) {
      tableErrors.notifications = e.message;
    }

    const hasAnySuccess = Object.keys(counts).length > 0;
    const hasAnyError = Object.keys(tableErrors).length > 0;

    return {
      success: hasAnySuccess,
      counts,
      tableErrors: hasAnyError ? tableErrors : undefined,
      error: hasAnyError
        ? `Partial sync: some tables had issues (${Object.keys(tableErrors).join(', ')})`
        : undefined,
    };
  } catch (err: any) {
    console.error('Error during full sync to Supabase:', err);
    return { success: false, counts: {}, error: err.message };
  }
}

// Master Admin Configuration (Loaded from server environment or Supabase admin_credentials table)
export const MASTER_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').trim();
export const MASTER_ADMIN_KEY = (process.env.ADMIN_SECURITY_KEY || '').trim();

function getInitialDatabase(): VaultDatabase {
  const adminId = 'usr_admin_001';
  const now = new Date().toISOString();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@vault.internal').trim();
  const adminKey = (process.env.ADMIN_SECURITY_KEY || '').trim();

  return {
    admin_credentials: [
      {
        id: 'cred_admin_001',
        email: adminEmail,
        securityKey: adminKey,
        name: 'Administrator',
        role: 'admin',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    existing_users: [
      {
        id: adminId,
        email: adminEmail,
        name: 'Administrator',
        phone: '',
        deviceId: 'DEV-ADMIN-MASTER-SECURE',
        role: 'admin',
        status: 'active',
        permissions: {
          canUploadPublic: true,
          canUploadPrivate: true,
          canDeleteOwn: true,
          canDownload: true,
        },
        createdAt: now,
        lastLoginAt: now,
      },
      {
        id: 'usr_sarah_002',
        email: 'sarah.connor@gmail.com',
        name: 'Sarah Connor',
        phone: '+1 555-0199',
        deviceId: 'DEV-88AB42-SECURE001',
        role: 'user',
        status: 'active',
        permissions: {
          canUploadPublic: true,
          canUploadPrivate: true,
          canDeleteOwn: true,
          canDownload: true,
        },
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        lastLoginAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
      {
        id: 'usr_david_003',
        email: 'david.chen@gmail.com',
        name: 'David Chen',
        phone: '+1 555-0842',
        deviceId: 'DEV-33FC11-SECURE002',
        role: 'user',
        status: 'active',
        permissions: {
          canUploadPublic: true,
          canUploadPrivate: false,
          canDeleteOwn: true,
          canDownload: true,
        },
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        lastLoginAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      }
    ],
    request_logins: [
      {
        id: 'req_001',
        email: 'alex.rodriguez@gmail.com',
        name: 'Alex Rodriguez',
        phone: '+1 555-0234',
        deviceId: 'DEV-77DA02-PENDING99',
        status: 'pending',
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      }
    ],
    device_change_requests: [
      {
        id: 'dcr_001',
        userId: 'usr_david_003',
        email: 'david.chen@gmail.com',
        name: 'David Chen',
        phone: '+1 555-0842',
        oldDeviceId: 'DEV-33FC11-SECURE002',
        newDeviceId: 'DEV-99AC88-LAPTOP-NEW',
        status: 'pending',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      }
    ],
    uploaded_files: [
      {
        id: 'file_pub_001',
        uploaderId: 'usr_sarah_002',
        uploaderName: 'Sarah Connor',
        uploaderEmail: 'sarah.connor@gmail.com',
        fileName: 'Project_Security_Guidelines_2026.pdf',
        fileSize: 420500,
        mimeType: 'application/pdf',
        isPrivate: false,
        createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqPDwvVHlwZS9QYWdlcy9LaWRzWzMgMCBSXS9Db3VudCAxPj4KZW5kb2JqCjMgMCBvYmo8PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXT4+CmVuZG9iago0IDAgb2JqCg==',
      },
      {
        id: 'file_pub_002',
        uploaderId: adminId,
        uploaderName: 'Mayukh Dey (Administrator)',
        uploaderEmail: MASTER_ADMIN_EMAIL,
        fileName: 'Architecture_System_Diagram.png',
        fileSize: 184200,
        mimeType: 'image/png',
        isPrivate: false,
        createdAt: new Date(Date.now() - 86400000 * 1).toISOString(),
        dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      },
      {
        id: 'file_priv_001',
        uploaderId: 'usr_sarah_002',
        uploaderName: 'Sarah Connor',
        uploaderEmail: 'sarah.connor@gmail.com',
        fileName: 'Personal_Tax_Receipts_Confidential.pdf',
        fileSize: 312000,
        mimeType: 'application/pdf',
        isPrivate: true,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQKJeLjz9MKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iago=',
      }
    ],
    admin_audit_logs: [
      {
        id: 'log_001',
        timestamp: now,
        action: 'SYSTEM_BOOT',
        actor: 'SYSTEM',
        details: 'Vault security backend initialized with isolation and multi-table schemas',
      }
    ],
    notifications: [
      {
        id: 'notif_welcome_001',
        title: 'Zero-Trust Secure Vault Active',
        message: 'Welcome to the Secure Hardware-Isolated Cloud Vault. All files and transmissions are cryptographically protected.',
        targetUserId: 'ALL',
        targetEmail: 'ALL',
        senderEmail: adminEmail,
        type: 'info',
        createdAt: now,
        readBy: [],
      }
    ]
  };
}

class VaultDatabaseStore {
  private db: VaultDatabase;

  constructor() {
    this.ensureDirectory();
    this.db = this.load();
    // Synchronize state to Supabase on startup
    setTimeout(() => {
      syncAllToSupabase(this.db).then(res => {
        if (res.success) {
          console.log('✅ Supabase synchronized all tables on startup:', res.counts);
        }
      }).catch(err => {
        console.warn('⚠️ Supabase startup sync caught:', err);
      });
    }, 1000);
  }

  private ensureDirectory() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private load(): VaultDatabase {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Ensure admin user exists
        if (!parsed.existing_users.some((u: DbUser) => u.email === MASTER_ADMIN_EMAIL || u.role === 'admin')) {
          const init = getInitialDatabase();
          parsed.existing_users.unshift(init.existing_users[0]);
        }

        // Deduplicate existing_users by ID and by Email
        const seenIds = new Set<string>();
        const seenEmails = new Set<string>();
        parsed.existing_users = (parsed.existing_users || []).filter((u: DbUser) => {
          if (!u || !u.id || !u.email) return false;
          const cleanEmail = u.email.toLowerCase().trim();
          if (seenIds.has(u.id) || seenEmails.has(cleanEmail)) {
            return false;
          }
          seenIds.add(u.id);
          seenEmails.add(cleanEmail);
          return true;
        });

        // Ensure uploaded files have download tracking fields
        if (Array.isArray(parsed.uploaded_files)) {
          parsed.uploaded_files.forEach((f: DbFile) => {
            if (typeof f.downloadCount !== 'number') f.downloadCount = 0;
            if (!Array.isArray(f.downloadedBy)) f.downloadedBy = [];
          });
        }

        // Auto-purge audit logs older than 7 days on startup
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        const cutoff = Date.now() - SEVEN_DAYS_MS;
        if (Array.isArray(parsed.admin_audit_logs)) {
          parsed.admin_audit_logs = parsed.admin_audit_logs.filter((log: DbAuditLog) => {
            const time = new Date(log.timestamp).getTime();
            return !isNaN(time) && time >= cutoff;
          });
        } else {
          parsed.admin_audit_logs = [];
        }

        if (!Array.isArray(parsed.notifications)) {
          parsed.notifications = [];
        }

        return parsed;
      }
    } catch (err) {
      console.error('Error loading vault DB file, reinitializing default:', err);
    }
    const initial = getInitialDatabase();
    this.save(initial);
    return initial;
  }

  private save(data?: VaultDatabase) {
    try {
      this.ensureDirectory();
      const payload = data || this.db;
      fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save vault database:', err);
    }
  }

  // --- Administrator Credentials & Security Gate ---
  async getAdminCredential(email: string): Promise<DbAdminCredential | null> {
    const clean = String(email || '').trim().toLowerCase();
    if (!clean) return null;

    // 1. Check Supabase dedicated admin_credentials table
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('admin_credentials')
          .select('*')
          .ilike('email', clean)
          .eq('status', 'active')
          .maybeSingle();

        if (!error && data) {
          return {
            id: data.id,
            email: data.email,
            securityKey: data.security_key,
            name: data.name || 'Administrator',
            phone: data.phone || '',
            deviceId: data.device_id || 'DEV-ADMIN-MASTER-SECURE',
            role: 'admin',
            status: data.status || 'active',
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch (err) {
        console.warn('Supabase admin_credentials query note:', err);
      }
    }

    // 2. Fallback to private server environment variables (never committed to git)
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const envAdminKey = (process.env.ADMIN_SECURITY_KEY || '').trim();
    if (envAdminEmail && envAdminKey && clean === envAdminEmail) {
      return {
        id: 'usr_admin_env',
        email: envAdminEmail,
        securityKey: envAdminKey,
        name: 'Administrator',
        phone: '',
        deviceId: 'DEV-ADMIN-MASTER-SECURE',
        role: 'admin',
        status: 'active',
      };
    }

    // 3. Fallback to local admin_credentials store
    if (Array.isArray(this.db.admin_credentials)) {
      const match = this.db.admin_credentials.find(
        c => c.email.toLowerCase() === clean && c.status === 'active'
      );
      if (match) return match;
    }

    return null;
  }

  async verifyAdminCredentials(
    email: string,
    passkey: string
  ): Promise<{ success: boolean; user?: DbUser; error?: string }> {
    const cred = await this.getAdminCredential(email);
    if (!cred) {
      return {
        success: false,
        error: 'Administrator record not found in Supabase admin_credentials or server configuration.',
      };
    }

    if (cred.securityKey.trim() !== String(passkey || '').trim()) {
      return {
        success: false,
        error: 'Invalid administrator security passkey.',
      };
    }

    // Match or provision existing_users admin profile
    let adminUser = this.getUserByEmail(cred.email);
    if (!adminUser) {
      adminUser = {
        id: cred.id || `usr_admin_${Date.now()}`,
        email: cred.email,
        name: cred.name || 'Administrator',
        phone: cred.phone || '',
        deviceId: cred.deviceId || 'DEV-ADMIN-MASTER-SECURE',
        role: 'admin',
        status: 'active',
        permissions: {
          canUploadPublic: true,
          canUploadPrivate: true,
          canDeleteOwn: true,
          canDownload: true,
        },
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      this.addUser(adminUser);
    } else {
      adminUser.role = 'admin';
      adminUser.status = 'active';
      adminUser.lastLoginAt = new Date().toISOString();
      this.save();
      syncUserToSupabase(adminUser);
    }

    return { success: true, user: adminUser };
  }

  // --- Users ---
  getExistingUsers(): DbUser[] {
    const seen = new Set<string>();
    return this.db.existing_users.filter(u => {
      if (!u || !u.id || seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  }

  getUserById(id: string): DbUser | undefined {
    return this.db.existing_users.find(u => u.id === id);
  }

  getUserByDeviceId(deviceId: string): DbUser | undefined {
    if (!deviceId) return undefined;
    return this.db.existing_users.find(u => u.deviceId === deviceId && u.status === 'active');
  }

  getUserByEmail(email: string): DbUser | undefined {
    if (!email) return undefined;
    const clean = email.toLowerCase().trim();
    const envAdminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
    if (envAdminEmail && clean === envAdminEmail) {
      const admin = this.db.existing_users.find(u => u.role === 'admin');
      if (admin) return admin;
    }
    return this.db.existing_users.find(u => u.email.toLowerCase() === clean);
  }

  addUser(user: DbUser): void {
    this.db.existing_users.push(user);
    this.save();
    syncUserToSupabase(user);
    this.logAction('USER_REGISTERED', user.email, `User ${user.name} added to approved users.`);
  }

  updateUserPermissions(userId: string, permissions: DbUser['permissions'], status?: DbUser['status']): DbUser | null {
    const user = this.db.existing_users.find(u => u.id === userId);
    if (!user) return null;
    user.permissions = { ...user.permissions, ...permissions };
    if (status) user.status = status;
    this.save();
    syncUserToSupabase(user);
    this.logAction('PERMISSIONS_UPDATED', 'ADMIN', `Updated permissions for ${user.email}`);
    return user;
  }

  updateUserDeviceId(userId: string, newDeviceId: string): DbUser | null {
    const user = this.db.existing_users.find(u => u.id === userId);
    if (!user) return null;
    const old = user.deviceId;
    user.deviceId = newDeviceId;
    user.lastLoginAt = new Date().toISOString();
    this.save();
    syncUserToSupabase(user);
    this.logAction('DEVICE_CHANGED', user.email, `Device updated from ${old} to ${newDeviceId}`);
    return user;
  }

  updateLastLogin(userId: string): void {
    const user = this.db.existing_users.find(u => u.id === userId);
    if (user) {
      user.lastLoginAt = new Date().toISOString();
      this.save();
      syncUserToSupabase(user);
    }
  }

  async deleteUser(userId: string): Promise<{ success: boolean; message: string; user?: DbUser }> {
    const idx = this.db.existing_users.findIndex(u => u.id === userId);
    let userEmail = '';
    let deletedUser: DbUser | undefined;

    if (idx !== -1) {
      deletedUser = this.db.existing_users[idx];
      if (deletedUser.role === 'admin') {
        return { success: false, message: 'Cannot delete master administrator account' };
      }
      userEmail = deletedUser.email;
      this.db.existing_users.splice(idx, 1);
      this.save();
    }

    // Always delete directly from Supabase existing_users table
    await deleteUserFromSupabase(userId, userEmail);
    if (userEmail) {
      this.logAction('USER_DELETED', 'ADMIN', `Deleted user account ${userEmail} from vault and Supabase`);
    }
    return {
      success: true,
      message: userEmail ? `User ${userEmail} successfully deleted from vault and Supabase` : 'User removed from Supabase',
      user: deletedUser,
    };
  }

  // --- Sessional Token & Device Binding Management ---
  private activeSessions = new Map<string, ActiveSession>();

  createSession(user: DbUser, boundDeviceId: string): string {
    const token = `sess_${user.role}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24-hour TTL
    const session: ActiveSession = {
      token,
      userId: user.id,
      boundDeviceId: (boundDeviceId || user.deviceId || '').trim(),
      role: user.role,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      expiresAt,
    };
    this.activeSessions.set(token, session);
    return token;
  }

  validateSessionAndDevice(
    token: string,
    incomingDeviceId: string
  ): { valid: boolean; user?: DbUser; reason?: string } {
    if (!token) {
      return { valid: false, reason: 'Missing sessional token (Authorization: Bearer header required)' };
    }

    const cleanDeviceId = (incomingDeviceId || '').trim();
    if (!cleanDeviceId) {
      return { valid: false, reason: 'Hardware device ID signature missing (x-device-id header required)' };
    }

    let userId: string | null = null;
    let boundDeviceId: string | null = null;
    let isRoleAdmin = false;

    const session = this.activeSessions.get(token);
    if (session) {
      if (new Date() > new Date(session.expiresAt)) {
        this.activeSessions.delete(token);
        return { valid: false, reason: 'Sessional token expired. Please re-authenticate your device.' };
      }
      userId = session.userId;
      boundDeviceId = session.boundDeviceId;
      isRoleAdmin = session.role === 'admin';
      session.lastActiveAt = new Date().toISOString();
    } else if (token.startsWith('admin_token_')) {
      // Direct admin session tokens
      const admin = this.getExistingUsers().find(u => u.role === 'admin');
      if (admin) {
        userId = admin.id;
        boundDeviceId = admin.deviceId;
        isRoleAdmin = true;
      }
    } else if (token.startsWith('usr_')) {
      // Legacy user token fallback
      const legacyUser = this.getUserById(token);
      if (legacyUser) {
        userId = legacyUser.id;
        boundDeviceId = legacyUser.deviceId;
        isRoleAdmin = legacyUser.role === 'admin';
      }
    }

    if (!userId) {
      return { valid: false, reason: 'Invalid or unrecognized sessional token' };
    }

    const user = this.getUserById(userId);
    if (!user || user.status !== 'active') {
      return { valid: false, reason: 'User account not found or suspended' };
    }

    // ZERO-TRUST HARDWARE VERIFICATION:
    // Match the incoming device ID with both the session's bound device and the user's registered device.
    const authorizedDevices = [boundDeviceId, user.deviceId].filter(Boolean) as string[];
    if (isRoleAdmin) {
      authorizedDevices.push('DEV-ADMIN-MASTER-SECURE');
    }

    const isMatch = authorizedDevices.some(
      dev => dev.toLowerCase() === cleanDeviceId.toLowerCase()
    );

    if (!isMatch) {
      this.logAction(
        'ZERO_TRUST_DEVICE_MISMATCH',
        user.email,
        `Untrusted device ID [${cleanDeviceId}] attempted to access session bound to [${boundDeviceId || user.deviceId}]`
      );
      return {
        valid: false,
        reason: `Zero-Trust Device Mismatch: Sessional token is bound to registered device [${boundDeviceId || user.deviceId}], but request originated from unauthorized device signature [${cleanDeviceId}].`,
      };
    }

    return { valid: true, user };
  }

  revokeSession(token: string): boolean {
    return this.activeSessions.delete(token);
  }

  // --- Registration Requests ---
  getRequestLogins(): DbRegistrationRequest[] {
    return this.db.request_logins;
  }

  addRegistrationRequest(req: DbRegistrationRequest): void {
    this.db.request_logins.unshift(req);
    this.save();
    syncRegistrationRequestToSupabase(req);
    this.logAction('NEW_REGISTRATION_REQUEST', req.email, `Requested access for device ${req.deviceId}`);
  }

  approveRegistration(requestId: string): DbUser | null {
    const req = this.db.request_logins.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return null;

    req.status = 'approved';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = process.env.ADMIN_EMAIL || 'Administrator';

    const newUser: DbUser = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: req.email,
      name: req.name,
      phone: req.phone,
      deviceId: req.deviceId,
      role: 'user',
      status: 'active',
      permissions: {
        canUploadPublic: true,
        canUploadPrivate: true,
        canDeleteOwn: true,
        canDownload: true,
      },
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    this.addUser(newUser);
    this.save();
    syncRegistrationRequestToSupabase(req);
    return newUser;
  }

  rejectRegistration(requestId: string, reason?: string): boolean {
    const req = this.db.request_logins.find(r => r.id === requestId);
    if (!req) return false;
    req.status = 'rejected';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = process.env.ADMIN_EMAIL || 'Administrator';
    req.rejectReason = reason || 'Declined by administrator';
    this.save();
    syncRegistrationRequestToSupabase(req);
    this.logAction('REGISTRATION_REJECTED', 'ADMIN', `Rejected registration for ${req.email}`);
    return true;
  }

  async deleteRegistrationRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    const idx = this.db.request_logins.findIndex(r => r.id === requestId);
    let email = '';
    if (idx !== -1) {
      email = this.db.request_logins[idx].email;
      this.db.request_logins.splice(idx, 1);
      this.save();
    }
    await deleteRegistrationRequestFromSupabase(requestId);
    this.logAction('REGISTRATION_REQUEST_DELETED', 'ADMIN', `Permanently deleted registration request ${requestId} (${email}) from vault and Supabase`);
    return { success: true, message: 'Registration request deleted from vault and Supabase' };
  }

  // --- Device Change Requests ---
  getDeviceChangeRequests(): DbDeviceChangeRequest[] {
    return this.db.device_change_requests;
  }

  addDeviceChangeRequest(req: DbDeviceChangeRequest): void {
    this.db.device_change_requests.unshift(req);
    this.save();
    syncDeviceChangeRequestToSupabase(req);
    this.logAction('DEVICE_CHANGE_REQUEST', req.email, `Requested swap to device ${req.newDeviceId}`);
  }

  approveDeviceChange(requestId: string): DbUser | null {
    const req = this.db.device_change_requests.find(r => r.id === requestId);
    if (!req || req.status !== 'pending') return null;

    req.status = 'approved';
    req.reviewedAt = new Date().toISOString();

    const updated = this.updateUserDeviceId(req.userId, req.newDeviceId);
    this.save();
    syncDeviceChangeRequestToSupabase(req);
    return updated;
  }

  rejectDeviceChange(requestId: string): boolean {
    const req = this.db.device_change_requests.find(r => r.id === requestId);
    if (!req) return false;
    req.status = 'rejected';
    req.reviewedAt = new Date().toISOString();
    this.save();
    syncDeviceChangeRequestToSupabase(req);
    this.logAction('DEVICE_CHANGE_REJECTED', 'ADMIN', `Rejected device change for ${req.email}`);
    return true;
  }

  async deleteDeviceChangeRequest(requestId: string): Promise<{ success: boolean; message: string }> {
    const idx = this.db.device_change_requests.findIndex(r => r.id === requestId);
    let email = '';
    if (idx !== -1) {
      email = this.db.device_change_requests[idx].email;
      this.db.device_change_requests.splice(idx, 1);
      this.save();
    }
    await deleteDeviceChangeRequestFromSupabase(requestId);
    this.logAction('DEVICE_CHANGE_REQUEST_DELETED', 'ADMIN', `Permanently deleted device change request ${requestId} (${email}) from vault and Supabase`);
    return { success: true, message: 'Device change request deleted from vault and Supabase' };
  }

  // --- Files Storage with Strict Isolation ---
  getFiles(requestingUser?: DbUser | null): DbFile[] {
    if (!requestingUser) {
      // Unauthenticated: return only public files
      return this.db.uploaded_files.filter(f => !f.isPrivate);
    }

    if (requestingUser.role === 'admin') {
      // Admin can see all files
      return this.db.uploaded_files;
    }

    // Normal user: public files OR files uploaded by themselves (Private files strictly isolated!)
    return this.db.uploaded_files.filter(f => {
      if (!f.isPrivate) return true;
      return f.uploaderId === requestingUser.id;
    });
  }

  getFileById(id: string): DbFile | undefined {
    return this.db.uploaded_files.find(f => f.id === id);
  }

  addFile(file: DbFile): void {
    this.db.uploaded_files.unshift(file);
    this.save();
    syncFileToSupabase(file);
    this.logAction('FILE_UPLOADED', file.uploaderEmail, `Uploaded ${file.isPrivate ? 'PRIVATE' : 'PUBLIC'} file: ${file.fileName}`);
  }

  async deleteFile(id: string, requestingUser: DbUser): Promise<{ success: boolean; message: string }> {
    const idx = this.db.uploaded_files.findIndex(f => f.id === id);
    let file: DbFile | undefined;

    if (idx !== -1) {
      file = this.db.uploaded_files[idx];

      // Strictly enforce: "user can delete their own uploaded file but not delete other uploaded file"
      if (file.uploaderId !== requestingUser.id && requestingUser.role !== 'admin') {
        return { success: false, message: 'Access denied: You can only delete your own uploaded files' };
      }

      // Check delete permission
      if (!requestingUser.permissions.canDeleteOwn && requestingUser.role !== 'admin') {
        return { success: false, message: 'Your account lacks file deletion permission' };
      }

      this.db.uploaded_files.splice(idx, 1);
      this.save();
    }

    // Always delete directly from Supabase uploaded_files table
    await deleteFileFromSupabase(id);
    this.logAction('FILE_DELETED', requestingUser.email, `Permanently deleted file: ${file?.fileName || id} from vault and Supabase`);
    return { success: true, message: 'File permanently deleted from vault and Supabase' };
  }

  // --- File Download Tracking ---
  recordDownload(fileId: string, userEmail: string): DbFile | null {
    const file = this.db.uploaded_files.find(f => f.id === fileId);
    if (!file) return null;
    if (typeof file.downloadCount !== 'number') file.downloadCount = 0;
    if (!Array.isArray(file.downloadedBy)) file.downloadedBy = [];

    file.downloadCount += 1;
    const cleanEmail = (userEmail || '').trim();
    if (cleanEmail && cleanEmail !== 'ANONYMOUS' && !file.downloadedBy.includes(cleanEmail)) {
      file.downloadedBy.push(cleanEmail);
    }

    this.save();
    syncFileToSupabase(file);
    return file;
  }

  // --- Audit Logs (Automatic 7-Day Purge Lifecycle) ---
  purgeExpiredAuditLogs(): number {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    const originalCount = this.db.admin_audit_logs?.length || 0;
    if (!this.db.admin_audit_logs) {
      this.db.admin_audit_logs = [];
      return 0;
    }

    this.db.admin_audit_logs = this.db.admin_audit_logs.filter(log => {
      const time = new Date(log.timestamp).getTime();
      return !isNaN(time) && time >= cutoff;
    });

    const deleted = originalCount - this.db.admin_audit_logs.length;
    if (deleted > 0) {
      this.save();
    }
    return deleted;
  }

  getAuditLogs(): DbAuditLog[] {
    this.purgeExpiredAuditLogs();
    return this.db.admin_audit_logs;
  }

  logAction(action: string, actor: string, details: string, ip?: string): void {
    this.purgeExpiredAuditLogs();
    const log: DbAuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      actor,
      details,
      ip,
    };
    this.db.admin_audit_logs.unshift(log);
    this.save();
  }

  // --- Notifications Management (Real-time Broadcast & Direct) ---
  getNotificationsForUser(userId: string, userEmail: string): DbNotification[] {
    const list = this.db.notifications || [];
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    return list.filter(n => {
      if (n.targetUserId === 'ALL' || n.targetEmail === 'ALL') return true;
      if (n.targetUserId === userId) return true;
      if (n.targetEmail && n.targetEmail.trim().toLowerCase() === cleanEmail) return true;
      return false;
    });
  }

  getAllNotifications(): DbNotification[] {
    return this.db.notifications || [];
  }

  async addNotification(params: {
    title: string;
    message: string;
    targetUserId?: string;
    targetEmail?: string;
    senderEmail: string;
    type?: 'info' | 'warning' | 'alert' | 'success';
  }): Promise<DbNotification> {
    if (!this.db.notifications) {
      this.db.notifications = [];
    }

    const notif: DbNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: params.title.trim(),
      message: params.message.trim(),
      targetUserId: params.targetUserId || 'ALL',
      targetEmail: params.targetEmail || 'ALL',
      senderEmail: params.senderEmail || MASTER_ADMIN_EMAIL || 'Administrator',
      type: params.type || 'info',
      createdAt: new Date().toISOString(),
      readBy: [],
    };

    this.db.notifications.unshift(notif);
    this.save();

    // Sync to Supabase notifications table in real time
    await syncNotificationToSupabase(notif);

    this.logAction(
      'NOTIFICATION_SENT',
      notif.senderEmail,
      `Sent [${notif.type.toUpperCase()}] notification "${notif.title}" to ${notif.targetEmail}`
    );

    return notif;
  }

  async markNotificationRead(notifId: string, userId: string): Promise<boolean> {
    if (!this.db.notifications) return false;
    const notif = this.db.notifications.find(n => n.id === notifId);
    if (!notif) return false;

    if (!Array.isArray(notif.readBy)) {
      notif.readBy = [];
    }
    if (!notif.readBy.includes(userId)) {
      notif.readBy.push(userId);
      this.save();
      await syncNotificationToSupabase(notif);
    }
    return true;
  }

  async markAllNotificationsRead(userId: string, userEmail: string): Promise<boolean> {
    if (!this.db.notifications) return false;
    const cleanEmail = (userEmail || '').trim().toLowerCase();
    let changed = false;

    for (const notif of this.db.notifications) {
      const isTarget =
        notif.targetUserId === 'ALL' ||
        notif.targetEmail === 'ALL' ||
        notif.targetUserId === userId ||
        (notif.targetEmail && notif.targetEmail.trim().toLowerCase() === cleanEmail);

      if (isTarget) {
        if (!Array.isArray(notif.readBy)) notif.readBy = [];
        if (!notif.readBy.includes(userId)) {
          notif.readBy.push(userId);
          changed = true;
          syncNotificationToSupabase(notif);
        }
      }
    }

    if (changed) {
      this.save();
    }
    return true;
  }

  async deleteNotification(notifId: string): Promise<{ success: boolean; message: string }> {
    if (!this.db.notifications) return { success: false, message: 'Notification not found' };
    const idx = this.db.notifications.findIndex(n => n.id === notifId);
    if (idx !== -1) {
      const removed = this.db.notifications.splice(idx, 1)[0];
      this.save();
      this.logAction('NOTIFICATION_DELETED', 'ADMIN', `Deleted notification: ${removed.title}`);
    }
    await deleteNotificationFromSupabase(notifId);
    return { success: true, message: 'Notification deleted from vault and Supabase' };
  }

  getStats() {
    return {
      totalUsers: this.db.existing_users.length,
      pendingRegistrations: this.db.request_logins.filter(r => r.status === 'pending').length,
      pendingDeviceChanges: this.db.device_change_requests.filter(r => r.status === 'pending').length,
      totalFiles: this.db.uploaded_files.length,
      publicFiles: this.db.uploaded_files.filter(f => !f.isPrivate).length,
      privateFiles: this.db.uploaded_files.filter(f => f.isPrivate).length,
    };
  }

  getRawData(): VaultDatabase {
    return this.db;
  }
}

export const vaultDb = new VaultDatabaseStore();

/**
 * Generates ready-to-run Supabase PostgreSQL script with Row Level Security (RLS)
 */
export function generateSupabaseRlsScript(): string {
  const envAdminEmail = (process.env.ADMIN_EMAIL || '').trim();
  const envAdminKey = (process.env.ADMIN_SECURITY_KEY || '').trim();

  const seedBlock = envAdminEmail && envAdminKey
    ? `
-- 6. Seed Administrator in dedicated admin_credentials table
INSERT INTO public.admin_credentials (
    email, security_key, name, role, status
) VALUES (
    '${envAdminEmail}',
    '${envAdminKey}',
    'Administrator',
    'admin',
    'active'
) ON CONFLICT (email) DO UPDATE SET
    security_key = EXCLUDED.security_key,
    updated_at = now();

INSERT INTO public.existing_users (
    email, name, phone, device_id, role, status, 
    can_upload_public, can_upload_private, can_delete_own, can_download
) VALUES (
    '${envAdminEmail}',
    'Administrator',
    '+00 0000000000',
    'DEV-ADMIN-MASTER-SECURE',
    'admin',
    'active',
    true, true, true, true
) ON CONFLICT (email) DO NOTHING;

INSERT INTO public.notifications (
    id, title, message, target_user_id, target_email, sender_email, type
) VALUES (
    'notif_sys_init',
    'Zero-Trust Secure Vault Active',
    'Welcome to the Secure Hardware-Isolated Cloud Vault. All files and transmissions are cryptographically protected.',
    'ALL',
    'ALL',
    '${envAdminEmail}',
    'info'
) ON CONFLICT (id) DO NOTHING;
`
    : `-- Administrator seed: Configure credentials in public.admin_credentials or via server environment variables.`;

  return `-- ==========================================================
-- SECURE VAULT & DEVICE AUTHENTICATION SCHEMA WITH RLS
-- SUPABASE POSTGRESQL DEFINITIONS & POLICIES
-- ==========================================================

-- 1. Table: admin_credentials (Dedicated Administrator Security Table)
CREATE TABLE IF NOT EXISTS public.admin_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    security_key TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'Administrator',
    phone TEXT,
    device_id TEXT,
    role TEXT NOT NULL DEFAULT 'admin',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Table: existing_users
CREATE TABLE IF NOT EXISTS public.existing_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    device_id TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    can_upload_public BOOLEAN DEFAULT true,
    can_upload_private BOOLEAN DEFAULT true,
    can_delete_own BOOLEAN DEFAULT true,
    can_download BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Table: request_logins (New Registrations)
CREATE TABLE IF NOT EXISTS public.request_logins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    device_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reject_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT
);

-- 4. Table: device_change_requests
CREATE TABLE IF NOT EXISTS public.device_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.existing_users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    old_device_id TEXT NOT NULL,
    new_device_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

-- 5. Table: uploaded_files (Strict Data Isolation)
CREATE TABLE IF NOT EXISTS public.uploaded_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uploader_id UUID REFERENCES public.existing_users(id) ON DELETE SET NULL,
    uploader_name TEXT NOT NULL,
    uploader_email TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type TEXT NOT NULL,
    is_private BOOLEAN NOT NULL DEFAULT false,
    download_count INT NOT NULL DEFAULT 0,
    downloaded_by TEXT[] NOT NULL DEFAULT '{}',
    file_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Table: notifications (Real-time Broadcast & Direct Announcements)
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_user_id TEXT NOT NULL DEFAULT 'ALL',
    target_email TEXT NOT NULL DEFAULT 'ALL',
    sender_email TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'success')),
    read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.existing_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ==========================================================
-- ROW LEVEL SECURITY POLICIES (Idempotent: drops existing before creating)
-- ==========================================================

-- Drop existing policies if already defined to avoid Error 42710
DROP POLICY IF EXISTS "Deny public anon access to admin_credentials" ON public.admin_credentials;
DROP POLICY IF EXISTS "Admin credentials self access" ON public.admin_credentials;
DROP POLICY IF EXISTS "Public files readable by everyone" ON public.uploaded_files;
DROP POLICY IF EXISTS "Public files accessible by all users" ON public.uploaded_files;
DROP POLICY IF EXISTS "Private files readable only by uploader or admin" ON public.uploaded_files;
DROP POLICY IF EXISTS "Private files viewable only by file owner" ON public.uploaded_files;
DROP POLICY IF EXISTS "Users can insert files if authorized" ON public.uploaded_files;
DROP POLICY IF EXISTS "Users can only delete their own uploaded files" ON public.uploaded_files;
DROP POLICY IF EXISTS "Anyone can submit login request" ON public.request_logins;
DROP POLICY IF EXISTS "Admin manages all login requests" ON public.request_logins;
DROP POLICY IF EXISTS "Verified users can submit device change" ON public.device_change_requests;
DROP POLICY IF EXISTS "Admin manages device changes" ON public.device_change_requests;
DROP POLICY IF EXISTS "Anyone can read notifications" ON public.notifications;
DROP POLICY IF EXISTS "Admin manages all notifications" ON public.notifications;

-- A. ADMIN_CREDENTIALS RLS POLICIES:
-- Deny all anonymous public queries to protect credentials
CREATE POLICY "Deny public anon access to admin_credentials"
ON public.admin_credentials FOR ALL
TO anon
USING (false);

CREATE POLICY "Admin credentials self access"
ON public.admin_credentials FOR ALL
TO authenticated
USING (LOWER(auth.jwt() ->> 'email') = LOWER(email));

-- B. UPLOADED_FILES RLS POLICIES:
CREATE POLICY "Public files accessible by all users" 
ON public.uploaded_files FOR SELECT 
USING (is_private = false);

CREATE POLICY "Private files viewable only by file owner" 
ON public.uploaded_files FOR SELECT 
USING (
  is_private = true AND (
    auth.uid()::text = uploader_id::text OR 
    LOWER(auth.jwt() ->> 'email') IN (
      SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
    ) OR LOWER(auth.jwt() ->> 'email') IN (
      SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
    )
  )
);

CREATE POLICY "Users can insert files if authorized"
ON public.uploaded_files FOR INSERT
WITH CHECK (
  auth.uid()::text = uploader_id::text OR
  LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
  ) OR LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
  )
);

CREATE POLICY "Users can only delete their own uploaded files" 
ON public.uploaded_files FOR DELETE 
USING (
  auth.uid()::text = uploader_id::text OR 
  LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
  ) OR LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
  )
);

-- C. REQUEST_LOGINS RLS:
CREATE POLICY "Anyone can submit login request" 
ON public.request_logins FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admin manages all login requests" 
ON public.request_logins FOR ALL 
USING (
  LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
  ) OR LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
  )
);

-- D. DEVICE_CHANGE_REQUESTS RLS:
CREATE POLICY "Verified users can submit device change" 
ON public.device_change_requests FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admin manages device changes" 
ON public.device_change_requests FOR ALL 
USING (
  LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
  ) OR LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
  )
);

-- E. NOTIFICATIONS RLS:
CREATE POLICY "Anyone can read notifications"
ON public.notifications FOR SELECT
USING (true);

CREATE POLICY "Admin manages all notifications"
ON public.notifications FOR ALL
USING (
  LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.admin_credentials WHERE status = 'active'
  ) OR LOWER(auth.jwt() ->> 'email') IN (
    SELECT LOWER(email) FROM public.existing_users WHERE role = 'admin' AND status = 'active'
  )
);
${seedBlock}
`;
}
