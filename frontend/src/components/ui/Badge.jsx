import React from 'react';

const STAGE_CONFIG = {
  stranger: { label: 'Stranger', className: 'badge-stranger', emoji: '🔴' },
  acquaintance: { label: 'Acquaintance', className: 'badge-acquaintance', emoji: '🟡' },
  friend: { label: 'Friend', className: 'badge-friend', emoji: '🟢' },
  close_friend: { label: 'Close Friend', className: 'badge-close-friend', emoji: '💜' },
};

const STATUS_CONFIG = {
  active: { label: 'Active', className: 'badge-active' },
  paused: { label: 'Paused', className: 'badge-paused' },
  ended: { label: 'Ended', className: 'badge-ended' },
  draft: { label: 'Draft', className: 'badge-draft' },
  sent: { label: 'Sent', className: 'badge-sent' },
  received: { label: 'Received', className: 'badge-received' },
};

export function Badge({ children, stage, variant = '', className = '', style = {} }) {
  if (stage) {
    return <StageBadge stage={stage} className={className} style={style} />;
  }
  return (
    <span className={`badge ${variant ? `badge-${variant}` : ''} ${className}`} style={style}>
      {children}
    </span>
  );
}

export function StageBadge({ stage = 'stranger', showEmoji = false, className = '', style = {} }) {
  const stageKey = (stage || 'stranger').toLowerCase();
  const config = STAGE_CONFIG[stageKey] || STAGE_CONFIG.stranger;
  return (
    <span className={`badge ${config.className} ${className}`} style={style}>
      {showEmoji && <span>{config.emoji}</span>}
      {config.label}
    </span>
  );
}

export function StatusBadge({ status = 'active', className = '', style = {} }) {
  const statusKey = (status || 'active').toLowerCase();
  const config = STATUS_CONFIG[statusKey] || { label: status, className: '' };
  return (
    <span className={`badge ${config.className} ${className}`} style={style}>
      {config.label}
    </span>
  );
}

export default Badge;
