import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { apiFetch } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';

export function AppLayout() {
  const [agentStatus, setAgentStatus] = useState('offline');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const data = await apiFetch(ENDPOINTS.agentStatus);
        const isRunning = data.auto_reply_enabled || data.is_running;
        setAgentStatus(isRunning ? 'active' : 'offline');
      } catch {
        setAgentStatus('offline');
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', overflowX: 'hidden' }}>
      <Sidebar agentStatus={agentStatus} />
      <main className="main-content">
        <ErrorBoundary>
          <Outlet context={{ agentStatus, setAgentStatus }} />
        </ErrorBoundary>
      </main>
    </div>
  );
}
