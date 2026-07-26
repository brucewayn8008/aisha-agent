import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { apiFetch } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { Button } from '../components/ui/Button';
import { MessageCircle, Send, Edit3, Clock, Sparkles, Bot, Settings, AlertCircle, ArrowUp } from 'lucide-react';

// Time Formatting Helper
function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay >= 1 && diffDay < 2) return "yesterday";
  
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getEventIconAndColor(eventType) {
  switch (eventType) {
    case 'message_received':
      return { icon: <MessageCircle size={12} />, color: '#6366f1' };
    case 'reply_sent':
      return { icon: <Send size={12} />, color: '#22c55e' };
    case 'draft_created':
      return { icon: <Edit3 size={12} />, color: '#f59e0b' };
    case 'idle_checkin':
      return { icon: <Clock size={12} />, color: '#3b82f6' };
    case 'proactive_sent':
      return { icon: <Sparkles size={12} />, color: '#8b5cf6' };
    case 'auto_reply':
      return { icon: <Bot size={12} />, color: '#d946ef' };
    default:
      return { icon: <Settings size={12} />, color: 'var(--text-tertiary)' };
  }
}

// Collapsible detail component
function EventDetail({ text }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  
  const threshold = 100;
  const isLong = text.length > threshold;
  
  return (
    <div className="mt-xs text-sm text-secondary">
      {isLong && !expanded ? `${text.substring(0, threshold)}...` : text}
      {isLong && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-xs text-xs font-semibold hover:underline focus:outline-none"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent-purple)' }}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

export default function Activity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('All');
  const [skip, setSkip] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const [newEventsQueue, setNewEventsQueue] = useState([]);
  const [isScrolledDown, setIsScrolledDown] = useState(false);
  const scrollRef = useRef(null);

  const fetchEvents = async (currentSkip, isLoadMore = false) => {
    try {
      if (!isLoadMore) setLoading(true);
      else setLoadingMore(true);
      
      let endpoint = `${ENDPOINTS.agentLogs}?skip=${currentSkip}&limit=${LIMIT}`;
      if (filter !== 'All') {
        const typeMap = {
          'Messages': 'message_received',
          'Replies': 'reply_sent',
          'Check-ins': 'idle_checkin',
          'Proactive': 'proactive_sent'
        };
        endpoint += `&event_type=${typeMap[filter]}`;
      }

      const data = await apiFetch(endpoint);
      const logsList = Array.isArray(data) ? data : (data?.logs || data?.items || []);
      
      if (isLoadMore) {
        setEvents(prev => [...prev, ...logsList]);
      } else {
        setEvents(logsList);
      }
      
      if (logsList.length < LIMIT) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      
      setError(null);
    } catch (err) {
      console.error("Failed to fetch events:", err);
      setError("Failed to load activity logs.");
    } finally {
      if (!isLoadMore) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    setSkip(0);
    setNewEventsQueue([]);
    fetchEvents(0, false);
  }, [filter]);

  // Polling for new events
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      if (events.length === 0 || loading) return;
      
      try {
        let endpoint = `${ENDPOINTS.agentLogs}?skip=0&limit=10`;
        if (filter !== 'All') {
          const typeMap = {
            'Messages': 'message_received',
            'Replies': 'reply_sent',
            'Check-ins': 'idle_checkin',
            'Proactive': 'proactive_sent'
          };
          endpoint += `&event_type=${typeMap[filter]}`;
        }
        
        const data = await apiFetch(endpoint);
        const list = Array.isArray(data) ? data : (data?.logs || data?.items || []);

        const latestId = events[0]?.id;
        const newItems = [];
        for (const item of list) {
          if (item.id === latestId) break;
          newItems.push(item);
        }
        
        if (newItems.length > 0) {
          if (isScrolledDown) {
            setNewEventsQueue(prev => {
              const merged = [...newItems, ...prev];
              // Remove duplicates
              const unique = Array.from(new Map(merged.map(item => [item.id, item])).values());
              return unique;
            });
          } else {
            // Auto prepend
            setEvents(prev => {
              const merged = [...newItems, ...prev];
              // Keep only unique just in case
              return Array.from(new Map(merged.map(item => [item.id, item])).values());
            });
          }
        }
      } catch (err) {
        // Silent fail on poll
      }
    }, 10000);
    
    return () => clearInterval(pollInterval);
  }, [events, isScrolledDown, loading, filter]);

  const handleScroll = (e) => {
    const { scrollTop } = e.target;
    setIsScrolledDown(scrollTop > 50);
    
    // Auto-clear banner if scrolled to top
    if (scrollTop <= 50 && newEventsQueue.length > 0) {
      setEvents(prev => {
        const merged = [...newEventsQueue, ...prev];
        return Array.from(new Map(merged.map(item => [item.id, item])).values());
      });
      setNewEventsQueue([]);
    }
  };

  const handleLoadMore = () => {
    const nextSkip = skip + LIMIT;
    setSkip(nextSkip);
    fetchEvents(nextSkip, true);
  };

  const applyQueue = () => {
    setEvents(prev => {
      const merged = [...newEventsQueue, ...prev];
      return Array.from(new Map(merged.map(item => [item.id, item])).values());
    });
    setNewEventsQueue([]);
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const renderSkeleton = () => (
    <div className="flex flex-col gap-md relative">
      <div className="absolute top-0 bottom-0 w-[2px]" style={{ left: '11px', backgroundColor: 'var(--border-subtle)', zIndex: 0 }}></div>
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex gap-md relative z-10">
          <div 
            className="flex-shrink-0 mt-2 rounded-full skeleton" 
            style={{ width: '24px', height: '24px', border: '4px solid var(--bg-primary)' }}
          ></div>
          <div className="flex-1 glass-card p-md skeleton h-[80px]"></div>
        </div>
      ))}
    </div>
  );

  return (
    <motion.div 
      className="page-container flex flex-col h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="page-header mb-md">
        <h1 className="page-title">Activity Log</h1>
        <p className="page-subtitle">Track everything Aisha does</p>
      </div>

      <div className="flex gap-sm mb-lg overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {['All', 'Messages', 'Replies', 'Check-ins', 'Proactive'].map(f => (
          <Button 
            key={f}
            variant={filter === f ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
      </div>

      <div 
        className="flex-1 overflow-y-auto relative px-2" 
        ref={scrollRef}
        onScroll={handleScroll}
        style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}
      >
        <AnimatePresence>
          {newEventsQueue.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute z-50 cursor-pointer"
              style={{ position: 'sticky', top: '10px', left: '50%', transform: 'translateX(-50%)', width: 'fit-content', margin: '0 auto' }}
              onClick={applyQueue}
            >
              <div 
                className="glass-card px-4 py-2 flex items-center gap-2 rounded-full text-sm font-medium" 
                style={{ 
                  backgroundColor: 'rgba(139, 92, 246, 0.2)', 
                  border: '1px solid #8b5cf6',
                  color: '#fff',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                }}
              >
                <ArrowUp size={14} />
                {newEventsQueue.length} new event{newEventsQueue.length > 1 ? 's' : ''} ↑
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && !events.length ? (
          renderSkeleton()
        ) : error && !events.length ? (
          <div className="empty-state">
            <AlertCircle className="empty-state-icon" size={48} />
            <p className="text-secondary">{error}</p>
            <Button onClick={() => fetchEvents(0)} className="mt-md" variant="secondary">Retry</Button>
          </div>
        ) : events.length === 0 ? (
          <div className="empty-state">
            <Sparkles className="empty-state-icon" size={48} />
            <p className="text-secondary mt-sm">No activity recorded yet — Aisha is waiting to chat! 🌸</p>
          </div>
        ) : (
          <div className="flex flex-col relative pb-lg pt-sm">
            <div 
              className="absolute top-0 bottom-0 w-[2px]" 
              style={{ left: '11px', backgroundColor: 'var(--border-subtle)', zIndex: 0 }}
            ></div>
            
            <AnimatePresence initial={false}>
              {events.map((event) => {
                const { icon, color } = getEventIconAndColor(event.event_type);
                const absTime = new Date(event.created_at).toLocaleString();
                
                return (
                  <motion.div 
                    key={event.id}
                    layout
                    initial={{ opacity: 0, x: -20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: 'auto' }}
                    className="flex gap-md mb-md relative z-10"
                  >
                    <div 
                      className="flex-shrink-0 mt-2 flex items-center justify-center rounded-full"
                      style={{ 
                        width: '24px', 
                        height: '24px', 
                        backgroundColor: 'var(--bg-primary)',
                        color: color,
                        border: `2px solid ${color}`
                      }}
                    >
                      {icon}
                    </div>
                    
                    <div className="flex-1 glass-card p-md transition-all hover:border-[var(--border-hover)]">
                      <div className="flex justify-between items-start mb-xs">
                        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{event.title}</span>
                        <span className="text-xs text-tertiary ml-sm whitespace-nowrap cursor-help" title={absTime}>
                          {timeAgo(event.created_at)}
                        </span>
                      </div>
                      <EventDetail text={event.detail} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            
            {hasMore && (
              <div className="flex justify-center mt-md z-10">
                <Button 
                  onClick={handleLoadMore} 
                  loading={loadingMore}
                  variant="secondary"
                  size="sm"
                >
                  Load More
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
