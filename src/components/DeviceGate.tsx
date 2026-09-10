import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Cpu,
  Lock,
  Smartphone,
  Mail,
  User as UserIcon,
  Phone,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Radio,
  UserCheck,
  Pause,
  Play,
  Zap,
  EyeOff,
} from 'lucide-react';
import { getOrCreateDeviceId, getDeviceDetails } from '../utils/device.ts';
import { maskDeviceId } from '../utils/deviceMask.ts';
import { COUNTRY_CODES } from './CountryCodes.ts';
import { AdminLoginModal } from './AdminLoginModal.tsx';
import { User } from '../types.ts';
import { apiFetch } from '../utils/api.ts';

interface DeviceGateProps {
  onAuthenticated: (user: User, token: string) => void;
  onOpenAdminDirectly?: (adminUser: User, token: string) => void;
}

export const DeviceGate: React.FC<DeviceGateProps> = ({
  onAuthenticated,
  onOpenAdminDirectly,
}) => {
  // Auto-Detect Countdown & Verification State (3-second timer with Pause/Resume)
  const [countdown, setCountdown] = useState<number>(3);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(true);
  const [checking, setChecking] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceDetails, setDeviceDetails] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'new-request' | 'change-device'>('new-request');

  // Request Form States
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Status & Notification
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingState, setPendingState] = useState<{
    type: 'registration' | 'device_change';
    details: { email: string; name: string; createdAt: string };
  } | null>(null);

  // Stealth Admin Modal State
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

  // Initial Device ID detection
  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);
    setDeviceDetails(getDeviceDetails());
  }, []);

  // 3-Second Auto-Detect Countdown Timer with Pause and Resume capability
  useEffect(() => {
    if (!isCountingDown || isPaused) return;

    if (countdown <= 0) {
      setIsCountingDown(false);
      const currentId = deviceId || getOrCreateDeviceId();
      checkDeviceStatus(currentId);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isCountingDown, isPaused, countdown, deviceId]);

  const handleTogglePause = () => {
    setIsPaused(prev => !prev);
  };

  const handleImmediateCheck = () => {
    setIsCountingDown(false);
    setIsPaused(false);
    setCountdown(0);
    const currentId = deviceId || getOrCreateDeviceId();
    checkDeviceStatus(currentId);
  };

  const handleRestartCountdown = () => {
    setCountdown(3);
    setIsPaused(false);
    setIsCountingDown(true);
    setChecking(false);
    setErrorMsg(null);
  };

  const checkDeviceStatus = async (targetDeviceId: string) => {
    setChecking(true);
    setIsCountingDown(false);
    setErrorMsg(null);

    try {
      const res = await apiFetch('/api/auth/check-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: targetDeviceId }),
      });

      const data = await res.json();

      if (data.authenticated && data.user) {
        // Automatic login triggered!
        onAuthenticated(data.user, data.token || data.user.id);
        return;
      }

      if (data.pendingRegistration) {
        setPendingState({
          type: 'registration',
          details: data.requestDetails || { email: '', name: '', createdAt: new Date().toISOString() },
        });
      } else if (data.pendingDeviceChange) {
        setPendingState({
          type: 'device_change',
          details: data.requestDetails || { email: '', name: '', createdAt: new Date().toISOString() },
        });
      } else {
        setPendingState(null);
      }
    } catch (err: any) {
      console.error('Device check error:', err);
    } finally {
      setChecking(false);
    }
  };

  // Submit New Registration Request
  const handleNewRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !name || !phoneNumber) {
      setErrorMsg('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    const fullPhone = `${countryCode} ${phoneNumber.trim()}`;

    try {
      const res = await apiFetch('/api/auth/register-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          phone: fullPhone,
          deviceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.isExistingUser) {
          setErrorMsg(data.error);
          setActiveTab('change-device');
        } else {
          setErrorMsg(data.error || 'Failed to submit registration request');
        }
        return;
      }

      setSuccessMsg('Registration request submitted! Awaiting administrator approval.');
      setPendingState({
        type: 'registration',
        details: { email, name, createdAt: new Date().toISOString() },
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Network connection issue');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Device Change Request
  const handleDeviceChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !phoneNumber) {
      setErrorMsg('Please provide your registered Gmail and phone number.');
      return;
    }

    setSubmitting(true);
    const fullPhone = `${countryCode} ${phoneNumber.trim()}`;

    try {
      const res = await apiFetch('/api/auth/device-change-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          phone: fullPhone,
          newDeviceId: deviceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to submit device change request');
        return;
      }

      setSuccessMsg('Device change request submitted! Once approved by the administrator, this device will be linked.');
      setPendingState({
        type: 'device_change',
        details: { email, name: name || 'User', createdAt: new Date().toISOString() },
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Network connection issue');
    } finally {
      setSubmitting(false);
    }
  };

  // Keyboard shortcut listener: Ctrl+Shift+A or Cmd+Shift+A to trigger Admin Login
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        setIsAdminModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div
      id="device-gate-container"
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between relative selection:bg-amber-500 selection:text-black font-sans"
    >
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-72 bg-gradient-to-b from-amber-500/5 via-blue-500/5 to-transparent blur-3xl pointer-events-none" />

      {/* Top Brand Header */}
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between border-b border-zinc-800/80 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-amber-400 shadow-sm shadow-amber-500/10">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">
              VAULT ACCESS CONTROL
            </h1>
            <p className="text-[11px] text-zinc-400">Device-Bound Hardware Authentication</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
            <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
            <span>RLS Protected</span>
          </span>

          {/* Quick Header Admin Access */}
          <button
            id="header-admin-login-btn"
            onClick={() => setIsAdminModalOpen(true)}
            title="Administrator Login (or press Ctrl+Shift+A)"
            className="py-1 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-amber-500/50 text-zinc-400 hover:text-amber-400 text-xs font-mono flex items-center gap-1.5 transition cursor-pointer"
          >
            <Lock className="w-3 h-3 text-amber-500" />
            <span>Admin Portal</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl mx-auto px-4 py-8 sm:py-12 z-10 flex-1 flex flex-col justify-center">
        {isCountingDown ? (
          /* 3-Second Auto-Detect Countdown State with Pause Button */
          <div
            id="device-countdown-state"
            className="bg-zinc-900/95 border border-zinc-800 rounded-2xl p-8 text-center max-w-md mx-auto shadow-2xl backdrop-blur-md"
          >
            {/* Visual Animated Countdown Ring */}
            <div className="relative w-24 h-24 mx-auto mb-5 flex items-center justify-center">
              <div
                className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
                  isPaused
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-amber-500/60 bg-amber-500/10 animate-pulse'
                }`}
              />
              <div className="flex flex-col items-center justify-center">
                <span
                  className={`font-mono text-3xl font-bold transition-all ${
                    isPaused ? 'text-amber-300' : 'text-amber-400 scale-105'
                  }`}
                >
                  {countdown}s
                </span>
                <span className="text-[9px] uppercase tracking-wider font-semibold text-zinc-400 mt-0.5">
                  {isPaused ? 'PAUSED' : 'AUTO DETECT'}
                </span>
              </div>
            </div>

            <h2 className="text-base font-semibold text-zinc-100 mb-1">
              {isPaused ? 'Auto-Detect Countdown Paused' : 'Auto-Detecting Hardware Device'}
            </h2>
            <p className="text-xs text-zinc-400 mb-4 leading-relaxed">
              {isPaused
                ? `Auto-detection paused at ${countdown}s. Resume countdown or verify immediately.`
                : `Scanning hardware signature. Automatically querying authentication in ${countdown}s...`}
            </p>

            {/* 3-Segment Visual Step Indicator */}
            <div className="grid grid-cols-3 gap-2 mb-5 max-w-[200px] mx-auto">
              <div
                className={`h-1.5 rounded-full transition-colors duration-300 ${
                  countdown >= 1 ? 'bg-amber-400' : 'bg-zinc-800'
                }`}
              />
              <div
                className={`h-1.5 rounded-full transition-colors duration-300 ${
                  countdown >= 2 ? 'bg-amber-400' : 'bg-zinc-800'
                }`}
              />
              <div
                className={`h-1.5 rounded-full transition-colors duration-300 ${
                  countdown >= 3 ? 'bg-amber-400' : 'bg-zinc-800'
                }`}
              />
            </div>

            {/* Masked Device Signature Preview */}
            <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-left mb-6">
              <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                <span>Hardware Signature:</span>
                <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5 text-amber-500" /> Middle Masked (Admin Only)
                </span>
              </div>
              <div className="font-mono text-xs text-amber-400 tracking-wider break-all">
                {maskDeviceId(deviceId) || 'Acquiring hardware token...'}
              </div>
            </div>

            {/* Controls: Pause / Resume + Verify Now */}
            <div className="flex items-center justify-center gap-2.5">
              <button
                id="countdown-pause-btn"
                type="button"
                onClick={handleTogglePause}
                className={`py-2.5 px-4 rounded-lg text-xs font-medium border flex items-center gap-2 transition cursor-pointer ${
                  isPaused
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
              >
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>Resume ({countdown}s)</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Pause ({countdown}s)</span>
                  </>
                )}
              </button>

              <button
                id="verify-immediately-btn"
                type="button"
                onClick={handleImmediateCheck}
                className="py-2.5 px-4 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/10"
              >
                <Zap className="w-3.5 h-3.5 fill-zinc-950" />
                <span>Verify Now</span>
              </button>
            </div>
          </div>
        ) : checking ? (
          /* Loading & Hardware Verification State */
          <div
            id="device-scanning-state"
            className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 text-center max-w-md mx-auto shadow-xl"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 animate-pulse">
              <Cpu className="w-8 h-8" />
            </div>
            <h2 className="text-base font-medium text-zinc-100 mb-1">Verifying Device Signature</h2>
            <p className="text-xs text-zinc-400 mb-4">
              Querying hardware fingerprint and security permissions...
            </p>
            <div className="font-mono text-xs text-amber-400/90 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800 break-all">
              {maskDeviceId(deviceId) || 'Querying hardware token...'}
            </div>
          </div>
        ) : pendingState ? (
          /* Pending Admin Approval State */
          <div
            id="pending-approval-card"
            className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 text-center max-w-lg mx-auto shadow-xl"
          >
            <div className="w-14 h-14 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
              <Clock className="w-7 h-7 animate-spin duration-1000" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-1">
              {pendingState.type === 'registration'
                ? 'Registration Request Pending'
                : 'Device Change Request Pending'}
            </h2>
            <p className="text-xs text-zinc-400 mb-6">
              Your request for this device has been sent to the Master Administrator. Once approved,
              re-checking will automatically log you in.
            </p>

            <div className="bg-zinc-950 border border-zinc-800/90 rounded-xl p-4 text-left space-y-2 mb-6 text-xs font-mono">
              <div className="flex justify-between border-b border-zinc-800/60 pb-1.5 text-zinc-400">
                <span>Account:</span>
                <span className="text-zinc-200">{pendingState.details.email || email || 'Registered User'}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/60 pb-1.5 text-zinc-400">
                <span>Device Fingerprint:</span>
                <span className="text-amber-400 font-mono text-[11px] truncate max-w-[200px]">
                  {maskDeviceId(deviceId)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Approval Status:</span>
                <span className="text-amber-400 font-semibold uppercase">Pending Admin Review</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                id="recheck-status-btn"
                onClick={handleRestartCountdown}
                className="py-2.5 px-5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-xs rounded-lg transition flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Re-Check Approval Status</span>
              </button>

              <button
                id="submit-another-btn"
                onClick={() => setPendingState(null)}
                className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition cursor-pointer"
              >
                Change Details
              </button>
            </div>
          </div>
        ) : (
          /* Two-Option Access Request Portal */
          <div
            id="device-auth-portal"
            className="bg-zinc-900/90 border border-zinc-800/90 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-md"
          >
            {/* Captured Device ID Display (Readonly & Immutable) */}
            <div className="mb-6 p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-amber-400 shrink-0">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-300">Device Signature</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Auto-Captured
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-zinc-500" /> Middle Masked
                    </span>
                  </div>
                  <p className="font-mono text-xs text-amber-400/90 truncate max-w-xs sm:max-w-md mt-0.5">
                    {maskDeviceId(deviceId)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {deviceDetails && (
                  <div className="text-[11px] font-mono text-zinc-500 flex sm:flex-col items-center sm:items-end gap-2 sm:gap-0">
                    <span>{deviceDetails.os} • {deviceDetails.browser}</span>
                    <span>{deviceDetails.resolution}</span>
                  </div>
                )}
                <button
                  id="rescan-device-btn"
                  type="button"
                  onClick={handleRestartCountdown}
                  title="Restart 3-Second Auto-Detect"
                  className="px-2 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[11px] text-zinc-400 hover:text-amber-400 transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Re-Scan</span>
                </button>
              </div>
            </div>

            {/* Error or Success alerts */}
            {errorMsg && (
              <div
                id="portal-error-alert"
                className="mb-5 p-3.5 bg-red-950/50 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2.5"
              >
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                id="portal-success-alert"
                className="mb-5 p-3.5 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Navigation Tabs for the Two Options */}
            <div className="flex border-b border-zinc-800 mb-6">
              <button
                id="tab-new-request"
                onClick={() => {
                  setActiveTab('new-request');
                  setErrorMsg(null);
                }}
                className={`pb-3 text-xs sm:text-sm font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
                  activeTab === 'new-request'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <FileCheck2 className="w-4 h-4" />
                <span>Option 1: New User Request</span>
              </button>

              <button
                id="tab-change-device"
                onClick={() => {
                  setActiveTab('change-device');
                  setErrorMsg(null);
                }}
                className={`ml-6 pb-3 text-xs sm:text-sm font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
                  activeTab === 'change-device'
                    ? 'border-amber-500 text-amber-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Option 2: Change Device ID</span>
              </button>
            </div>

            {/* TAB 1: NEW USER REGISTRATION REQUEST */}
            {activeTab === 'new-request' ? (
              <form onSubmit={handleNewRegistration} className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  First-time access requires linking your Gmail, Full Name, and Mobile Number to this device.
                  Your request will be submitted to the administrator for verification.
                </p>

                {/* Gmail Address */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Gmail Address <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      id="reg-email-input"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. user@gmail.com"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                    />
                  </div>
                </div>

                {/* Device ID (Immutable & Masked for Security) */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>Target Device Signature</span>
                    <span className="text-[11px] text-zinc-500 font-mono flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-amber-500" /> Middle Masked (Admin Only)
                    </span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-amber-500 absolute left-3 top-3" />
                    <input
                      id="reg-device-id-readonly"
                      type="text"
                      readOnly
                      value={maskDeviceId(deviceId)}
                      className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-zinc-950/60 border border-zinc-800 rounded-lg text-amber-400/90 cursor-not-allowed select-all"
                    />
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Protected hardware key (middle masked for privacy). Automatically bound upon admin approval.
                  </p>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Full Legal Name <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      id="reg-name-input"
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                    />
                  </div>
                </div>

                {/* Phone Number with Country Code */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Mobile Number with Country Code <span className="text-amber-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="reg-country-code"
                      value={countryCode}
                      onChange={e => setCountryCode(e.target.value)}
                      className="w-32 py-2 px-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-200 focus:outline-none focus:border-amber-500 transition"
                    >
                      {COUNTRY_CODES.map((c, idx) => (
                        <option key={`reg-cc-${c.code}-${idx}`} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                      <input
                        id="reg-phone-input"
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        placeholder="e.g. 9876543210"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    id="submit-registration-btn"
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs sm:text-sm rounded-lg shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Request for Admin Approval</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            ) : (
              /* TAB 2: CHANGE DEVICE ID REQUEST */
              <form onSubmit={handleDeviceChange} className="space-y-4">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  If you previously registered from another device or computer, enter your registered Gmail,
                  Name, and Phone number. If the records match, an administrative request will be created to
                  re-link your account to this new device.
                </p>

                {/* Gmail Address */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Registered Gmail Address <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      id="change-email-input"
                      type="email"
                      required
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Your existing registered Gmail"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                    />
                  </div>
                </div>

                {/* Full Name */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Registered Full Name <span className="text-amber-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      id="change-name-input"
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Full name as registered"
                      className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                    />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Registered Phone Number with Country Code <span className="text-amber-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="change-country-code"
                      value={countryCode}
                      onChange={e => setCountryCode(e.target.value)}
                      className="w-32 py-2 px-2.5 text-xs bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-200 focus:outline-none focus:border-amber-500 transition"
                    >
                      {COUNTRY_CODES.map((c, idx) => (
                        <option key={`change-cc-${c.code}-${idx}`} value={c.code}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>

                    <div className="relative flex-1">
                      <Phone className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                      <input
                        id="change-phone-input"
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={e => setPhoneNumber(e.target.value)}
                        placeholder="Registered phone digits"
                        className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-950 border border-zinc-700/80 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition"
                      />
                    </div>
                  </div>
                </div>

                {/* New Device ID being bound */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5 flex items-center justify-between">
                    <span>New Device ID (This Machine)</span>
                    <span className="text-[10px] text-zinc-500 font-mono flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-amber-500" /> Middle Masked
                    </span>
                  </label>
                  <div className="p-2.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-mono text-amber-400/90 flex items-center justify-between">
                    <span>{maskDeviceId(deviceId)}</span>
                    <span className="text-[10px] text-zinc-500">Admin Unrestricted</span>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-2">
                  <button
                    id="submit-device-change-btn"
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs sm:text-sm rounded-lg shadow-md transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <span className="inline-block w-4 h-4 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Submit Device Re-Authorization Request</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </main>

      {/* Footer information */}
      <footer className="w-full max-w-5xl mx-auto px-4 py-4 text-center text-xs text-zinc-500 border-t border-zinc-900 z-10 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p>Enterprise Device Vault • Strict Multi-Table Access Separation</p>
        <div className="flex items-center gap-4 text-[11px] text-zinc-400">
          <span>RLS Enforced</span>
          <span>•</span>
          <span>Zero Client Credentials</span>
        </div>
      </footer>

      {/* 
        ========================================================================
        Stealth Admin Portal Access:
        Corner stealth trigger opening the hardware-authenticated Administrator portal.
        All administrative credentials and authentication records are securely 
        managed in Supabase and server-side environment variables.
        ========================================================================
      */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 group">
        <div className="hidden group-hover:block px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-[11px] text-amber-400 rounded shadow-lg font-mono whitespace-nowrap animate-fade-in">
          Admin Portal (Ctrl+Shift+A)
        </div>
        <button
          id="stealth-admin-dp-btn"
          onClick={() => setIsAdminModalOpen(true)}
          title="Admin Profile Access (Ctrl+Shift+A)"
          aria-label="Profile Avatar Access"
          className="relative w-11 h-11 rounded-full bg-gradient-to-br from-zinc-800 to-zinc-950 border-2 border-zinc-700 hover:border-amber-500 text-zinc-300 hover:text-amber-400 transition-all duration-300 flex items-center justify-center cursor-pointer shadow-xl hover:shadow-amber-500/20 active:scale-95"
        >
          {/* Stylized Profile Picture (DP) icon */}
          <div className="w-8 h-8 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-700/80 overflow-hidden">
            <UserCheck className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
          </div>
          {/* Status badge */}
          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-zinc-950 shadow-sm" />
        </button>
      </div>

      {/* Stealth Admin Authentication Dialog */}
      <AdminLoginModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        onAdminLoginSuccess={(adminUser, token) => {
          if (onOpenAdminDirectly) {
            onOpenAdminDirectly(adminUser, token);
          } else {
            onAuthenticated(adminUser, token);
          }
        }}
      />
    </div>
  );
};
