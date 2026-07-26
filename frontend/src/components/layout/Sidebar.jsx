import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  Settings as SettingsIcon,
  Activity,
  Heart,
  Sparkles,
  Terminal,
} from 'lucide-react';
import StatusDot from '../ui/StatusDot';
import { apiFetch } from '../../api/client';
import { ENDPOINTS } from '../../api/endpoints';

export default function Sidebar() {
  const [agentStatus, setAgentStatus] = useState(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const data = await apiFetch(ENDPOINTS.agentStatus);
        setAgentStatus(data);
      } catch (err) {
        setAgentStatus({ auto_reply_enabled: false });
      }
    }
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/conversations', label: 'Conversations', icon: MessageSquare },
    { to: '/contacts', label: 'Contacts', icon: Users },
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
    { to: '/activity', label: 'Activity Log', icon: Activity },
    { to: '/system-logs', label: 'System Logs', icon: Terminal },
  ];

  const isActive = agentStatus?.auto_reply_enabled ? 'active' : 'offline';

  return (
    <aside
      style={{
        width: '260px',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        background: 'rgba(13, 11, 20, 0.75)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 16px',
        zIndex: 100,
      }}
    >
      <div>
        {/* Brand Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            padding: '12px 14px',
            marginBottom: '28px',
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f472b6 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 16px rgba(244, 114, 182, 0.4)',
            }}
          >
            <Heart size={22} fill="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Aisha
              </h2>
              <Sparkles size={14} color="var(--accent-rose)" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <StatusDot status={isActive} size={8} />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                {isActive === 'active' ? 'Active' : 'Paused'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  fontSize: '0.92rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                  background: isActive
                    ? 'linear-gradient(90deg, rgba(244, 114, 182, 0.18) 0%, rgba(168, 85, 247, 0.12) 100%)'
                    : 'transparent',
                  borderLeft: isActive ? '3px solid var(--accent-rose)' : '3px solid transparent',
                  textDecoration: 'none',
                  transition: 'all 0.2s ease',
                })}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: '12px',
          background: 'rgba(255, 255, 255, 0.02)',
          fontSize: '0.75rem',
          color: 'var(--text-dim)',
          textAlign: 'center',
        }}
      >
        <span>Aisha Agent v1.0 • WhatsApp AI</span>
      </div>
    </aside>
  );
}

export { Sidebar };
