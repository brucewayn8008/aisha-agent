import React from 'react';

export function StatCard({ icon, label, value, subtext, progress, accentColor = 'purple' }) {
  const Icon = typeof icon === 'function' ? icon : null;

  // Map accent colors to gradients
  const gradients = {
    purple: 'linear-gradient(135deg, rgba(135, 40, 255, 0.2), rgba(255, 46, 147, 0.2))',
    rose: 'linear-gradient(135deg, rgba(255, 46, 147, 0.2), rgba(255, 184, 0, 0.2))',
    gold: 'linear-gradient(135deg, rgba(255, 184, 0, 0.2), rgba(255, 42, 85, 0.2))',
    green: 'linear-gradient(135deg, rgba(0, 240, 255, 0.2), rgba(135, 40, 255, 0.2))',
  };
  
  const iconColors = {
    purple: 'var(--accent-purple)',
    rose: 'var(--accent-rose)',
    gold: 'var(--accent-gold)',
    green: 'var(--accent-green)',
  };

  const currentGradient = gradients[accentColor] || gradients.purple;
  const currentIconColor = iconColors[accentColor] || iconColors.purple;

  return (
    <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            {label}
          </span>
          <div style={{ fontSize: '2.2rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '8px', letterSpacing: '-0.02em' }}>
            {value}
          </div>
        </div>
        {icon && (
          <div
            style={{
              padding: '12px',
              borderRadius: '16px',
              background: currentGradient,
              color: currentIconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 20px ${currentGradient.split(',')[1].trim()}`,
              border: `1px solid rgba(255,255,255,0.1)`
            }}
          >
            {React.isValidElement(icon) ? icon : Icon ? <Icon size={24} /> : null}
          </div>
        )}
      </div>

      {subtext && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '16px' }}>
          {subtext}
        </div>
      )}

      {progress !== undefined && (
        <div
          style={{
            marginTop: '20px',
            width: '100%',
            height: '8px',
            borderRadius: '9999px',
            background: 'rgba(255, 255, 255, 0.05)',
            overflow: 'hidden',
            border: '1px solid rgba(255,255,255,0.05)'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, progress))}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${currentIconColor}, #fff)`,
              borderRadius: '9999px',
              transition: 'width 1s cubic-bezier(0.25, 1, 0.5, 1)',
              boxShadow: `0 0 10px ${currentIconColor}`
            }}
          />
        </div>
      )}
    </div>
  );
}

export default StatCard;
