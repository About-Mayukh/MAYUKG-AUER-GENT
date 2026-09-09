export interface UserPermissions {
  canUploadPublic: boolean;
  canUploadPrivate: boolean;
  canDeleteOwn: boolean;
  canDownload: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  deviceId: string;
  role: 'user' | 'admin';
  status: 'active' | 'suspended';
  permissions: UserPermissions;
  createdAt: string;
  lastLoginAt: string;
}

export interface RegistrationRequest {
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

export interface DeviceChangeRequest {
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
}

export interface VaultFile {
  id: string;
  uploaderId: string;
  uploaderName: string;
  uploaderEmail: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  isPrivate: boolean;
  createdAt: string;
  dataUrl?: string;
  downloadCount?: number;
  downloadedBy?: string[];
}

export interface AdminStats {
  totalUsers: number;
  pendingRegistrations: number;
  pendingDeviceChanges: number;
  totalFiles: number;
  publicFiles: number;
  privateFiles: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  details: string;
  ip?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  targetUserId: string; // 'ALL' or specific user ID
  targetEmail: string;  // 'ALL' or specific user email
  senderEmail: string;
  type: 'info' | 'warning' | 'alert' | 'success';
  createdAt: string;
  readBy: string[];     // User IDs who read this notification
  isRead?: boolean;     // Evaluated for the current viewing user
}
