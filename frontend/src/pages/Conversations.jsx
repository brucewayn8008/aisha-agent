import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useOutletContext } from 'react-router-dom';
import { apiFetch } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { StageBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { ChatBubble } from '../components/ui/ChatBubble';
import {
  Search, Send, Hand, Pause, Play, AlertCircle, 
  MessageSquare, User, Heart, Calendar, Smile, Map, Briefcase, 
  Palette, Pizza, Music, Plane, Box, Check
} from 'lucide-react';

const FACT_CATEGORIES = {
  interest: { icon: Heart, label: 'Interest' },
  preference: { icon: Heart, label: 'Preference' },
  event: { icon: Calendar, label: 'Event' },
  feeling: { icon: Smile, label: 'Feeling' },
  plan: { icon: Map, label: 'Plan' },
  family: { icon: User, label: 'Family' },
  work: { icon: Briefcase, label: 'Work' },
  hobby: { icon: Palette, label: 'Hobby' },
  food: { icon: Pizza, label: 'Food' },
  music: { icon: Music, label: 'Music' },
  travel: { icon: Plane, label: 'Travel' },
  other: { icon: Box, label: 'Other' },
};

function formatRelativeTime(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  
  return date.toLocaleDateString();
}

export default function Conversations() {
  const { agentStatus } = useOutletContext() || {};
  
  // States
  const [conversations, setConversations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [selectedId, setSelectedId] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState(null);
  
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  
  const [actionLoading, setActionLoading] = useState(null);
  
  const messagesEndRef = useRef(null);

  const fetchConversations = async (silent = true) => {
    try {
      if (!silent) setLoading(true);
      const data = await apiFetch(ENDPOINTS.conversations);
      // Sort by updated_at or last_message_at descending
      const items = Array.isArray(data) ? data : (data?.conversations || data?.items || []);
      const sorted = [...items].sort((a, b) => {
        const timeA = new Date(a.last_message_at || a.updated_at || 0).getTime();
        const timeB = new Date(b.last_message_at || b.updated_at || 0).getTime();
        return timeB - timeA;
      });
      setConversations(sorted);
      if (error) setError(null);
    } catch (err) {
      console.error('Failed to fetch conversations', err);
      if (!silent) setError('Failed to load conversations.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const fetchActiveChat = async (id, silent = true) => {
    try {
      if (!silent) setChatLoading(true);
      const data = await apiFetch(ENDPOINTS.conversation(id));
      const conversationObj = data?.conversation || data;
      setActiveChat(conversationObj);
      if (chatError) setChatError(null);
    } catch (err) {
      console.error('Failed to fetch chat', err);
      if (!silent) setChatError('Failed to load conversation details.');
    } finally {
      if (!silent) setChatLoading(false);
    }
  };

  // Poll conversations
  useEffect(() => {
    fetchConversations(false);
    const interval = setInterval(() => fetchConversations(true), 10000);
    return () => clearInterval(interval);
  }, []);

  // Poll active chat
  useEffect(() => {
    if (!selectedId) {
      setActiveChat(null);
      return;
    }
    
    fetchActiveChat(selectedId, false);
    const interval = setInterval(() => fetchActiveChat(selectedId, true), 5000);
    return () => clearInterval(interval);
  }, [selectedId]);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat?.messages]);

  const filteredConversations = conversations.filter(c => {
    const contactName = c.contact_name || c.contact?.display_name || c.display_name || c.phone_number || '';
    return contactName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !selectedId || sending) return;
    
    setSending(true);
    try {
      await apiFetch(ENDPOINTS.conversationSend(selectedId), {
        method: 'POST',
        body: JSON.stringify({ message: messageInput })
      });
      setMessageInput('');
      await fetchActiveChat(selectedId, true);
      await fetchConversations(true);
    } catch (err) {
      console.error('Failed to send message', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleAction = async (actionType) => {
    if (!selectedId) return;
    
    setActionLoading(actionType);
    try {
      if (actionType === 'ping') {
        await apiFetch(ENDPOINTS.conversationProactive(selectedId), {
          method: 'POST',
          body: JSON.stringify({ message: 'hey!' })
        });
      } else if (actionType === 'pause') {
        const currentlyPaused = activeChat?.status === 'paused';
        await apiFetch(ENDPOINTS.conversationPause(selectedId), {
          method: 'PATCH',
          body: JSON.stringify({ paused: !currentlyPaused }),
        });
      }
      await fetchActiveChat(selectedId, true);
    } catch (err) {
      console.error(`Failed to execute ${actionType}`, err);
      alert(`Failed to ${actionType}.`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <motion.div 
      className="glass-card"
      style={{
        display: 'flex',
        height: 'calc(100vh - 48px)',
        width: '100%',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* LEFT PANEL - CONTACT LIST */}
      <div className="w-[320px] flex flex-col border-r border-border bg-surface shrink-0 h-full">
        <div className="p-md border-b border-border">
          <h2 className="text-lg font-semibold mb-sm text-text-primary">Conversations</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search contacts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input-field w-full pl-xl"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-sm">
          {loading ? (
            <div className="space-y-sm">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="p-md rounded-lg flex gap-md items-center skeleton">
                  <div className="w-10 h-10 rounded-full bg-border" />
                  <div className="flex-1 space-y-xs">
                    <div className="h-4 bg-border rounded w-1/2" />
                    <div className="h-3 bg-border rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="p-md text-center text-text-secondary mt-xl">
              <AlertCircle className="w-8 h-8 mx-auto mb-sm text-text-tertiary" />
              <p>{error}</p>
              <Button variant="ghost" size="sm" className="mt-sm" onClick={() => fetchConversations(false)}>
                Retry
              </Button>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="empty-state h-full flex flex-col items-center justify-center p-md">
              <MessageSquare className="empty-state-icon w-12 h-12 text-text-tertiary mb-sm" />
              <p className="text-text-secondary text-sm text-center">No conversations found.</p>
            </div>
          ) : (
            <div className="space-y-xs">
              {filteredConversations.map(conv => {
                const isSelected = selectedId === conv.id;
                const contactName = conv.contact_name || conv.contact?.display_name || conv.display_name || 'Contact';
                const initial = contactName.charAt(0).toUpperCase();
                
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className={`w-full text-left p-sm rounded-lg transition-colors flex items-start gap-sm ${
                      isSelected ? 'bg-surface-active' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full bg-accent text-accent-fg flex items-center justify-center font-semibold text-lg shrink-0">
                        {initial}
                      </div>
                      {conv.needs_reply && (
                        <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-danger rounded-full border-2 border-surface" />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-xs">
                        <span className="font-medium text-text-primary truncate pr-2">{contactName}</span>
                        <span className="text-xs text-text-tertiary whitespace-nowrap">
                          {formatRelativeTime(conv.last_message_at || conv.updated_at)}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-xs mb-1">
                        <StageBadge stage={conv.contact?.relationship_stage || conv.relationship_stage} />
                      </div>
                      
                      <p className="text-xs text-text-secondary truncate mt-1">
                        {conv.last_message_preview || 'No messages yet'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* CENTER PANEL - CHAT TIMELINE */}
      <div className="flex-1 flex flex-col h-full bg-base min-w-0">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center empty-state p-xl">
            <MessageSquare className="w-16 h-16 text-text-tertiary mb-md opacity-50" />
            <h3 className="text-lg font-medium text-text-secondary">Select a conversation</h3>
            <p className="text-text-tertiary text-sm mt-xs">Choose a contact from the list to view your chat</p>
          </div>
        ) : chatLoading && !activeChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="spinner w-8 h-8 border-accent" />
          </div>
        ) : chatError ? (
          <div className="flex-1 flex items-center justify-center text-center p-xl">
            <div>
              <AlertCircle className="w-10 h-10 text-danger mx-auto mb-sm" />
              <h3 className="text-text-primary font-medium mb-xs">Failed to load chat</h3>
              <p className="text-text-secondary text-sm mb-md">{chatError}</p>
              <Button onClick={() => fetchActiveChat(selectedId, false)}>Retry</Button>
            </div>
          </div>
        ) : activeChat ? (
          <>
            {/* Chat Header */}
            <div className="h-16 border-b border-border bg-surface flex items-center justify-between px-lg shrink-0">
              <div className="flex items-center gap-md">
                <div className="w-10 h-10 rounded-full bg-accent text-accent-fg flex items-center justify-center font-semibold text-lg">
                  {(activeChat.contact_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary leading-tight">
                    {activeChat.contact_name || 'Unknown Contact'}
                  </h3>
                  <div className="flex items-center gap-sm mt-1">
                    <StageBadge stage={activeChat.relationship_stage} />
                    <span className="text-xs text-text-tertiary">
                      Turn {activeChat.turn_count || 0}
                    </span>
                    {activeChat.status === 'paused' && (
                      <span className="badge badge-paused ml-2">Paused</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-sm">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAction('ping')}
                  loading={actionLoading === 'ping'}
                  disabled={!!actionLoading}
                  className="gap-2"
                >
                  <Hand className="w-4 h-4" />
                  Ping 👋
                </Button>
                <Button
                  variant={activeChat.status === 'paused' ? "primary" : "secondary"}
                  size="sm"
                  onClick={() => handleAction('pause')}
                  loading={actionLoading === 'pause'}
                  disabled={!!actionLoading}
                  className="gap-2"
                >
                  {activeChat.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  {activeChat.status === 'paused' ? 'Resume ▶️' : 'Pause ⏸️'}
                </Button>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-lg space-y-md flex flex-col">
              {!activeChat.messages || activeChat.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-text-tertiary">
                  <p>No messages yet.</p>
                </div>
              ) : (
                activeChat.messages.map((msg, idx) => (
                  <ChatBubble 
                    key={msg.id || idx}
                    role={msg.role}
                    content={msg.content || msg.text}
                    timestamp={msg.timestamp || msg.created_at}
                    status={msg.status}
                  />
                ))
              )}
              <div ref={messagesEndRef} className="h-1" />
            </div>

            {/* Chat Input */}
            <div className="p-md border-t border-border bg-surface shrink-0">
              <form onSubmit={handleSendMessage} className="flex items-end gap-sm max-w-4xl mx-auto">
                <div className="flex-1 relative">
                  <textarea
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message as Aisha..."
                    className="input-field w-full min-h-[44px] max-h-[120px] resize-y py-sm px-md leading-relaxed rounded-xl shadow-sm"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                </div>
                <Button 
                  type="submit"
                  variant="primary"
                  size="icon"
                  disabled={!messageInput.trim() || sending}
                  loading={sending}
                  className="shrink-0 rounded-xl h-[44px] w-[44px] shadow-sm"
                >
                  {!sending && <Send className="w-5 h-5" />}
                </Button>
              </form>
            </div>
          </>
        ) : null}
      </div>

      {/* RIGHT PANEL - MEMORY FACTS */}
      <div className="w-[280px] border-l border-border bg-surface shrink-0 h-full flex flex-col">
        <div className="p-md border-b border-border h-16 flex items-center shrink-0">
          <h2 className="text-md font-semibold text-text-primary flex items-center gap-2">
            <span className="text-xl">🧠</span> What Aisha Remembers
          </h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-md space-y-lg">
          {(!activeChat || !activeChat.memory_facts || activeChat.memory_facts.length === 0) ? (
            <div className="empty-state pt-xl">
              <p className="text-text-secondary text-sm text-center px-4 leading-relaxed">
                No memories yet — Aisha will learn as you chat! 🧠
              </p>
            </div>
          ) : (
            Object.entries(
              activeChat.memory_facts.reduce((acc, fact) => {
                const cat = fact.category || 'other';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(fact);
                return acc;
              }, {})
            ).map(([category, facts]) => {
              const catInfo = FACT_CATEGORIES[category.toLowerCase()] || FACT_CATEGORIES.other;
              const Icon = catInfo.icon;
              
              return (
                <div key={category} className="space-y-sm">
                  <h3 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider flex items-center gap-2 mb-2">
                    <Icon className="w-3.5 h-3.5" />
                    {catInfo.label}
                  </h3>
                  <div className="flex flex-col gap-xs">
                    {facts.map((fact, idx) => (
                      <div key={idx} className="bg-surface-hover border border-border/50 rounded-lg p-sm text-sm text-text-secondary shadow-sm flex items-start gap-sm">
                        <div className="mt-0.5 shrink-0">
                          <Check className="w-3.5 h-3.5 text-accent opacity-70" />
                        </div>
                        <p className="leading-snug break-words flex-1">
                          {fact.content || fact.fact || fact.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
