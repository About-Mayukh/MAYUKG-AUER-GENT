import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  vaultDb,
  MASTER_ADMIN_EMAIL,
  MASTER_ADMIN_KEY,
  generateSupabaseRlsScript,
  getNotificationsSql,
  checkSupabaseStatus,
  syncAllToSupabase,
  syncNotificationsToSupabase,
  syncNotificationToSupabase,
  DbUser,
} from './server/db.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for file transfers (up to 50MB)
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ==========================================
  // REAL-TIME SERVER-SENT EVENTS (SSE) STREAM
  // ==========================================
  type RealtimeEvent = {
    type: 'NOTIFICATION' | 'DATA_SYNC' | 'FILES_UPDATED' | 'USERS_UPDATED' | 'REQUESTS_UPDATED';
    timestamp: string;
    data?: any;
  };

  const sseClients = new Set<Response>();

  function broadcastRealtime(event: RealtimeEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Realtime SSE endpoint for instant live updates across clients
  app.get('/api/realtime/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': keep-alive\n\n');
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
    });
  });

  // Helper auth resolver - strictly checks BOTH Sessional Token AND Hardware Device ID
  function resolveAuthenticatedUser(req: Request): { user: DbUser | null; error?: string; status?: number } {
    const authHeader = req.headers.authorization;
    const deviceIdHeader = ((req.headers['x-device-id'] as string) || '').trim();

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // If only deviceId is present on a protected endpoint, prompt for session
      if (deviceIdHeader) {
        return {
          user: null,
          error: 'Sessional token missing. Active session token required alongside device signature.',
          status: 401,
        };
      }
      return {
        user: null,
        error: 'Authentication required. Authorization Bearer token and x-device-id are mandatory.',
        status: 401,
      };
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return { user: null, error: 'Empty sessional token provided.', status: 401 };
    }

    // Validate sessional token AND hardware device binding simultaneously
    const validation = vaultDb.validateSessionAndDevice(token, deviceIdHeader);
    if (!validation.valid || !validation.user) {
      const isForbidden =
        validation.reason?.includes('Zero-Trust Device Mismatch') ||
        validation.reason?.includes('Hardware device ID signature missing');
      return {
        user: null,
        error: validation.reason || 'Authentication verification failed',
        status: isForbidden ? 403 : 401,
      };
    }

    return { user: validation.user };
  }

  function getRequestUser(req: Request): DbUser | null {
    const resolved = resolveAuthenticatedUser(req);
    return resolved.user;
  }

  // Admin auth middleware (Dual Token + Device verification)
  function requireAdmin(req: Request, res: Response, next: NextFunction) {
    const resolved = resolveAuthenticatedUser(req);
    if (!resolved.user) {
      res.status(resolved.status || 401).json({ error: resolved.error || 'Administrative authentication required' });
      return;
    }
    if (resolved.user.role !== 'admin') {
      res.status(403).json({ error: 'Zero-Trust Security Violation: Administrative privileges required' });
      return;
    }
    (req as any).user = resolved.user;
    next();
  }

  // Authenticated user middleware (Dual Token + Device verification)
  function requireAuth(req: Request, res: Response, next: NextFunction) {
    const resolved = resolveAuthenticatedUser(req);
    if (!resolved.user) {
      res.status(resolved.status || 401).json({ error: resolved.error || 'Authentication required' });
      return;
    }
    (req as any).user = resolved.user;
    next();
  }

  // ==========================================
  // AUTHENTICATION & DEVICE ACCESS ENDPOINTS
  // ==========================================

  // 1. Device ID verification
  app.post('/api/auth/check-device', (req: Request, res: Response) => {
    const { deviceId } = req.body;
    if (!deviceId) {
      res.status(400).json({ error: 'Device ID is required' });
      return;
    }

    // Check if device matches an active approved user
    const existingUser = vaultDb.getUserByDeviceId(deviceId);
    if (existingUser) {
      const sessionToken = vaultDb.createSession(existingUser, deviceId);
      vaultDb.updateLastLogin(existingUser.id);
      vaultDb.logAction('DEVICE_LOGIN_SUCCESS', existingUser.email, `Automatic device login on ${deviceId}`, req.ip);
      
      res.json({
        authenticated: true,
        user: existingUser,
        token: sessionToken,
        message: 'Device verified. Hardware-bound sessional token generated.',
      });
      return;
    }

    // Check if there is a pending registration request for this device
    const pendingReq = vaultDb.getRequestLogins().find(
      r => r.deviceId === deviceId && r.status === 'pending'
    );
    if (pendingReq) {
      res.json({
        authenticated: false,
        pendingRegistration: true,
        requestDetails: {
          email: pendingReq.email,
          name: pendingReq.name,
          createdAt: pendingReq.createdAt,
        },
        message: 'Registration request pending administrator approval.',
      });
      return;
    }

    // Check if there is a pending device change request with this new device ID
    const pendingChange = vaultDb.getDeviceChangeRequests().find(
      d => d.newDeviceId === deviceId && d.status === 'pending'
    );
    if (pendingChange) {
      res.json({
        authenticated: false,
        pendingDeviceChange: true,
        requestDetails: {
          email: pendingChange.email,
          name: pendingChange.name,
          createdAt: pendingChange.createdAt,
        },
        message: 'Device change request pending administrator approval.',
      });
      return;
    }

    // Device not recognized
    res.json({
      authenticated: false,
      notRegistered: true,
      deviceId,
      message: 'Unrecognized device signature. Request authorization or submit device change.',
    });
  });

  // 2. Submit new user registration request
  app.post('/api/auth/register-request', (req: Request, res: Response) => {
    const { email, name, phone, deviceId } = req.body;

    if (!email || !name || !phone || !deviceId) {
      res.status(400).json({ error: 'All fields (Gmail, Name, Phone, and Device ID) are required' });
      return;
    }

    // Basic email sanity check
    if (!email.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid Gmail address' });
      return;
    }

    // Check if this email is already an approved active user
    const existingUser = vaultDb.getUserByEmail(email);
    if (existingUser) {
      res.status(409).json({
        error: 'This account already exists. Please use the "Change Device ID" option to link your new device.',
        isExistingUser: true,
      });
      return;
    }

    // Check if there is already an active pending request for this email
    const existingPending = vaultDb.getRequestLogins().find(
      r => r.email.toLowerCase() === email.toLowerCase() && r.status === 'pending'
    );
    if (existingPending) {
      res.status(409).json({
        error: 'A registration request for this Gmail ID is already awaiting admin approval.',
      });
      return;
    }

    const newRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      email: email.trim().toLowerCase(),
      name: name.trim(),
      phone: phone.trim(),
      deviceId,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    vaultDb.addRegistrationRequest(newRequest);
    broadcastRealtime({ type: 'REQUESTS_UPDATED', timestamp: new Date().toISOString(), data: { type: 'registration' } });

    res.status(201).json({
      success: true,
      requestId: newRequest.id,
      message: 'Your registration request has been submitted for administrator review.',
    });
  });

  // 3. Submit device change request for existing user
  app.post('/api/auth/device-change-request', (req: Request, res: Response) => {
    const { email, name, phone, newDeviceId } = req.body;

    if (!email || !phone || !newDeviceId) {
      res.status(400).json({ error: 'Gmail, Phone number, and current Device ID are required' });
      return;
    }

    const user = vaultDb.getUserByEmail(email);
    if (!user) {
      res.status(404).json({
        error: 'No registered user found with this Gmail ID. Please submit a New User Request first.',
      });
      return;
    }

    // Verify phone or name match to prevent unauthorized device hijack requests
    const cleanDbPhone = user.phone.replace(/[^0-9]/g, '');
    const cleanInputPhone = phone.replace(/[^0-9]/g, '');
    const phoneMatches = cleanDbPhone.length > 5 && cleanInputPhone.includes(cleanDbPhone.slice(-6));

    if (!phoneMatches && user.name.toLowerCase() !== (name || '').trim().toLowerCase()) {
      res.status(400).json({
        error: 'The provided verification details do not match the registered user records.',
      });
      return;
    }

    // Check if there is already a pending change request
    const existingPending = vaultDb.getDeviceChangeRequests().find(
      d => d.userId === user.id && d.status === 'pending'
    );
    if (existingPending) {
      res.status(409).json({
        error: 'A device change request is already pending administrator approval for this account.',
      });
      return;
    }

    const changeReq = {
      id: `dcr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      oldDeviceId: user.deviceId,
      newDeviceId,
      status: 'pending' as const,
      createdAt: new Date().toISOString(),
    };

    vaultDb.addDeviceChangeRequest(changeReq);
    broadcastRealtime({ type: 'REQUESTS_UPDATED', timestamp: new Date().toISOString(), data: { type: 'device_change' } });

    res.status(201).json({
      success: true,
      requestId: changeReq.id,
      message: 'Device change request submitted. Once approved by the administrator, your device will be authorized.',
    });
  });

  // 4. Current user session check
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getRequestUser(req);
    if (!user) {
      res.status(401).json({ authenticated: false });
      return;
    }
    res.json({ authenticated: true, user });
  });

  // 5. Admin stealth login - Authenticated dynamically against Supabase admin_credentials table
  app.post('/api/admin/login', async (req: Request, res: Response) => {
    const { email, securityKey } = req.body;

    if (!email || !securityKey) {
      res.status(400).json({ error: 'Email and security passkey are required' });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanKey = String(securityKey).trim();

    const verification = await vaultDb.verifyAdminCredentials(cleanEmail, cleanKey);
    if (!verification.success || !verification.user) {
      vaultDb.logAction('FAILED_ADMIN_LOGIN', cleanEmail, 'Invalid admin credentials attempt', req.ip);
      res.status(401).json({
        error: verification.error || 'Invalid administrator credentials. Please verify email and security passkey.',
      });
      return;
    }

    const adminUser = verification.user;
    const deviceIdHeader = ((req.headers['x-device-id'] as string) || adminUser.deviceId || 'DEV-ADMIN-MASTER-SECURE').trim();
    const token = vaultDb.createSession(adminUser, deviceIdHeader);

    vaultDb.logAction('ADMIN_LOGIN_SUCCESS', cleanEmail, `Administrator logged in to console from device ${deviceIdHeader}`, req.ip);

    res.json({
      success: true,
      token,
      user: adminUser,
      message: 'Administrator hardware-bound session established',
    });
  });

  // Session verification diagnostic & logout
  app.get('/api/auth/session-info', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const deviceId = ((req.headers['x-device-id'] as string) || '').trim();

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        checkingDevice: true,
        checkingSessionToken: true,
        authenticated: false,
        reason: 'Missing sessional token (Authorization: Bearer header required)',
      });
      return;
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const validation = vaultDb.validateSessionAndDevice(token, deviceId);
    res.json({
      dualValidationActive: true,
      checkingDevice: true,
      checkingSessionToken: true,
      authenticated: validation.valid,
      user: validation.user
        ? {
            email: validation.user.email,
            role: validation.user.role,
            boundDeviceId: validation.user.deviceId,
          }
        : null,
      deviceSignatureReceived: deviceId,
      sessionTokenReceived: token ? `${token.substring(0, 12)}...` : null,
      error: validation.reason,
    });
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      vaultDb.revokeSession(token);
    }
    res.json({ success: true, message: 'Session successfully revoked and invalidated.' });
  });

  // ==========================================
  // FILE STORAGE & ISOLATION ENDPOINTS
  // ==========================================

  // 1. List files (Strict Privacy Enforcement & Hardware Dual-Validation)
  app.get('/api/files', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    // vaultDb.getFiles automatically ensures non-admin users only receive public files + their own private files
    const files = vaultDb.getFiles(user);

    // Map out the large base64 payload from list view for network speed
    const fileList = files.map(f => ({
      id: f.id,
      uploaderId: f.uploaderId,
      uploaderName: f.uploaderName,
      uploaderEmail: f.uploaderEmail,
      fileName: f.fileName,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      isPrivate: f.isPrivate,
      createdAt: f.createdAt,
      downloadCount: f.downloadCount ?? 0,
      downloadedBy: f.downloadedBy ?? [],
      isOwner: user ? user.id === f.uploaderId || user.role === 'admin' : false,
    }));

    res.json({
      files: fileList,
      totalCount: fileList.length,
      user: user ? { id: user.id, email: user.email, name: user.name, permissions: user.permissions } : null,
    });
  });

  // 2. Upload file (Private or Public)
  app.post('/api/files/upload', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const { fileName, fileSize, mimeType, isPrivate, dataUrl } = req.body;

    if (!fileName || !dataUrl) {
      res.status(400).json({ error: 'File name and file content are required' });
      return;
    }

    // Permission checks
    if (isPrivate && !user.permissions.canUploadPrivate && user.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to upload private files' });
      return;
    }

    if (!isPrivate && !user.permissions.canUploadPublic && user.role !== 'admin') {
      res.status(403).json({ error: 'You do not have permission to upload public files' });
      return;
    }

    const newFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      uploaderId: user.id,
      uploaderName: user.name,
      uploaderEmail: user.email,
      fileName: fileName.trim(),
      fileSize: Number(fileSize) || 0,
      mimeType: mimeType || 'application/octet-stream',
      isPrivate: Boolean(isPrivate),
      createdAt: new Date().toISOString(),
      dataUrl,
      downloadCount: 0,
      downloadedBy: [],
    };

    vaultDb.addFile(newFile);
    broadcastRealtime({ type: 'FILES_UPDATED', timestamp: new Date().toISOString(), data: { action: 'upload', fileId: newFile.id } });

    res.status(201).json({
      success: true,
      file: {
        id: newFile.id,
        fileName: newFile.fileName,
        fileSize: newFile.fileSize,
        mimeType: newFile.mimeType,
        isPrivate: newFile.isPrivate,
        createdAt: newFile.createdAt,
        uploaderName: newFile.uploaderName,
        downloadCount: 0,
        downloadedBy: [],
      },
      message: `${newFile.isPrivate ? 'Private' : 'Public'} file uploaded successfully`,
    });
  });

  // 3. Download file (Admin can download every file including private and public)
  app.get('/api/files/:id/download', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const file = vaultDb.getFileById(req.params.id);

    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    // Verify privacy isolation:
    // Admin has master permission to download ALL files (private and public)
    if (file.isPrivate) {
      if (!user) {
        res.status(403).json({ error: 'Private file: Authentication required' });
        return;
      }
      if (user.id !== file.uploaderId && user.role !== 'admin') {
        res.status(403).json({ error: 'Access denied: This file is strictly private to its owner' });
        return;
      }
    }

    // Check user download permission (admin bypassed)
    if (user && !user.permissions.canDownload && user.role !== 'admin') {
      res.status(403).json({ error: 'Your account download privileges have been disabled by administrator' });
      return;
    }

    const userIdentifier = user ? user.email : 'ANONYMOUS';
    // Record download count and unique downloaders
    const updatedFile = vaultDb.recordDownload(file.id, userIdentifier);
    vaultDb.logAction('FILE_DOWNLOADED', userIdentifier, `Downloaded ${file.fileName} (${file.isPrivate ? 'Private' : 'Public'})`, req.ip);

    res.json({
      id: file.id,
      fileName: file.fileName,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
      dataUrl: file.dataUrl,
      downloadCount: updatedFile?.downloadCount ?? (file.downloadCount ?? 1),
      downloadedBy: updatedFile?.downloadedBy ?? (file.downloadedBy ?? [userIdentifier]),
    });
  });

  // 4. Delete file (Owner only or Admin) - Deletes from vault and Supabase uploaded_files table
  app.delete('/api/files/:id', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const result = await vaultDb.deleteFile(req.params.id, user);

    if (!result.success) {
      res.status(403).json({ error: result.message });
      return;
    }

    broadcastRealtime({ type: 'FILES_UPDATED', timestamp: new Date().toISOString(), data: { action: 'delete', fileId: req.params.id } });
    res.json({ success: true, message: result.message });
  });

  // ==========================================
  // NOTIFICATIONS (USER & ADMIN)
  // ==========================================

  // 1. Get notifications for current user
  app.get('/api/notifications', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const list = vaultDb.getNotificationsForUser(user.id, user.email).map(n => ({
      ...n,
      isRead: (n.readBy || []).includes(user.id),
    }));
    res.json({ notifications: list });
  });

  // 2. Mark specific notification as read
  app.post('/api/notifications/:id/read', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const success = await vaultDb.markNotificationRead(req.params.id, user.id);
    if (success) {
      broadcastRealtime({ type: 'NOTIFICATION', timestamp: new Date().toISOString() });
    }
    res.json({ success });
  });

  // 3. Mark all notifications as read
  app.post('/api/notifications/read-all', requireAuth, async (req: Request, res: Response) => {
    const user = (req as any).user as DbUser;
    const success = await vaultDb.markAllNotificationsRead(user.id, user.email);
    if (success) {
      broadcastRealtime({ type: 'NOTIFICATION', timestamp: new Date().toISOString() });
    }
    res.json({ success });
  });

  // 4. Admin: Get all notifications
  app.get('/api/admin/notifications', requireAdmin, (_req: Request, res: Response) => {
    const all = vaultDb.getAllNotifications();
    res.json({ notifications: all });
  });

  // 5. Admin: Send notification
  app.post('/api/admin/notifications', requireAdmin, async (req: Request, res: Response) => {
    const adminUser = (req as any).user as DbUser;
    const { title, message, targetUserId, targetEmail, type } = req.body;

    if (!title || !message) {
      res.status(400).json({ error: 'Title and message are required' });
      return;
    }

    const notif = await vaultDb.addNotification({
      title,
      message,
      targetUserId: targetUserId || 'ALL',
      targetEmail: targetEmail || 'ALL',
      senderEmail: adminUser.email,
      type: type || 'info',
    });

    // Instant real-time broadcast to all users
    broadcastRealtime({
      type: 'NOTIFICATION',
      timestamp: new Date().toISOString(),
      data: notif,
    });

    res.json({ success: true, notification: notif });
  });

  // 6. Admin: Delete notification (vault and Supabase)
  app.delete('/api/admin/notifications/:id', requireAdmin, async (req: Request, res: Response) => {
    const result = await vaultDb.deleteNotification(req.params.id);
    broadcastRealtime({ type: 'NOTIFICATION', timestamp: new Date().toISOString() });
    res.json(result);
  });

  // ==========================================
  // ADMINISTRATIVE PORTAL & CONTROL ENDPOINTS
  // ==========================================

  // 1. Dashboard summary data
  app.get('/api/admin/dashboard-data', requireAdmin, (req: Request, res: Response) => {
    const stats = vaultDb.getStats();
    const existingUsers = vaultDb.getExistingUsers();
    const requestLogins = vaultDb.getRequestLogins();
    const deviceChangeRequests = vaultDb.getDeviceChangeRequests();
    const allFiles = vaultDb.getFiles((req as any).user as DbUser).map(f => ({
      id: f.id,
      fileName: f.fileName,
      fileSize: f.fileSize,
      mimeType: f.mimeType,
      isPrivate: f.isPrivate,
      uploaderId: f.uploaderId,
      uploaderName: f.uploaderName,
      uploaderEmail: f.uploaderEmail,
      createdAt: f.createdAt,
      downloadCount: f.downloadCount ?? 0,
      downloadedBy: f.downloadedBy ?? [],
    }));
    const auditLogs = vaultDb.getAuditLogs();

    res.json({
      stats,
      existingUsers,
      requestLogins,
      deviceChangeRequests,
      allFiles,
      auditLogs,
      adminEmail: (req as any).adminUser?.email || (req as any).user?.email || process.env.ADMIN_EMAIL || 'Administrator',
    });
  });

  // 2. Approve new user registration
  app.post('/api/admin/requests/approve-registration', requireAdmin, (req: Request, res: Response) => {
    const { requestId } = req.body;
    if (!requestId) {
      res.status(400).json({ error: 'Request ID required' });
      return;
    }

    const user = vaultDb.approveRegistration(requestId);
    if (!user) {
      res.status(404).json({ error: 'Pending registration request not found' });
      return;
    }

    broadcastRealtime({ type: 'DATA_SYNC', timestamp: new Date().toISOString() });
    res.json({
      success: true,
      message: `User ${user.email} approved successfully. Device is now authorized.`,
      user,
    });
  });

  // 3. Reject new user registration
  app.post('/api/admin/requests/reject-registration', requireAdmin, (req: Request, res: Response) => {
    const { requestId, reason } = req.body;
    const success = vaultDb.rejectRegistration(requestId, reason);
    if (!success) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    broadcastRealtime({ type: 'DATA_SYNC', timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'Registration request rejected' });
  });

  // 4. Approve device change request
  app.post('/api/admin/requests/approve-device-change', requireAdmin, (req: Request, res: Response) => {
    const { requestId } = req.body;
    if (!requestId) {
      res.status(400).json({ error: 'Request ID required' });
      return;
    }

    const updated = vaultDb.approveDeviceChange(requestId);
    if (!updated) {
      res.status(404).json({ error: 'Pending device change request not found' });
      return;
    }

    broadcastRealtime({ type: 'DATA_SYNC', timestamp: new Date().toISOString() });
    res.json({
      success: true,
      message: `Device updated for user ${updated.email}. New device ID is authorized.`,
      user: updated,
    });
  });

  // 5. Reject device change request
  app.post('/api/admin/requests/reject-device-change', requireAdmin, (req: Request, res: Response) => {
    const { requestId } = req.body;
    const success = vaultDb.rejectDeviceChange(requestId);
    if (!success) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    broadcastRealtime({ type: 'DATA_SYNC', timestamp: new Date().toISOString() });
    res.json({ success: true, message: 'Device change request rejected' });
  });

  // 6. Granular permission management
  app.put('/api/admin/users/:id/permissions', requireAdmin, (req: Request, res: Response) => {
    const { permissions, status } = req.body;
    const updated = vaultDb.updateUserPermissions(req.params.id, permissions, status);
    if (!updated) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    broadcastRealtime({ type: 'USERS_UPDATED', timestamp: new Date().toISOString() });
    res.json({ success: true, user: updated, message: 'Permissions updated successfully' });
  });

  // 7. Delete user (Removes from both vault and Supabase existing_users table)
  app.delete('/api/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const result = await vaultDb.deleteUser(req.params.id);
    if (!result.success) {
      res.status(400).json({ error: result.message || 'Cannot delete user or user not found' });
      return;
    }
    broadcastRealtime({ type: 'USERS_UPDATED', timestamp: new Date().toISOString() });
    res.json({ success: true, message: result.message });
  });

  // 8. Delete registration request (Removes from both vault and Supabase request_logins table)
  app.delete('/api/admin/requests/registration/:id', requireAdmin, async (req: Request, res: Response) => {
    const result = await vaultDb.deleteRegistrationRequest(req.params.id);
    broadcastRealtime({ type: 'REQUESTS_UPDATED', timestamp: new Date().toISOString() });
    res.json({ success: true, message: result.message });
  });

  // 9. Delete device change request (Removes from both vault and Supabase device_change_requests table)
  app.delete('/api/admin/requests/device-change/:id', requireAdmin, async (req: Request, res: Response) => {
    const result = await vaultDb.deleteDeviceChangeRequest(req.params.id);
    broadcastRealtime({ type: 'REQUESTS_UPDATED', timestamp: new Date().toISOString() });
    res.json({ success: true, message: result.message });
  });

  // 8. Supabase SQL & RLS Script export
  app.get('/api/admin/supabase-sql', requireAdmin, (req: Request, res: Response) => {
    const sql = generateSupabaseRlsScript();
    res.setHeader('Content-Type', 'text/plain');
    res.send(sql);
  });

  // 9. Live Supabase status check
  app.get('/api/admin/supabase-status', requireAdmin, async (req: Request, res: Response) => {
    const status = await checkSupabaseStatus();
    res.json(status);
  });

  // 10. Manual trigger to synchronize all database tables to Supabase
  app.post('/api/admin/sync-supabase', requireAdmin, async (req: Request, res: Response) => {
    const data = vaultDb.getRawData();
    const result = await syncAllToSupabase(data);
    vaultDb.logAction('SUPABASE_SYNC', 'ADMIN', `Full database sync triggered to Supabase. Result: ${result.success ? 'SUCCESS' : 'FAIL'}`);
    res.json(result);
  });

  // 11. Supabase Notifications Table SQL script
  app.get('/api/admin/supabase-notifications-sql', requireAdmin, (req: Request, res: Response) => {
    const sql = getNotificationsSql();
    res.setHeader('Content-Type', 'text/plain');
    res.send(sql);
  });

  // 12. Manual trigger to synchronize notifications to Supabase notifications table
  app.post('/api/admin/supabase-sync-notifications', requireAdmin, async (req: Request, res: Response) => {
    const result = await syncNotificationsToSupabase();
    vaultDb.logAction('SUPABASE_NOTIFICATIONS_SYNC', 'ADMIN', `Notifications sync to Supabase. Result: ${result.success ? 'SUCCESS' : 'FAIL'}, count: ${result.count}`);
    res.json(result);
  });

  // 13. Test save notification to Supabase notifications table
  app.post('/api/admin/supabase-test-notification', requireAdmin, async (req: Request, res: Response) => {
    const { title, message, type } = req.body || {};
    const notif = await vaultDb.addNotification({
      title: title || 'Test Notification',
      message: message || 'Verification of Supabase public.notifications table integration.',
      targetUserId: 'ALL',
      targetEmail: 'ALL',
      senderEmail: (req as any).adminUser?.email || MASTER_ADMIN_EMAIL || 'admin@securevault.internal',
      type: type || 'info',
    });

    // Save directly to Supabase and verify response
    const supabaseResult = await syncNotificationToSupabase(notif);

    // Broadcast in real-time
    broadcastRealtime({
      type: 'NOTIFICATION',
      timestamp: new Date().toISOString(),
      data: notif,
    });

    res.json({
      success: supabaseResult.success,
      notification: notif,
      supabaseResult,
    });
  });

  // ==========================================
  // VITE DEV MIDDLEWARE & PRODUCTION STATIC
  // ==========================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Automated 7-day audit log retention policy background task
  // Periodically purges records older than 7 days
  vaultDb.purgeExpiredAuditLogs();
  setInterval(() => {
    const purged = vaultDb.purgeExpiredAuditLogs();
    if (purged > 0) {
      console.log(`[Auto-Purge] Automatically expunged ${purged} audit log entries older than 7 days`);
    }
  }, 60 * 60 * 1000); // Hourly check

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Secure Vault & Device Access Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
});
