import React, { useState, useEffect } from 'react';
import { User } from './types.ts';
import { DeviceGate } from './components/DeviceGate.tsx';
import { VaultDashboard } from './components/VaultDashboard.tsx';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { GitHubPagesBanner } from './components/GitHubPagesBanner.tsx';
import { apiFetch } from './utils/api.ts';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authToken, setAuthToken] = useState<string>('');
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const [adminUser, setAdminUser] = useState<User | null>(null);
  const [adminToken, setAdminToken] = useState<string>('');

  // Restore session from session storage if available
  useEffect(() => {
    try {
      const savedToken = sessionStorage.getItem('sec_vault_token');
      const savedUserStr = sessionStorage.getItem('sec_vault_user');
      const savedAdminStr = sessionStorage.getItem('sec_vault_admin');
      const savedAdminToken = sessionStorage.getItem('sec_vault_admin_token');

      if (savedToken && savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        setCurrentUser(parsed);
        setAuthToken(savedToken);
      }

      if (savedAdminToken && savedAdminStr) {
        const parsedAdmin = JSON.parse(savedAdminStr);
        setAdminUser(parsedAdmin);
        setAdminToken(savedAdminToken);
      }
    } catch {
      // Ignore storage parse issues
    }
  }, []);

  const handleAuthenticated = (user: User, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    sessionStorage.setItem('sec_vault_token', token);
    sessionStorage.setItem('sec_vault_user', JSON.stringify(user));

    if (user.role === 'admin') {
      setAdminUser(user);
      setAdminToken(token);
      sessionStorage.setItem('sec_vault_admin_token', token);
      sessionStorage.setItem('sec_vault_admin', JSON.stringify(user));
    }
  };

  const handleAdminDirectLogin = (admin: User, token: string) => {
    setAdminUser(admin);
    setAdminToken(token);
    sessionStorage.setItem('sec_vault_admin_token', token);
    sessionStorage.setItem('sec_vault_admin', JSON.stringify(admin));
    setIsAdminView(true);
  };

  const handleLogout = () => {
    if (authToken) {
      apiFetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
          'x-device-id': currentUser?.deviceId || '',
        },
      }).catch(() => {});
    }
    setCurrentUser(null);
    setAuthToken('');
    sessionStorage.removeItem('sec_vault_token');
    sessionStorage.removeItem('sec_vault_user');
  };

  const handleExitAdmin = () => {
    setIsAdminView(false);
  };

  return (
    <>
      {/* If in Admin Console view */}
      {isAdminView && adminUser ? (
        <AdminDashboard
          adminUser={adminUser}
          token={adminToken || authToken}
          onExitAdmin={handleExitAdmin}
        />
      ) : currentUser ? (
        /* If user is authenticated */
        <VaultDashboard
          currentUser={currentUser}
          token={authToken}
          onLogout={handleLogout}
          onOpenAdminConsole={
            currentUser.role === 'admin'
              ? () => setIsAdminView(true)
              : undefined
          }
        />
      ) : (
        /* Default: Device Gate */
        <DeviceGate
          onAuthenticated={handleAuthenticated}
          onOpenAdminDirectly={handleAdminDirectLogin}
        />
      )}

      {/* GitHub Pages Mode Indicator & Connection Modal */}
      <GitHubPagesBanner />
    </>
  );
}
