import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Terminal } from 'lucide-react';
import { ENDPOINTS } from '../api/endpoints';

export default function SystemLogs() {
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    
    const fetchStream = async () => {
      try {
        const response = await fetch(ENDPOINTS.systemLogsStream, {
          headers: {
            'x-user-email': 'demo@local.dev'
          },
          signal: controller.signal
        });
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop();
          
          for (let part of parts) {
            if (part.startsWith('data: ')) {
              try {
                const data = JSON.parse(part.slice(6));
                if (data.log) {
                  setLogs(prev => {
                    const next = [...prev, data.log];
                    return next.length > 500 ? next.slice(next.length - 500) : next;
                  });
                }
              } catch (e) {}
            }
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Stream error:', err);
        }
      }
    };
    
    fetchStream();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <motion.div 
      className="page-container flex flex-col h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="page-header mb-md flex-shrink-0">
        <h1 className="page-title flex items-center gap-sm">
          <Terminal size={24} className="text-primary" />
          System Logs
        </h1>
        <p className="page-subtitle">Live backend and agent logs</p>
      </div>

      <div className="flex-1 glass-card p-md overflow-y-auto font-mono text-sm" style={{ backgroundColor: '#1e1e1e', color: '#d4d4d4' }}>
        {logs.length === 0 ? (
          <div className="text-secondary italic">Connecting to log stream...</div>
        ) : (
          logs.map((log, i) => {
            let color = '#d4d4d4';
            if (log.includes('[ERROR]')) color = '#ef4444';
            if (log.includes('[WARNING]')) color = '#f59e0b';
            if (log.includes('[INFO]')) color = '#3b82f6';
            
            return (
              <div key={i} className="mb-xs" style={{ color, wordBreak: 'break-all' }}>
                {log}
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>
    </motion.div>
  );
}
