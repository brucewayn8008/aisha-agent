import React from 'react';

function formatTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return sameDay ? time : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export default function ChatBubble({ role = 'user', content, timestamp, status = 'sent' }) {
  const isAgent = role === 'agent';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isAgent ? 'flex-end' : 'flex-start',
        marginBottom: '14px',
        width: '100%',
      }}
    >
      <div
        style={{
          maxWidth: '75%',
          padding: '12px 16px',
          borderRadius: isAgent ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
          background: isAgent
            ? 'linear-gradient(135deg, rgba(236, 72, 153, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)'
            : 'rgba(255, 255, 255, 0.07)',
          border: isAgent
            ? '1px solid rgba(236, 72, 153, 0.35)'
            : '1px solid rgba(255, 255, 255, 0.08)',
          color: 'var(--text-primary)',
          fontSize: '0.92rem',
          lineHeight: '1.45',
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          wordBreak: 'break-word',
        }}
      >
        {content}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '0.72rem',
          color: 'var(--text-muted)',
          marginTop: '4px',
          padding: '0 4px',
        }}
      >
        <span>{formatTime(timestamp)}</span>
        {isAgent && (
          <span
            style={{
              fontSize: '0.68rem',
              opacity: 0.8,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            • {status}
          </span>
        )}
      </div>
    </div>
  );
}

export { ChatBubble };
