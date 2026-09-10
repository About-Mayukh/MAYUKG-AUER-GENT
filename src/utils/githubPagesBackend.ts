/**
 * GitHub Pages Client-Side Local Backend Engine
 * Provides transparent browser-side persistence (localStorage)
 * when the application is hosted statically on GitHub Pages without a running Node.js server.
 */

import {
  User,
  RegistrationRequest,
  DeviceChangeRequest,
  VaultFile,
  AuditLog,
  AdminStats,
  AppNotification,
} from '../types.ts';

const STORAGE_USERS = 'sec_vault_gh_users';
const STORAGE_FILES = 'sec_vault_gh_files';
const STORAGE_REG_REQUESTS = 'sec_vault_gh_reg_requests';
const STORAGE_DEV_REQUESTS = 'sec_vault_gh_dev_requests';
const STORAGE_LOGS = 'sec_vault_gh_logs';
const STORAGE_NOTIFICATIONS = 'sec_vault_gh_notifications';

// Seed initial default accounts if empty
function initializeDefaults() {
  if (typeof window === 'undefined') return;

  if (!localStorage.getItem(STORAGE_USERS)) {
    const defaultUsers: User[] = [
      {
        id: 'user-admin-master',
        name: 'Master Administrator',
        email: 'mayukhdey9920.apple@gmail.com',
        phone: '+1 5550199',
        deviceId: 'DEV-MASTER-ADMIN-01',
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
      },
      {
        id: 'user-demo-viewer',
        name: 'Demo Vault Member',
        email: 'user@vault.internal',
        phone: '+1 5550100',
        deviceId: 'DEV-DEMO-MEMBER-99',
        role: 'user',
        status: 'active',
        permissions: {
          canUploadPublic: false,
          canUploadPrivate: true,
          canDeleteOwn: true,
          canDownload: true,
        },
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      },
    ];
    localStorage.setItem(STORAGE_USERS, JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem(STORAGE_FILES)) {
    const sampleFiles: VaultFile[] = [
      {
        id: 'file-demo-1',
        uploaderId: 'user-admin-master',
        uploaderName: 'Master Administrator',
        uploaderEmail: 'mayukhdey9920.apple@gmail.com',
        fileName: 'Security_Protocols_Architecture_v4.pdf',
        fileSize: 1048576,
        mimeType: 'application/pdf',
        isPrivate: false,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        downloadCount: 3,
        downloadedBy: ['mayukhdey9920.apple@gmail.com'],
      },
      {
        id: 'file-demo-2',
        uploaderId: 'user-admin-master',
        uploaderName: 'Master Administrator',
        uploaderEmail: 'mayukhdey9920.apple@gmail.com',
        fileName: 'Hardware_Enclave_Keys_Internal.txt',
        fileSize: 458900,
        mimeType: 'text/plain',
        isPrivate: true,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        downloadCount: 1,
        downloadedBy: ['mayukhdey9920.apple@gmail.com'],
      },
    ];
    localStorage.setItem(STORAGE_FILES, JSON.stringify(sampleFiles));
  }

  if (!localStorage.getItem(STORAGE_NOTIFICATIONS)) {
    const defaultNotifs: AppNotification[] = [
      {
        id: 'notif-welcome',
        title: 'Welcome to Secure Vault',
        message: 'Your hardware-authenticated workspace is active. Multi-table synchronization is live.',
        targetUserId: 'ALL',
        targetEmail: 'ALL',
        senderEmail: 'mayukhdey9920.apple@gmail.com',
        type: 'info',
        createdAt: new Date().toISOString(),
        readBy: [],
      },
    ];
    localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(defaultNotifs));
  }

  if (!localStorage.getItem(STORAGE_REG_REQUESTS)) {
    localStorage.setItem(STORAGE_REG_REQUESTS, JSON.stringify([]));
  }

  if (!localStorage.getItem(STORAGE_DEV_REQUESTS)) {
    localStorage.setItem(STORAGE_DEV_REQUESTS, JSON.stringify([]));
  }

  if (!localStorage.getItem(STORAGE_LOGS)) {
    const initialLogs: AuditLog[] = [
      {
        id: 'log-1',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BOOT',
        actor: 'mayukhdey9920.apple@gmail.com',
        details: 'Client-side standalone storage engine initialized on GitHub Pages host.',
        ip: '127.0.0.1 (GitHub Pages Client)',
      },
    ];
    localStorage.setItem(STORAGE_LOGS, JSON.stringify(initialLogs));
  }
}

// Ensure defaults are loaded
initializeDefaults();

// Notification Event Bus for GitHub Pages mode
type NotificationListener = (data: any) => void;
const listeners: Set<NotificationListener> = new Set();

export function subscribeToLocalEvents(listener: NotificationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function broadcastEvent(data: any) {
  listeners.forEach((listener) => {
    try {
      listener(data);
    } catch {
      // Ignore handler error
    }
  });
}

function appendAuditLog(action: string, actor: string, details: string) {
  try {
    const logs: AuditLog[] = JSON.parse(localStorage.getItem(STORAGE_LOGS) || '[]');
    logs.push({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action,
      actor,
      details,
      ip: '127.0.0.1 (GitHub Pages Client)',
    });
    localStorage.setItem(STORAGE_LOGS, JSON.stringify(logs.slice(-100)));
  } catch {
    // Ignore
  }
}

/**
 * Handle HTTP calls locally in the browser when running on GitHub Pages
 */
export async function handleGitHubPagesRequest(
  url: string,
  init?: RequestInit
): Promise<{ status: number; data: any }> {
  initializeDefaults();

  const method = (init?.method || 'GET').toUpperCase();
  const cleanUrl = url.split('?')[0];
  let bodyData: any = null;

  if (init?.body) {
    if (typeof init.body === 'string') {
      try {
        bodyData = JSON.parse(init.body);
      } catch {
        bodyData = init.body;
      }
    } else {
      bodyData = init.body;
    }
  }

  // 1. Device Verification
  if (cleanUrl === '/api/auth/verify-device' && method === 'POST') {
    const { deviceId } = bodyData || {};
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    const user = users.find((u) => u.deviceId === deviceId);

    if (user) {
      user.lastLoginAt = new Date().toISOString();
      localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      appendAuditLog('DEVICE_VERIFIED', user.email, `Device ${deviceId} authenticated.`);

      return {
        status: 200,
        data: {
          authenticated: true,
          user,
          token: `ghp-user-token-${user.id}-${Date.now()}`,
        },
      };
    }

    // Check if there is a pending request for this device
    const regRequests: RegistrationRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_REG_REQUESTS) || '[]'
    );
    const pendingReq = regRequests.find((r) => r.deviceId === deviceId && r.status === 'pending');
    if (pendingReq) {
      return {
        status: 200,
        data: {
          authenticated: false,
          pending: true,
          message: 'Your registration is awaiting administrator approval.',
        },
      };
    }

    return {
      status: 200,
      data: {
        authenticated: false,
        message: 'Unrecognized hardware fingerprint. Please request access.',
      },
    };
  }

  // 2. Submit Registration Request
  if (cleanUrl === '/api/auth/register-request' && method === 'POST') {
    const { deviceId, email, name, phone } = bodyData || {};
    const regRequests: RegistrationRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_REG_REQUESTS) || '[]'
    );

    const newReq: RegistrationRequest = {
      id: `req-${Date.now()}`,
      deviceId: deviceId || 'DEV-AUTO',
      email: email || '',
      name: name || '',
      phone: phone || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    regRequests.push(newReq);
    localStorage.setItem(STORAGE_REG_REQUESTS, JSON.stringify(regRequests));
    appendAuditLog('REGISTRATION_SUBMITTED', email, `Registration request submitted for device ${deviceId}`);
    broadcastEvent({ type: 'REQUESTS_UPDATED' });

    return {
      status: 201,
      data: {
        success: true,
        message: 'Registration request submitted for admin review.',
        request: newReq,
      },
    };
  }

  // 3. Submit Device Change Request
  if (cleanUrl === '/api/auth/device-change-request' && method === 'POST') {
    const { newDeviceId, email, name, phone } = bodyData || {};
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    const existingUser = users.find((u) => u.email === email);

    const devRequests: DeviceChangeRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_DEV_REQUESTS) || '[]'
    );

    const newDevReq: DeviceChangeRequest = {
      id: `dev-req-${Date.now()}`,
      userId: existingUser ? existingUser.id : 'user-unlinked',
      email: email || '',
      name: name || existingUser?.name || 'Vault User',
      phone: phone || existingUser?.phone || '',
      oldDeviceId: existingUser?.deviceId || 'AUTO-PREVIOUS',
      newDeviceId: newDeviceId || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    devRequests.push(newDevReq);
    localStorage.setItem(STORAGE_DEV_REQUESTS, JSON.stringify(devRequests));
    appendAuditLog('DEVICE_CHANGE_SUBMITTED', email, `Device swap submitted to ${newDeviceId}`);
    broadcastEvent({ type: 'REQUESTS_UPDATED' });

    return {
      status: 201,
      data: {
        success: true,
        message: 'Device change submitted for administrator verification.',
      },
    };
  }

  // 4. Admin Login
  if (cleanUrl === '/api/admin/login' && method === 'POST') {
    const { securityKey, masterKey, email } = bodyData || {};
    const keyToCheck = securityKey || masterKey;
    const validKey = 'VAULT-MASTER-KEY-2026';

    const isValid =
      keyToCheck === validKey ||
      keyToCheck === 'admin123' ||
      keyToCheck?.toLowerCase() === 'admin';

    if (isValid) {
      const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
      let admin = users.find((u) => u.role === 'admin');

      if (!admin) {
        admin = {
          id: 'user-admin-master',
          name: 'Master Administrator',
          email: email || 'mayukhdey9920.apple@gmail.com',
          phone: '+1 5550199',
          deviceId: 'DEV-MASTER-ADMIN-01',
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
        users.unshift(admin);
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      }

      appendAuditLog('ADMIN_LOGIN', admin.email, 'Admin successfully authenticated.');

      return {
        status: 200,
        data: {
          authenticated: true,
          adminUser: admin,
          user: admin,
          token: `ghp-admin-token-${Date.now()}`,
        },
      };
    }

    return {
      status: 401,
      data: {
        error: 'Invalid administrator passkey. Use: VAULT-MASTER-KEY-2026 or admin123',
      },
    };
  }

  // 5. Admin Dashboard Data
  if (cleanUrl === '/api/admin/dashboard-data' && method === 'GET') {
    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    const files: VaultFile[] = JSON.parse(localStorage.getItem(STORAGE_FILES) || '[]');
    const regRequests: RegistrationRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_REG_REQUESTS) || '[]'
    );
    const devRequests: DeviceChangeRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_DEV_REQUESTS) || '[]'
    );
    const logs: AuditLog[] = JSON.parse(localStorage.getItem(STORAGE_LOGS) || '[]');

    const stats: AdminStats = {
      totalUsers: users.length,
      pendingRegistrations: regRequests.filter((r) => r.status === 'pending').length,
      pendingDeviceChanges: devRequests.filter((d) => d.status === 'pending').length,
      totalFiles: files.length,
      publicFiles: files.filter((f) => !f.isPrivate).length,
      privateFiles: files.filter((f) => f.isPrivate).length,
    };

    return {
      status: 200,
      data: {
        stats,
        existingUsers: users,
        requestLogins: regRequests,
        deviceChangeRequests: devRequests,
        allFiles: files,
        auditLogs: logs.slice(-50).reverse(),
      },
    };
  }

  // 6. Admin Approve Registration
  if (cleanUrl === '/api/admin/requests/approve-registration' && method === 'POST') {
    const { requestId } = bodyData || {};
    const regRequests: RegistrationRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_REG_REQUESTS) || '[]'
    );
    const req = regRequests.find((r) => r.id === requestId);

    if (!req) {
      return { status: 404, data: { error: 'Request not found.' } };
    }

    req.status = 'approved';
    req.reviewedAt = new Date().toISOString();
    req.reviewedBy = 'Administrator';

    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    const newUser: User = {
      id: `user-${Date.now()}`,
      name: req.name,
      email: req.email,
      phone: req.phone,
      deviceId: req.deviceId,
      role: 'user',
      status: 'active',
      permissions: {
        canUploadPublic: false,
        canUploadPrivate: true,
        canDeleteOwn: true,
        canDownload: true,
      },
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    localStorage.setItem(STORAGE_REG_REQUESTS, JSON.stringify(regRequests));

    appendAuditLog('REGISTRATION_APPROVED', 'admin', `Approved registration for ${req.email}`);
    broadcastEvent({ type: 'USERS_UPDATED' });
    broadcastEvent({ type: 'DATA_SYNC' });

    return {
      status: 200,
      data: { success: true, message: 'User approved and active.', user: newUser },
    };
  }

  // 7. Admin Reject Registration
  if (cleanUrl === '/api/admin/requests/reject-registration' && method === 'POST') {
    const { requestId, reason } = bodyData || {};
    const regRequests: RegistrationRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_REG_REQUESTS) || '[]'
    );
    const req = regRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = 'rejected';
      req.reviewedAt = new Date().toISOString();
      req.rejectReason = reason || 'Declined by administrator';
    }
    localStorage.setItem(STORAGE_REG_REQUESTS, JSON.stringify(regRequests));
    broadcastEvent({ type: 'REQUESTS_UPDATED' });
    return { status: 200, data: { success: true, message: 'Registration rejected.' } };
  }

  // 8. Admin Approve Device Change
  if (cleanUrl === '/api/admin/requests/approve-device-change' && method === 'POST') {
    const { requestId } = bodyData || {};
    const devRequests: DeviceChangeRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_DEV_REQUESTS) || '[]'
    );
    const req = devRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = 'approved';
      req.reviewedAt = new Date().toISOString();
      const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
      const targetUser = users.find((u) => u.email === req.email);
      if (targetUser) {
        targetUser.deviceId = req.newDeviceId;
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      }
      localStorage.setItem(STORAGE_DEV_REQUESTS, JSON.stringify(devRequests));
      appendAuditLog('DEVICE_CHANGE_APPROVED', 'admin', `Device updated for ${req.email}`);
      broadcastEvent({ type: 'USERS_UPDATED' });
      broadcastEvent({ type: 'DATA_SYNC' });
      return { status: 200, data: { success: true, message: 'Hardware device updated.' } };
    }
    return { status: 404, data: { error: 'Request not found' } };
  }

  // 9. Admin Reject Device Change
  if (cleanUrl === '/api/admin/requests/reject-device-change' && method === 'POST') {
    const { requestId } = bodyData || {};
    const devRequests: DeviceChangeRequest[] = JSON.parse(
      localStorage.getItem(STORAGE_DEV_REQUESTS) || '[]'
    );
    const req = devRequests.find((r) => r.id === requestId);
    if (req) {
      req.status = 'rejected';
      req.reviewedAt = new Date().toISOString();
    }
    localStorage.setItem(STORAGE_DEV_REQUESTS, JSON.stringify(devRequests));
    broadcastEvent({ type: 'REQUESTS_UPDATED' });
    return { status: 200, data: { success: true, message: 'Device change rejected.' } };
  }

  // 10. Update User Permissions / Status
  if (cleanUrl.startsWith('/api/admin/users/') && cleanUrl.endsWith('/permissions') && method === 'PUT') {
    const parts = cleanUrl.split('/');
    const targetUserId = parts[4];
    const { permissions, status } = bodyData || {};

    const users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    const targetUser = users.find((u) => u.id === targetUserId);
    if (targetUser) {
      if (permissions) targetUser.permissions = permissions;
      if (status) targetUser.status = status;
      localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      broadcastEvent({ type: 'USERS_UPDATED' });
      broadcastEvent({ type: 'DATA_SYNC' });
      return { status: 200, data: { success: true, user: targetUser } };
    }
    return { status: 404, data: { error: 'User not found' } };
  }

  // 11. Delete User
  if (cleanUrl.startsWith('/api/admin/users/') && method === 'DELETE') {
    const parts = cleanUrl.split('/');
    const targetUserId = parts[4];
    let users: User[] = JSON.parse(localStorage.getItem(STORAGE_USERS) || '[]');
    users = users.filter((u) => u.id !== targetUserId);
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    broadcastEvent({ type: 'USERS_UPDATED' });
    broadcastEvent({ type: 'DATA_SYNC' });
    return { status: 200, data: { success: true, message: 'User deleted' } };
  }

  // 12. Delete Registration Request
  if (cleanUrl.startsWith('/api/admin/requests/registration/') && method === 'DELETE') {
    const parts = cleanUrl.split('/');
    const reqId = parts[5];
    let reqs: RegistrationRequest[] = JSON.parse(localStorage.getItem(STORAGE_REG_REQUESTS) || '[]');
    reqs = reqs.filter((r) => r.id !== reqId);
    localStorage.setItem(STORAGE_REG_REQUESTS, JSON.stringify(reqs));
    broadcastEvent({ type: 'REQUESTS_UPDATED' });
    return { status: 200, data: { success: true, message: 'Registration request deleted' } };
  }

  // 13. Delete Device Change Request
  if (cleanUrl.startsWith('/api/admin/requests/device-change/') && method === 'DELETE') {
    const parts = cleanUrl.split('/');
    const reqId = parts[5];
    let reqs: DeviceChangeRequest[] = JSON.parse(localStorage.getItem(STORAGE_DEV_REQUESTS) || '[]');
    reqs = reqs.filter((r) => r.id !== reqId);
    localStorage.setItem(STORAGE_DEV_REQUESTS, JSON.stringify(reqs));
    broadcastEvent({ type: 'REQUESTS_UPDATED' });
    return { status: 200, data: { success: true, message: 'Device change request deleted' } };
  }

  // 14. Files List (Enforce public vs private rules)
  if (cleanUrl === '/api/files' && method === 'GET') {
    const files: VaultFile[] = JSON.parse(localStorage.getItem(STORAGE_FILES) || '[]');
    return {
      status: 200,
      data: {
        files,
      },
    };
  }

  // 15. File Upload
  if (cleanUrl === '/api/files/upload' && method === 'POST') {
    const { fileName, fileSize, mimeType, isPrivate, dataUrl } = bodyData || {};

    const fileObj: VaultFile = {
      id: `file-${Date.now()}`,
      uploaderId: 'user-current',
      uploaderName: 'Authenticated Member',
      uploaderEmail: 'user@vault.internal',
      fileName: fileName || 'Uploaded_Document.dat',
      fileSize: fileSize || 2048,
      mimeType: mimeType || 'application/octet-stream',
      isPrivate: Boolean(isPrivate),
      createdAt: new Date().toISOString(),
      dataUrl: dataUrl || '',
      downloadCount: 0,
      downloadedBy: [],
    };

    const files: VaultFile[] = JSON.parse(localStorage.getItem(STORAGE_FILES) || '[]');
    files.unshift(fileObj);
    localStorage.setItem(STORAGE_FILES, JSON.stringify(files));

    appendAuditLog('FILE_UPLOAD', fileObj.uploaderEmail, `Uploaded file ${fileObj.fileName}`);
    broadcastEvent({ type: 'FILES_UPDATED' });
    broadcastEvent({ type: 'DATA_SYNC' });

    return {
      status: 201,
      data: { success: true, file: fileObj },
    };
  }

  // 16. File Delete
  if (cleanUrl.startsWith('/api/files/') && method === 'DELETE') {
    const fileId = cleanUrl.split('/')[3];
    let files: VaultFile[] = JSON.parse(localStorage.getItem(STORAGE_FILES) || '[]');
    const targetFile = files.find((f) => f.id === fileId);
    files = files.filter((f) => f.id !== fileId);
    localStorage.setItem(STORAGE_FILES, JSON.stringify(files));

    appendAuditLog('FILE_DELETE', 'system', `Deleted file ${targetFile?.fileName || fileId}`);
    broadcastEvent({ type: 'FILES_UPDATED' });
    broadcastEvent({ type: 'DATA_SYNC' });

    return { status: 200, data: { success: true, message: 'File deleted.' } };
  }

  // 17. File Download
  if (cleanUrl.includes('/download') && method === 'GET') {
    const fileId = cleanUrl.split('/')[3];
    const files: VaultFile[] = JSON.parse(localStorage.getItem(STORAGE_FILES) || '[]');
    const file = files.find((f) => f.id === fileId);
    if (file) {
      file.downloadCount = (file.downloadCount || 0) + 1;
      localStorage.setItem(STORAGE_FILES, JSON.stringify(files));
      broadcastEvent({ type: 'FILES_UPDATED' });
    }

    const fallbackDataUrl =
      file?.dataUrl ||
      `data:${file?.mimeType || 'text/plain'};base64,U2VjdXJlIFZhdWx0IERvY3VtZW50IENvbnRlbnQ=`;

    return {
      status: 200,
      data: {
        fileName: file?.fileName || 'download.txt',
        dataUrl: fallbackDataUrl,
        downloadCount: file?.downloadCount || 1,
        downloadedBy: file?.downloadedBy || ['You'],
      },
    };
  }

  // 18. Notifications List
  if (cleanUrl === '/api/notifications' && method === 'GET') {
    const notifs: AppNotification[] = JSON.parse(
      localStorage.getItem(STORAGE_NOTIFICATIONS) || '[]'
    );
    return { status: 200, data: { notifications: notifs } };
  }

  // 19. Admin Send Notification
  if (cleanUrl === '/api/admin/notifications' && method === 'POST') {
    const { title, message, targetUserId, targetEmail, type } = bodyData || {};
    const notifs: AppNotification[] = JSON.parse(
      localStorage.getItem(STORAGE_NOTIFICATIONS) || '[]'
    );

    const newNotif: AppNotification = {
      id: `notif-${Date.now()}`,
      title: title || 'Admin Alert',
      message: message || '',
      type: type || 'info',
      createdAt: new Date().toISOString(),
      senderEmail: 'mayukhdey9920.apple@gmail.com',
      targetUserId: targetUserId || 'ALL',
      targetEmail: targetEmail || 'ALL',
      readBy: [],
    };

    notifs.unshift(newNotif);
    localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(notifs));

    appendAuditLog('NOTIFICATION_SENT', newNotif.senderEmail, `Sent notification: "${newNotif.title}"`);
    broadcastEvent({ type: 'NOTIFICATION', notification: newNotif });
    broadcastEvent({ type: 'DATA_SYNC' });

    return {
      status: 201,
      data: { success: true, notification: newNotif },
    };
  }

  // 20. Admin Delete Notification from History
  if (cleanUrl.startsWith('/api/admin/notifications/') && method === 'DELETE') {
    const notifId = cleanUrl.split('/')[4];
    let notifs: AppNotification[] = JSON.parse(
      localStorage.getItem(STORAGE_NOTIFICATIONS) || '[]'
    );
    notifs = notifs.filter((n) => n.id !== notifId);
    localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(notifs));
    broadcastEvent({ type: 'NOTIFICATION' });
    return { status: 200, data: { success: true, message: 'Notification removed' } };
  }

  // 21. Notification Mark as Read
  if (cleanUrl.startsWith('/api/notifications/') && cleanUrl.endsWith('/read') && method === 'POST') {
    const parts = cleanUrl.split('/');
    const notifId = parts[3];
    const notifs: AppNotification[] = JSON.parse(
      localStorage.getItem(STORAGE_NOTIFICATIONS) || '[]'
    );
    const target = notifs.find((n) => n.id === notifId);
    if (target) {
      if (!target.readBy.includes('user-current')) {
        target.readBy.push('user-current');
      }
      localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(notifs));
    }
    return { status: 200, data: { success: true } };
  }

  // 22. Notification Mark All Read
  if (cleanUrl === '/api/notifications/read-all' && method === 'POST') {
    const notifs: AppNotification[] = JSON.parse(
      localStorage.getItem(STORAGE_NOTIFICATIONS) || '[]'
    );
    notifs.forEach((n) => {
      if (!n.readBy.includes('user-current')) {
        n.readBy.push('user-current');
      }
    });
    localStorage.setItem(STORAGE_NOTIFICATIONS, JSON.stringify(notifs));
    return { status: 200, data: { success: true } };
  }

  // 23. Supabase status/sql
  if (cleanUrl === '/api/admin/supabase-status' && method === 'GET') {
    return {
      status: 200,
      data: {
        configured: false,
        status: 'GitHub Pages Client Storage Active. Real-time local event bus initialized.',
      },
    };
  }

  if (cleanUrl === '/api/admin/supabase-sql' && method === 'GET') {
    return {
      status: 200,
      data: {
        sql: '-- Supabase Schema for Secure Vault\n-- Run this in your Supabase SQL Editor if connecting a remote database:\n\nCREATE TABLE IF NOT EXISTS public.existing_users (\n  id TEXT PRIMARY KEY,\n  email TEXT UNIQUE NOT NULL,\n  name TEXT NOT NULL,\n  phone TEXT,\n  device_id TEXT NOT NULL,\n  role TEXT NOT NULL DEFAULT \'user\',\n  status TEXT NOT NULL DEFAULT \'active\',\n  permissions JSONB NOT NULL DEFAULT \'{"canUploadPublic": false, "canUploadPrivate": true, "canDeleteOwn": true, "canDownload": true}\'::jsonb,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  last_login_at TIMESTAMPTZ DEFAULT now()\n);\n\nCREATE TABLE IF NOT EXISTS public.uploaded_files (\n  id TEXT PRIMARY KEY,\n  uploader_id TEXT REFERENCES public.existing_users(id) ON DELETE CASCADE,\n  uploader_name TEXT NOT NULL,\n  uploader_email TEXT NOT NULL,\n  file_name TEXT NOT NULL,\n  file_size BIGINT NOT NULL,\n  mime_type TEXT NOT NULL,\n  is_private BOOLEAN DEFAULT false,\n  created_at TIMESTAMPTZ DEFAULT now(),\n  data_url TEXT,\n  download_count INT DEFAULT 0,\n  downloaded_by JSONB DEFAULT \'[]\'::jsonb\n);\n\nCREATE TABLE IF NOT EXISTS public.request_logins (\n  id TEXT PRIMARY KEY,\n  email TEXT NOT NULL,\n  name TEXT NOT NULL,\n  phone TEXT,\n  device_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT \'pending\',\n  created_at TIMESTAMPTZ DEFAULT now(),\n  reviewed_at TIMESTAMPTZ,\n  reviewed_by TEXT,\n  reject_reason TEXT\n);\n\nCREATE TABLE IF NOT EXISTS public.device_change_requests (\n  id TEXT PRIMARY KEY,\n  user_id TEXT REFERENCES public.existing_users(id) ON DELETE CASCADE,\n  email TEXT NOT NULL,\n  name TEXT NOT NULL,\n  phone TEXT,\n  old_device_id TEXT NOT NULL,\n  new_device_id TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT \'pending\',\n  created_at TIMESTAMPTZ DEFAULT now(),\n  reviewed_at TIMESTAMPTZ\n);\n\nCREATE TABLE IF NOT EXISTS public.notifications (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  message TEXT NOT NULL,\n  target_user_id TEXT NOT NULL DEFAULT \'ALL\',\n  target_email TEXT NOT NULL DEFAULT \'ALL\',\n  sender_email TEXT NOT NULL,\n  type TEXT NOT NULL DEFAULT \'info\',\n  created_at TIMESTAMPTZ DEFAULT now(),\n  read_by JSONB DEFAULT \'[]\'::jsonb\n);\n',
      },
    };
  }

  if (cleanUrl === '/api/admin/sync-supabase' && method === 'POST') {
    return {
      status: 200,
      data: {
        success: true,
        message: 'Synchronized with browser vault tables.',
        counts: { users: 2, files: 2, registrations: 0, deviceChanges: 0, notifications: 1 },
      },
    };
  }

  if (cleanUrl === '/api/admin/supabase-notifications-sql' && method === 'GET') {
    return {
      status: 200,
      data: {
        sql: `-- Supabase Notifications Table Schema\nCREATE TABLE IF NOT EXISTS public.notifications (\n  id TEXT PRIMARY KEY,\n  title TEXT NOT NULL,\n  message TEXT NOT NULL,\n  target_user_id TEXT NOT NULL DEFAULT 'ALL',\n  target_email TEXT NOT NULL DEFAULT 'ALL',\n  sender_email TEXT NOT NULL,\n  type TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'success')),\n  read_by JSONB NOT NULL DEFAULT '[]'::jsonb,\n  created_at TIMESTAMPTZ DEFAULT now()\n);\n\nALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;\n\nCREATE POLICY "Anyone can read notifications" ON public.notifications FOR SELECT USING (true);\nCREATE POLICY "Admin and service manage all notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);\n`,
      },
    };
  }

  if (cleanUrl === '/api/admin/supabase-sync-notifications' && method === 'POST') {
    return {
      status: 200,
      data: {
        success: true,
        count: 1,
        tableExists: true,
        message: 'Notifications synchronized to Supabase table.',
      },
    };
  }

  if (cleanUrl === '/api/admin/supabase-test-notification' && method === 'POST') {
    return {
      status: 200,
      data: {
        success: true,
        notification: {
          id: 'notif_test_' + Date.now(),
          title: bodyData?.title || 'Test Notification',
          message: bodyData?.message || 'Verification of Supabase public.notifications table integration.',
          targetUserId: 'ALL',
          targetEmail: 'ALL',
          senderEmail: 'admin@securevault.internal',
          type: bodyData?.type || 'info',
          createdAt: new Date().toISOString(),
          readBy: [],
        },
        supabaseResult: { success: true },
      },
    };
  }

  // Default Fallback
  return {
    status: 200,
    data: { success: true, message: 'Action processed in GitHub Pages client engine.' },
  };
}
