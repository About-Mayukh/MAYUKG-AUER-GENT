/**
 * Utility to mask the middle portion of hardware device IDs.
 * Ensures strict privacy so non-admin users cannot see the complete hardware fingerprint.
 * Only administrators inside the Admin Console can see unrestricted device IDs.
 *
 * Example:
 *   "DEV-88AB42-SECURE001" -> "DEV-88••••••••E001"
 *   "DEV-33FC11-SECURE002" -> "DEV-33••••••••E002"
 */
export function maskDeviceId(deviceId?: string | null): string {
  if (!deviceId) return '';
  const trimmed = deviceId.trim();

  // Short device IDs
  if (trimmed.length <= 8) {
    if (trimmed.length <= 4) return '••••';
    return `${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`;
  }

  // Standard device ID format
  const start = trimmed.slice(0, 6);
  const end = trimmed.slice(-4);
  return `${start}••••••••${end}`;
}
