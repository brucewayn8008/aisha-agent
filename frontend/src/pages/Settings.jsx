import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, Plus, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { apiFetch } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';

// Inline Toggle Component
const Toggle = ({ checked, onChange }) => (
  <div 
    onClick={() => onChange(!checked)}
    style={{
      width: '48px',
      height: '24px',
      borderRadius: '9999px',
      background: checked ? 'var(--accent-rose, #e11d48)' : 'var(--bg-tertiary, #27272a)',
      position: 'relative',
      cursor: 'pointer',
      transition: 'background 0.3s ease',
      display: 'inline-block'
    }}
  >
    <div 
      style={{
        width: '20px',
        height: '20px',
        borderRadius: '50%',
        background: '#ffffff',
        position: 'absolute',
        top: '2px',
        left: '2px',
        transition: 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
        transform: checked ? 'translateX(24px)' : 'translateX(0)'
      }}
    />
  </div>
);

// Toast Component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => onClose(), 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClose]);

  if (!message) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.9 }}
      className={`toast toast-${type}`}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'var(--bg-secondary)',
        border: `1px solid ${type === 'error' ? 'var(--accent-danger)' : 'var(--accent-emerald)'}`,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
        zIndex: 50,
        color: 'var(--text-primary)',
        fontWeight: 500
      }}
    >
      {type === 'error' ? (
        <AlertCircle size={20} style={{ color: 'var(--accent-danger)' }} />
      ) : (
        <CheckCircle2 size={20} style={{ color: 'var(--accent-emerald)' }} />
      )}
      {message}
    </motion.div>
  );
};

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'success' });
  const [fetchError, setFetchError] = useState(false);

  // Form states
  const [agentName, setAgentName] = useState('Aisha');
  const [personaDesc, setPersonaDesc] = useState('');
  const [tone, setTone] = useState('');
  const [interestsStr, setInterestsStr] = useState('');
  const [boundaries, setBoundaries] = useState('');
  
  const [autoReply, setAutoReply] = useState(true);
  const [autoSend, setAutoSend] = useState(true);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [maxWords, setMaxWords] = useState(30);
  
  const [starters, setStarters] = useState([]);
  
  const defaultStarters = [
    "hey, been thinking about you 💭",
    "what's on your mind today? ✨",
    "good morning! how'd you sleep? ☀️"
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    setLoading(true);
    setFetchError(false);
    try {
      const data = await apiFetch(ENDPOINTS.settings);
      if (data && data.settings) {
        const s = data.settings;
        setAgentName(s.agent_name || 'Aisha');
        setPersonaDesc(s.persona_description || '');
        setTone(s.tone || '');
        setInterestsStr((s.interests || []).join(', '));
        setBoundaries(Array.isArray(s.boundaries) ? s.boundaries.join(', ') : (s.boundaries || ''));
        setAutoReply(s.auto_reply_enabled ?? true);
        setAutoSend(s.auto_send_enabled ?? true);
        setDailyLimit(s.daily_message_limit ?? 20);
        setMaxWords(s.max_response_length_words ?? 30);
        
        if (s.conversation_starters && s.conversation_starters.length > 0) {
          setStarters(s.conversation_starters);
        } else {
          setStarters([...defaultStarters]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  async function handleSave(e) {
    e?.preventDefault();
    setSaving(true);
    try {
      const payload = {
        agent_name: agentName,
        persona_description: personaDesc,
        tone: tone,
        interests: interestsStr.split(',').map((i) => i.trim()).filter(Boolean),
        boundaries: boundaries.split(',').map((b) => b.trim()).filter(Boolean),
        auto_reply_enabled: autoReply,
        auto_send_enabled: autoSend,
        daily_message_limit: Number(dailyLimit),
        max_response_length_words: Number(maxWords),
        conversation_starters: starters.filter(s => s.trim() !== ''),
      };

      await apiFetch(ENDPOINTS.settings, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      showToast('Settings saved successfully!');
    } catch (err) {
      showToast(`Failed to save: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleStarterChange(index, value) {
    const newStarters = [...starters];
    newStarters[index] = value;
    setStarters(newStarters);
  }

  function handleAddStarter() {
    setStarters([...starters, '']);
  }

  function handleRemoveStarter(index) {
    setStarters(starters.filter((_, i) => i !== index));
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-lg" style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
        <div className="skeleton" style={{ height: '80px', borderRadius: '12px' }}></div>
        <div className="skeleton" style={{ height: '300px', borderRadius: '16px' }}></div>
        <div className="skeleton" style={{ height: '200px', borderRadius: '16px' }}></div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-md" style={{ height: '50vh' }}>
        <AlertCircle size={48} style={{ color: 'var(--accent-danger)' }} />
        <h2 className="text-xl">Failed to load settings</h2>
        <Button onClick={fetchSettings} variant="primary">Retry</Button>
      </div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ maxWidth: '700px', margin: '0 auto', width: '100%', paddingBottom: '100px' }}
      className="flex flex-col gap-lg"
    >
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle text-secondary">Configure Aisha's personality and behavior</p>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-lg">
        {/* ✨ Persona */}
        <Card title="✨ Persona" subtitle="Define how Aisha communicates and presents herself">
          <div className="flex flex-col gap-md">
            <div className="grid grid-2 gap-md">
              <div className="flex flex-col gap-xs">
                <label className="label text-sm text-secondary">Agent Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. Aisha"
                  required
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="label text-sm text-secondary">Tone</label>
                <input
                  type="text"
                  className="input-field"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="e.g. casual, lowercase, friendly"
                />
              </div>
            </div>

            <div className="flex flex-col gap-xs">
              <label className="label text-sm text-secondary">Persona Description</label>
              <textarea
                className="input-field"
                rows={4}
                value={personaDesc}
                onChange={(e) => setPersonaDesc(e.target.value)}
                placeholder="Describe Aisha's personality, background, and how she should act..."
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="label text-sm text-secondary">Interests (Comma Separated)</label>
              <input
                type="text"
                className="input-field"
                value={interestsStr}
                onChange={(e) => setInterestsStr(e.target.value)}
                placeholder="e.g. art, photography, coffee"
              />
            </div>

            <div className="flex flex-col gap-xs">
              <label className="label text-sm text-secondary">Boundaries (Comma Separated)</label>
              <textarea
                className="input-field"
                rows={3}
                value={boundaries}
                onChange={(e) => setBoundaries(e.target.value)}
                placeholder="Topics Aisha should avoid, e.g. politics, religion, controversial topics"
              />
            </div>
          </div>
        </Card>

        {/* 🛡️ Safety & Limits */}
        <Card title="🛡️ Safety & Limits" subtitle="Safety controls for daily throughput and reply generation">
          <div className="flex flex-col gap-lg">
            <div className="grid grid-2 gap-lg">
              <div className="flex items-center justify-between" style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '12px' }}>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Auto-Reply</span>
                  <span className="text-xs text-secondary">Reply to incoming messages</span>
                </div>
                <Toggle checked={autoReply} onChange={setAutoReply} />
              </div>
              
              <div className="flex items-center justify-between" style={{ padding: '12px', background: 'var(--bg-input)', borderRadius: '12px' }}>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Auto-Send</span>
                  <span className="text-xs text-secondary">Initiate conversations automatically</span>
                </div>
                <Toggle checked={autoSend} onChange={setAutoSend} />
              </div>
            </div>

            <div className="grid grid-2 gap-lg">
              <div className="flex flex-col gap-xs">
                <div className="flex justify-between items-center">
                  <label className="label text-sm text-secondary">Daily Message Limit</label>
                  <span className="text-sm font-bold text-accent-rose">{dailyLimit}</span>
                </div>
                <div className="flex items-center gap-sm">
                  <input
                    type="range"
                    min={5}
                    max={100}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    style={{ flex: 1, accentColor: 'var(--accent-rose)' }}
                  />
                  <input
                    type="number"
                    min={5}
                    max={100}
                    className="input-field"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    style={{ width: '70px', padding: '6px' }}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-xs">
                <label className="label text-sm text-secondary">Max Response Length (Words)</label>
                <input
                  type="number"
                  min={10}
                  max={200}
                  className="input-field"
                  value={maxWords}
                  onChange={(e) => setMaxWords(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* 💬 Conversation Starters */}
        <Card title="💬 Conversation Starters" subtitle="Templates Aisha uses when initiating outreach">
          <div className="flex flex-col gap-sm">
            <AnimatePresence>
              {starters.map((starter, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-sm items-center"
                >
                  <input
                    type="text"
                    className="input-field flex-1"
                    value={starter}
                    onChange={(e) => handleStarterChange(index, e.target.value)}
                    placeholder="Enter a conversation starter..."
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="icon"
                    onClick={() => handleRemoveStarter(index)}
                    style={{ padding: '10px' }}
                  >
                    <X size={18} />
                  </Button>
                </motion.div>
              ))}
            </AnimatePresence>
            
            <Button
              type="button"
              variant="ghost"
              onClick={handleAddStarter}
              style={{ alignSelf: 'flex-start', marginTop: '8px' }}
            >
              <Plus size={16} style={{ marginRight: '6px' }} />
              Add Starter
            </Button>
          </div>
        </Card>

        {/* Sticky Save Button Container */}
        <div 
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '20px',
            background: 'linear-gradient(to top, var(--bg-primary) 50%, transparent)',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 40,
            pointerEvents: 'none'
          }}
        >
          <div style={{ width: '100%', maxWidth: '700px', display: 'flex', justifyContent: 'flex-end', pointerEvents: 'auto' }}>
            <Button 
              type="submit" 
              variant="primary" 
              loading={saving}
              style={{
                boxShadow: '0 4px 14px 0 rgba(225, 29, 72, 0.39)'
              }}
            >
              <Save size={18} style={{ marginRight: '8px' }} />
              Save Settings
            </Button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast({ message: '', type: 'success' })} 
        />
      </AnimatePresence>
    </motion.div>
  );
}
