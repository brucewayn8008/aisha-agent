import React from 'react';

export function Card({ children, title, subtitle, action, className = '', hover = true, style = {}, ...props }) {
  return (
    <div className={`${hover ? 'glass-card' : 'glass-card-static'} ${className}`} style={{ padding: '20px', ...style }} {...props}>
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            {title && <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{title}</h3>}
            {subtitle && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', style = {}, ...props }) {
  return (
    <div className={className} style={{ padding: '20px 20px 0 20px', ...style }} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ children, className = '', style = {}, ...props }) {
  return (
    <h3 className={className} style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', ...style }} {...props}>
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '', style = {}, ...props }) {
  return (
    <div className={className} style={{ padding: '16px 20px 20px 20px', ...style }} {...props}>
      {children}
    </div>
  );
}

export default Card;
