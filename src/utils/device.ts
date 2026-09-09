/**
 * Device ID detection and cryptographic fingerprinting
 * Generates an immutable, persistent device signature stored in local storage
 * and combined with browser environment signatures.
 */

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getHardwareSignature(): string {
  if (typeof window === 'undefined') return 'SRV-INIT';
  const nav = window.navigator;
  const screen = window.screen;
  
  const rawParts = [
    nav.userAgent || '',
    nav.language || '',
    screen.width + 'x' + screen.height,
    screen.colorDepth || '',
    new Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    nav.hardwareConcurrency || '',
  ].join('|');

  // Simple numeric hash
  let hash = 0;
  for (let i = 0; i < rawParts.length; i++) {
    const char = rawParts.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').toUpperCase().substring(0, 6);
}

export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'DEVICE-UNKNOWN';
  
  const STORAGE_KEY = 'sec_vault_device_signature_v1';
  let deviceId = localStorage.getItem(STORAGE_KEY);
  
  if (!deviceId || !deviceId.startsWith('DEV-')) {
    const hwSig = getHardwareSignature();
    const uniqueUuid = generateUUID().replace(/-/g, '').substring(0, 10).toUpperCase();
    deviceId = `DEV-${hwSig}-${uniqueUuid}`;
    localStorage.setItem(STORAGE_KEY, deviceId);
  }
  
  return deviceId;
}

export function getDeviceDetails() {
  if (typeof window === 'undefined') {
    return { platform: 'Unknown', browser: 'Unknown', screen: 'Unknown' };
  }
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  let os = 'Unknown OS';
  if (ua.includes('Win')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return {
    os,
    browser,
    resolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
