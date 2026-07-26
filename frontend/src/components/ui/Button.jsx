import React from 'react';
import { Loader2 } from 'lucide-react';

export default function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  style = {},
  type = 'button',
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          background: 'rgba(255, 255, 255, 0.08)',
          color: 'var(--text-primary)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-secondary)',
          border: 'none',
        };
      case 'danger':
        return {
          background: 'rgba(248, 113, 113, 0.2)',
          color: '#f87171',
          border: '1px solid rgba(248, 113, 113, 0.4)',
        };
      case 'primary':
      default:
        return {
          background: 'linear-gradient(135deg, var(--accent-pink) 0%, var(--accent-purple) 100%)',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 4px 14px rgba(236, 72, 153, 0.3)',
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return { padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px' };
      case 'lg':
        return { padding: '12px 24px', fontSize: '1rem', borderRadius: '14px' };
      case 'icon':
        return { padding: 0, width: '44px', height: '44px', borderRadius: '10px', flexShrink: 0 };
      case 'md':
      default:
        return { padding: '8px 16px', fontSize: '0.9rem', borderRadius: '10px' };
    }
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 600,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style,
      }}
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export { Button };
