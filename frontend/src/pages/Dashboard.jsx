import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Users, MessageCircle, Zap, Target, Play, Pause, 
  MessageSquare, Send, Edit, Clock, Bell, Bot,
  AlertCircle, Activity
} from 'lucide-react';
import { apiFetch, apiSSE } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatCard } from '../components/ui/StatCard';
import { StatusDot } from '../components/ui/StatusDot';
import { QRCodeSVG } from 'qrcode.react';

export default function Dashboard() {
  const { agentStatus, setAgentStatus } = useOutletContext();
  
  const [stats, setStats] = useState({
    contactsCount: 0,
    activeConversations: 0,
    messagesSentToday: 0,
    dailyLimit: 0,
    loading: true,
    error: null
  });

  const [agentConfig, setAgentConfig] = useState(null);
  const [togglingAgent, setTogglingAgent] = useState(false);
  const [connectingWa, setConnectingWa] = useState(false);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const logsEndRef = useRef(null);

  // Poll stats every 10s
  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const [statusRes, contactsRes, convosRes] = await Promise.all([
        apiFetch(ENDPOINTS.agentStatus),
        apiFetch(ENDPOINTS.contacts),
        apiFetch(ENDPOINTS.conversations)
      ]);

      const contactsList = Array.isArray(contactsRes) ? contactsRes : (contactsRes?.contacts || contactsRes?.data || []);
      const convosList = Array.isArray(convosRes) ? convosRes : (convosRes?.conversations || convosRes?.data || []);
      const agentData = statusRes?.agent || statusRes?.data || statusRes || {};

      const activeConvos = convosList.filter(c => c.status === 'active').length;
      const contactsCount = contactsList.length;

      setAgentConfig(agentData);
      
      setStats({
        contactsCount,
        activeConversations: activeConvos,
        messagesSentToday: agentData.messages_sent_today || 0,
        dailyLimit: agentData.daily_message_limit || 0,
        loading: false,
        error: null
      });

      // Also update agent status context if different
      if (agentData.auto_reply_enabled !== undefined && setAgentStatus) {
        setAgentStatus(agentData.auto_reply_enabled ? 'active' : 'offline');
      }
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
      setStats(prev => ({ ...prev, loading: false, error: 'Failed to load statistics' }));
    }
  };

  // Setup SSE for logs
  useEffect(() => {
    setLogsLoading(true);
    let eventSource;
    let fallbackInterval;

    const connectSSE = () => {
      try {
        eventSource = apiSSE(
          ENDPOINTS.agentLogsStream,
          (entry) => {
            // apiSSE already JSON-parses the event; `entry` is the activity
            // object itself: { id, title, detail, event_type, ts }.
            if (entry && (entry.id || entry.event_type)) {
              setLogs(prev => {
                if (entry.id && prev.some(l => l.id === entry.id)) return prev;
                return [...prev, entry].slice(-50);
              });
            }
            setLogsLoading(false);
          },
          (err) => {
            console.error("SSE Error, falling back to polling", err);
            if (eventSource) {
              eventSource.close();
            }
            startPollingLogs();
          }
        );
      } catch (err) {
        startPollingLogs();
      }
    };

    const startPollingLogs = () => {
      fetchLogs();
      fallbackInterval = setInterval(fetchLogs, 10000);
    };

    const fetchLogs = async () => {
      try {
        const res = await apiFetch(ENDPOINTS.agentLogs);
        // /logs returns { ok, logs: [...] } newest-first — reverse for display.
        const fetchedLogs = res?.logs || res?.data || (Array.isArray(res) ? res : []);
        const ordered = [...fetchedLogs].reverse().slice(-50);
        setLogs(ordered);
        setLogsLoading(false);
      } catch (err) {
        console.error("Failed to fetch logs:", err);
        setLogsLoading(false);
      }
    };

    connectSSE();

    return () => {
      if (eventSource) eventSource.close();
      if (fallbackInterval) clearInterval(fallbackInterval);
    };
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const toggleAgent = async () => {
    setTogglingAgent(true);
    try {
      const running = agentConfig?.is_running ?? agentConfig?.auto_reply_enabled;
      const endpoint = running ? ENDPOINTS.agentStop : ENDPOINTS.agentStart;
      await apiFetch(endpoint, { method: 'POST' });
      // Re-fetch agent config — this refreshes both local state and the
      // shared sidebar status via setAgentStatus inside fetchStats().
      await fetchStats();
    } catch (err) {
      console.error("Failed to toggle agent:", err);
    } finally {
      setTogglingAgent(false);
    }
  };

  const connectWhatsApp = async () => {
    setConnectingWa(true);
    try {
      await apiFetch(ENDPOINTS.whatsappConnect, { method: 'POST' });
      fetchStats();
    } catch (err) {
      console.error("Failed to connect WhatsApp:", err);
    } finally {
      setConnectingWa(false);
    }
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'message_received': return <MessageSquare size={16} className="text-blue-400" />;
      case 'reply_sent': return <Send size={16} className="text-green-400" />;
      case 'draft_created': return <Edit size={16} className="text-yellow-400" />;
      case 'idle_checkin': return <Clock size={16} className="text-purple-400" />;
      case 'proactive_sent': return <Bell size={16} className="text-rose-400" />;
      case 'auto_reply': return <Bot size={16} className="text-teal-400" />;
      default: return <Activity size={16} className="text-gray-400" />;
    }
  };

  const formatRelativeTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return `${Math.floor(diffInSeconds / 86400)}d ago`;
  };

  if (stats.loading && !agentConfig) {
    return (
      <div className="flex flex-col w-full h-full">
        <div className="page-header mb-lg">
          <div className="skeleton h-8 w-48 mb-sm rounded"></div>
          <div className="skeleton h-4 w-64 rounded"></div>
        </div>
        <div className="grid-4 mb-lg">
          {[1,2,3,4].map(i => <div key={i} className="skeleton h-24 rounded-lg"></div>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-lg">
          <div className="md:col-span-2 skeleton h-64 rounded-lg"></div>
          <div className="md:col-span-3 skeleton h-64 rounded-lg"></div>
        </div>
      </div>
    );
  }

  const progressPercent = stats.dailyLimit > 0 
    ? Math.min(Math.round((stats.messagesSentToday / stats.dailyLimit) * 100), 100) 
    : 0;

  const isRunning = agentConfig?.is_running ?? agentConfig?.auto_reply_enabled ?? false;
  const whatsappSession = agentConfig?.whatsapp_session || { status: 'disconnected', qr: null };

  return (
    <motion.div 
      className="flex flex-col w-full h-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="page-header mb-lg flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-gradient-primary mb-xs" style={{ letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p className="text-secondary text-sm">Monitor Aisha's conversations in real-time</p>
        </div>
        {isRunning && (
          <div className="flex items-center" style={{ gap: '8px', padding: '6px 16px', borderRadius: '9999px', backgroundColor: 'rgba(0, 240, 255, 0.1)', border: '1px solid rgba(0, 240, 255, 0.2)', color: 'var(--accent-green)', fontSize: '0.85rem', fontWeight: 600 }}>
            <span className="pulse-active" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-green)' }}></span>
            Agent Online
          </div>
        )}
      </div>

      {stats.error ? (
        <Card className="mb-lg border border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-center justify-between p-md">
            <div className="flex items-center gap-sm text-red-200">
              <AlertCircle size={20} />
              <span>{stats.error}</span>
            </div>
            <Button variant="secondary" size="sm" onClick={fetchStats}>Retry</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid-4 mb-lg">
          <StatCard 
            icon={<Users size={20} />} 
            label="Total Contacts" 
            value={stats.contactsCount} 
            accentColor="rose" 
          />
          <StatCard 
            icon={<MessageCircle size={20} />} 
            label="Active Conversations" 
            value={stats.activeConversations} 
            accentColor="purple" 
          />
          <StatCard 
            icon={<Zap size={20} />} 
            label="Messages Today" 
            value={stats.messagesSentToday} 
            accentColor="gold" 
          />
          <StatCard 
            icon={<Target size={20} />} 
            label="Daily Limit" 
            value={`${stats.messagesSentToday} / ${stats.dailyLimit}`}
            accentColor="green" 
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-lg">
        {/* Agent Control Panel - Left Col */}
        <div className="md:col-span-2 flex flex-col gap-md">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-sm border-b border-white/5">
              <CardTitle className="flex items-center justify-between">
                <span>Agent Status</span>
                <StatusDot status={isRunning ? 'active' : 'paused'} />
              </CardTitle>
            </CardHeader>
            <CardContent className="p-md flex-1 flex flex-col gap-md">
              <div className="flex flex-col items-center justify-center p-md text-center" style={{ position: 'relative' }}>
                {isRunning && <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '120px', height: '120px', backgroundColor: 'rgba(135, 40, 255, 0.2)', borderRadius: '50%', filter: 'blur(24px)', pointerEvents: 'none' }}></div>}
                
                <div 
                  className={isRunning ? "mb-md pulse-active" : "mb-md"}
                  style={{ 
                    height: '96px', width: '96px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.5s', border: '2px solid',
                    ...(isRunning 
                        ? { background: 'linear-gradient(135deg, rgba(135, 40, 255, 0.2), rgba(255, 46, 147, 0.2))', borderColor: 'rgba(135, 40, 255, 0.5)', boxShadow: '0 0 30px rgba(135, 40, 255, 0.3)' }
                        : { backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' })
                  }}
                >
                  <Bot size={48} color={isRunning ? "var(--accent-purple)" : "var(--text-secondary)"} />
                </div>
                <h3 className="text-xl font-bold text-white mb-xs" style={{ letterSpacing: '-0.02em' }}>{agentConfig?.agent_name || 'Aisha'}</h3>
                <p className="text-sm text-secondary">
                  {isRunning ? 'Actively managing conversations' : 'Paused — Not sending messages'}
                </p>
              </div>

              <div className="mt-auto flex flex-col gap-md">
                <Button 
                  variant={isRunning ? "danger" : "primary"} 
                  className="w-full justify-center py-md text-md font-bold transition-all duration-500"
                  onClick={toggleAgent}
                  loading={togglingAgent}
                  disabled={togglingAgent}
                  style={!isRunning ? { 
                    background: 'linear-gradient(135deg, var(--accent-pink), var(--accent-purple))', 
                    border: 'none',
                    boxShadow: '0 0 20px rgba(255,46,147,0.4)'
                  } : {}}
                >
                  {isRunning ? (
                    <><Pause size={18} className="mr-sm" /> Pause Aisha</>
                  ) : (
                    <><Play size={18} className="mr-sm" /> Start Aisha</>
                  )}
                </Button>

                {whatsappSession.status === 'disconnected' && (
                  <Button 
                    variant="outline"
                    className="w-full justify-center py-sm"
                    onClick={connectWhatsApp}
                    loading={connectingWa}
                    disabled={connectingWa}
                  >
                    Connect WhatsApp
                  </Button>
                )}

                {whatsappSession.status === 'waiting_for_scan' && whatsappSession.qr && (
                  <div className="flex flex-col items-center bg-white p-sm rounded-lg">
                    <QRCodeSVG value={whatsappSession.qr} size={200} />
                    <p className="text-gray-800 text-xs mt-sm font-medium">Scan with WhatsApp</p>
                  </div>
                )}

                {whatsappSession.status === 'connected' && (
                  <div className="flex items-center justify-center text-green-400 bg-green-400/10 py-sm rounded-lg text-sm border border-green-400/20">
                    <Zap size={16} className="mr-xs" /> WhatsApp Connected
                  </div>
                )}

                <div className="flex flex-col gap-sm p-sm bg-surface-lighter rounded-lg border border-white/5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-secondary">Auto-Reply</span>
                    <span className={agentConfig?.auto_reply_enabled ? "text-green-400" : "text-gray-500"}>
                      {agentConfig?.auto_reply_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-secondary">Auto-Send</span>
                    <span className={agentConfig?.auto_send_enabled ? "text-green-400" : "text-gray-500"}>
                      {agentConfig?.auto_send_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-xs mt-sm">
                  <div className="flex justify-between text-xs">
                    <span className="text-secondary">Daily Limit Progress</span>
                    <span className="text-white">{progressPercent}%</span>
                  </div>
                  <div className="h-2 w-full bg-surface-lighter rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500" 
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Live Activity Feed - Right Col */}
        <div className="md:col-span-3 flex flex-col">
          <Card className="h-full flex flex-col max-h-[600px]">
            <CardHeader className="pb-sm border-b border-white/5 flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-sm">
                <Activity size={18} className="text-primary" />
                Live Activity
              </CardTitle>
              {logsLoading && <div className="spinner h-4 w-4 border-2"></div>}
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-y-auto">
              {logs.length === 0 && !logsLoading ? (
                <div className="empty-state p-xl h-full flex flex-col items-center justify-center">
                  <Activity className="empty-state-icon mb-md" size={48} />
                  <p className="text-secondary text-center">No activity yet — start Aisha to begin!</p>
                </div>
              ) : (
                <div className="flex flex-col p-md gap-sm">
                  {logs.map((log, i) => (
                    <motion.div 
                      key={log.id || i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-md items-start p-sm rounded-lg hover:bg-surface-lighter transition-colors border border-transparent hover:border-white/5"
                    >
                      <div className="mt-1 p-sm rounded-full bg-surface-dark border border-white/5 flex-shrink-0">
                        {getEventIcon(log.event_type)}
                      </div>
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="flex justify-between items-baseline gap-sm mb-xs">
                          <span className="font-medium text-white truncate text-sm">
                            {log.title || log.event_type?.replace(/_/g, ' ') || 'Event'}
                          </span>
                          <span className="text-xs text-tertiary whitespace-nowrap">
                            {formatRelativeTime(log.ts || log.timestamp || log.created_at)}
                          </span>
                        </div>
                        <span className="text-sm text-secondary break-words line-clamp-2">
                          {log.detail || log.message || ''}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
