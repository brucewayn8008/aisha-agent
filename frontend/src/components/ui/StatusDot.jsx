import React from 'react';

export default function StatusDot({ status = 'active', size = 10 }) {
  const getColor = () => {
    switch (status) {
      case 'active':
      case 'online':
        return '#34d399';
      case 'paused':
        return '#fbbf24';
      case 'offline':
      default:
        return '#64748b';
    }
  };

  const isPulse = status === 'active' || status === 'online';

  return (
    <span
      style={{
        display: 'inline-block',
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: getColor(),
        boxShadow: isPulse ? `0 0 10px ${getColor()}` : 'none',
        flexShrink: 0,
      }}
      className={isPulse ? 'pulse-active' : ''}
    />
  );
}

export { StatusDot };
