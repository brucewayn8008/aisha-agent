import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  UserPlus, 
  X, 
  Phone, 
  User, 
  FileText, 
  ShieldAlert, 
  Archive, 
  MessageSquare,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Settings
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { ENDPOINTS } from '../api/endpoints';
import { Card, CardContent } from '../components/ui/Card';
import { StageBadge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

// Utility for relative time
const timeAgo = (dateString) => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  let interval = Math.floor(seconds / 31536000);
  if (interval >= 1) return `${interval}y ago`;
  interval = Math.floor(seconds / 2592000);
  if (interval >= 1) return `${interval}mo ago`;
  interval = Math.floor(seconds / 86400);
  if (interval >= 1) return `${interval}d ago`;
  interval = Math.floor(seconds / 3600);
  if (interval >= 1) return `${interval}h ago`;
  interval = Math.floor(seconds / 60);
  if (interval >= 1) return `${interval}m ago`;
  if (seconds < 10) return 'Just now';
  return `${Math.floor(seconds)}s ago`;
};

// Utility for Initials
const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getStageColor = (stage) => {
  switch (stage) {
    case 'stranger': return '#fb7185'; // rose-400
    case 'acquaintance': return '#fbbf24'; // amber-400
    case 'friend': return '#6ee7b7'; // emerald-300
    case 'close_friend': return '#a78bfa'; // violet-400
    default: return '#9ca3af'; // gray-400
  }
};

export default function Contacts() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStage, setFilterStage] = useState('All');
  const [sortBy, setSortBy] = useState('Last Active');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);

  const fetchContacts = async () => {
    try {
      const data = await apiFetch(ENDPOINTS.contacts);
      const list = Array.isArray(data) ? data : (data?.contacts || data?.data || []);
      setContacts(list);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      if (contacts.length === 0) {
        setError('Failed to load contacts. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
    const interval = setInterval(fetchContacts, 15000);
    return () => clearInterval(interval);
  }, []);

  // Filtering and Sorting
  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = (contact.display_name?.toLowerCase().includes(searchQuery.toLowerCase())) || 
                          (contact.phone_number?.includes(searchQuery));
    const matchesFilter = filterStage === 'All' || 
                         (filterStage === 'Stranger' && contact.relationship_stage === 'stranger') ||
                         (filterStage === 'Acquaintance' && contact.relationship_stage === 'acquaintance') ||
                         (filterStage === 'Friend' && contact.relationship_stage === 'friend') ||
                         (filterStage === 'Close Friend' && contact.relationship_stage === 'close_friend');
    
    return matchesSearch && matchesFilter;
  });

  const sortedContacts = [...filteredContacts].sort((a, b) => {
    if (sortBy === 'Name') {
      return (a.display_name || '').localeCompare(b.display_name || '');
    } else if (sortBy === 'Most Messages') {
      const totalA = (a.total_messages_sent || 0) + (a.total_messages_received || 0);
      const totalB = (b.total_messages_sent || 0) + (b.total_messages_received || 0);
      return totalB - totalA;
    } else {
      // Last Active
      const dateA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const dateB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return dateB - dateA;
    }
  });

  return (
    <motion.div 
      className="page-container"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="page-header flex items-center justify-between gap-md" style={{ flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Manage Aisha's connections</p>
        </div>
        <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
          <UserPlus size={18} style={{ marginRight: '8px' }} />
          Add Contact
        </Button>
      </div>

      <div className="flex items-center gap-md mb-lg" style={{ flexWrap: 'wrap' }}>
        <div className="flex-1" style={{ minWidth: '250px', position: 'relative' }}>
          <Search size={18} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search by name or phone..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '40px', width: '100%' }}
          />
        </div>
        <div className="flex items-center gap-sm">
          <select 
            className="input-field" 
            value={filterStage} 
            onChange={(e) => setFilterStage(e.target.value)}
          >
            <option value="All">All Stages</option>
            <option value="Stranger">Stranger</option>
            <option value="Acquaintance">Acquaintance</option>
            <option value="Friend">Friend</option>
            <option value="Close Friend">Close Friend</option>
          </select>
          <select 
            className="input-field" 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="Last Active">Sort by Last Active</option>
            <option value="Name">Sort by Name</option>
            <option value="Most Messages">Sort by Messages</option>
          </select>
        </div>
      </div>

      {loading && contacts.length === 0 ? (
        <div className="grid grid-3 gap-md">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Card key={i} className="skeleton" style={{ height: '200px', border: 'none' }}></Card>
          ))}
        </div>
      ) : error ? (
        <Card className="glass-card flex-col items-center justify-center p-lg" style={{ textAlign: 'center' }}>
          <ShieldAlert size={48} className="text-danger mb-md" />
          <h3 className="text-lg font-medium mb-sm">{error}</h3>
          <Button variant="primary" onClick={fetchContacts}>Try Again</Button>
        </Card>
      ) : contacts.length === 0 ? (
        <div className="empty-state p-xl">
          <div className="empty-state-icon">
            <User size={32} />
          </div>
          <h3 className="text-xl font-semibold mt-md mb-sm text-primary">No contacts yet</h3>
          <p className="text-secondary mb-lg">Connect Aisha to WhatsApp to start chatting! 💬</p>
          <Button variant="primary" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={18} style={{ marginRight: '8px' }} />
            Add First Contact
          </Button>
        </div>
      ) : sortedContacts.length === 0 ? (
        <div className="empty-state p-xl">
          <h3 className="text-xl font-semibold mb-sm text-primary">No matching contacts</h3>
          <p className="text-secondary">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <motion.div 
          className="grid grid-3 gap-md"
          variants={{
            hidden: { opacity: 0 },
            show: {
              opacity: 1,
              transition: { staggerChildren: 0.1 }
            }
          }}
          initial="hidden"
          animate="show"
        >
          {sortedContacts.map(contact => (
            <motion.div 
              key={contact.id}
              variants={{
                hidden: { opacity: 0, y: 20 },
                show: { opacity: 1, y: 0 }
              }}
              onClick={() => setSelectedContact(contact)}
            >
              <Card className="glass-card h-full" style={{ cursor: 'pointer', transition: 'all 0.2s', position: 'relative' }}>
                <CardContent className="p-md flex flex-col h-full">
                  {contact.do_not_contact && (
                    <div style={{ position: 'absolute', top: '16px', right: '16px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 'bold' }}>
                      <ShieldAlert size={14} /> DNC
                    </div>
                  )}
                  
                  <div className="flex items-center gap-md mb-md">
                    <div 
                      style={{ 
                        width: '56px', height: '56px', borderRadius: '50%', 
                        backgroundColor: `${getStageColor(contact.relationship_stage)}20`,
                        color: getStageColor(contact.relationship_stage),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '20px', fontWeight: 'bold', border: `1px solid ${getStageColor(contact.relationship_stage)}50`
                      }}
                    >
                      {getInitials(contact.display_name)}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold truncate" style={{ maxWidth: '180px' }}>
                        {contact.display_name || 'Unknown'}
                      </h3>
                      <p className="text-sm text-secondary truncate">{contact.phone_number}</p>
                    </div>
                  </div>
                  
                  <div className="mb-md">
                    <StageBadge stage={contact.relationship_stage} />
                  </div>
                  
                  <div className="mt-auto flex items-center justify-between text-xs text-secondary pt-md border-t border-glass">
                    <div className="flex items-center gap-xs">
                      <span className="flex items-center" title="Messages Sent">
                        <ArrowUpRight size={14} className="text-success mr-1" />
                        {contact.total_messages_sent || 0}
                      </span>
                      <span>·</span>
                      <span className="flex items-center" title="Messages Received">
                        <ArrowDownLeft size={14} className="text-info mr-1" />
                        {contact.total_messages_received || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-xs">
                      <Clock size={14} />
                      {timeAgo(contact.last_message_at)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Add Contact Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="modal-overlay">
            <motion.div 
              className="modal-content"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              style={{ maxWidth: '400px' }}
            >
              <AddContactForm 
                onClose={() => setIsAddModalOpen(false)} 
                onSuccess={() => {
                  setIsAddModalOpen(false);
                  fetchContacts();
                }}
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Contact Detail Panel */}
      <AnimatePresence>
        {selectedContact && (
          <ContactDetailPanel 
            contact={selectedContact} 
            onClose={() => setSelectedContact(null)} 
            onUpdate={fetchContacts}
            navigate={navigate}
          />
        )}
      </AnimatePresence>

    </motion.div>
  );
}

// ---------------------------------------------------------
// Add Contact Form Component
// ---------------------------------------------------------
function AddContactForm({ onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('single');
  const [formData, setFormData] = useState({
    phone_number: '',
    display_name: '',
    notes: ''
  });
  const [bulkData, setBulkData] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      if (activeTab === 'single') {
        if (!formData.phone_number || !formData.display_name) {
          throw new Error('Phone number and name are required');
        }
        await apiFetch(ENDPOINTS.contacts, {
          method: 'POST',
          body: JSON.stringify(formData)
        });
      } else {
        const lines = bulkData.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length === 0) throw new Error('Please enter contacts');
        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const phone = parts.slice(1).join(',').trim();
            await apiFetch(ENDPOINTS.contacts, {
              method: 'POST',
              body: JSON.stringify({ display_name: name, phone_number: phone })
            });
          }
        }
      }
      onSuccess();
    } catch (err) {
      console.error('Failed to create contact:', err);
      setError(err.message || 'Failed to create contact');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex justify-between items-center mb-lg">
        <h2 className="text-xl font-semibold flex items-center gap-sm">
          <UserPlus size={24} className="text-primary" />
          Add New Contact
        </h2>
        <button onClick={onClose} className="p-sm text-secondary hover:text-primary transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <X size={20} />
        </button>
      </div>

      <div className="flex gap-md mb-md border-b border-glass pb-sm">
        <button 
          type="button" 
          onClick={() => setActiveTab('single')} 
          className={`px-sm py-xs rounded font-medium ${activeTab === 'single' ? 'bg-primary text-primary-foreground' : 'text-secondary hover:bg-glass'}`}
          style={{ background: activeTab === 'single' ? 'var(--primary)' : 'transparent', color: activeTab === 'single' ? 'var(--primary-foreground)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
        >
          Single Add
        </button>
        <button 
          type="button" 
          onClick={() => setActiveTab('bulk')} 
          className={`px-sm py-xs rounded font-medium ${activeTab === 'bulk' ? 'bg-primary text-primary-foreground' : 'text-secondary hover:bg-glass'}`}
          style={{ background: activeTab === 'bulk' ? 'var(--primary)' : 'transparent', color: activeTab === 'bulk' ? 'var(--primary-foreground)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer' }}
        >
          Bulk Add
        </button>
      </div>

      {error && (
        <div className="mb-md p-sm text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-md">
        {activeTab === 'single' ? (
          <>
            <div>
              <label className="label mb-xs block">Phone Number *</label>
              <div className="relative">
                <Phone size={16} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                <input 
                  type="text" 
                  className="input-field w-full" 
                  placeholder="+91 98765 43210" 
                  value={formData.phone_number}
                  onChange={e => setFormData({...formData, phone_number: e.target.value})}
                  style={{ paddingLeft: '36px' }}
                  required={activeTab === 'single'}
                />
              </div>
            </div>

            <div>
              <label className="label mb-xs block">Display Name *</label>
              <div className="relative">
                <User size={16} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                <input 
                  type="text" 
                  className="input-field w-full" 
                  placeholder="e.g. John Doe" 
                  value={formData.display_name}
                  onChange={e => setFormData({...formData, display_name: e.target.value})}
                  style={{ paddingLeft: '36px' }}
                  required={activeTab === 'single'}
                />
              </div>
            </div>

            <div>
              <label className="label mb-xs block">Notes</label>
              <div className="relative">
                <FileText size={16} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '12px' }} />
                <textarea 
                  className="input-field w-full" 
                  placeholder="Optional notes about this contact..." 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  style={{ paddingLeft: '36px', minHeight: '80px' }}
                />
              </div>
            </div>
          </>
        ) : (
          <div>
            <label className="label mb-xs block">Bulk Contacts (Name, Phone Number) *</label>
            <div className="relative">
              <FileText size={16} className="text-secondary" style={{ position: 'absolute', left: '12px', top: '12px' }} />
              <textarea 
                className="input-field w-full" 
                placeholder="John Doe, +919876543210&#10;Jane Smith, +919876543211" 
                value={bulkData}
                onChange={e => setBulkData(e.target.value)}
                style={{ paddingLeft: '36px', minHeight: '160px', fontFamily: 'monospace' }}
                required={activeTab === 'bulk'}
              />
            </div>
            <p className="text-xs text-secondary mt-xs">Format: One contact per line. Separate name and phone with a comma.</p>
          </div>
        )}

        <div className="flex justify-end gap-sm mt-md pt-md border-t border-glass">
          <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
          <Button variant="primary" type="submit" loading={loading} disabled={loading}>
            {activeTab === 'single' ? 'Add Contact' : 'Add Bulk Contacts'}
          </Button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------
// Contact Detail Panel Component
// ---------------------------------------------------------
function ContactDetailPanel({ contact, onClose, onUpdate, navigate }) {
  const [formData, setFormData] = useState({
    nickname: contact.nickname || '',
    notes: contact.notes || '',
    do_not_contact: contact.do_not_contact || false
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  // Close panel on esc
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handleStartChatting = async () => {
    setLoading(true);
    setError('');
    
    try {
      await apiFetch(ENDPOINTS.contactStartChat(contact.id), {
        method: 'POST'
      });
      onClose();
      navigate('/conversations');
    } catch (err) {
      console.error('Failed to start chat:', err);
      setError(err.message || 'Failed to start chat');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setIsSaved(false);
    
    try {
      await apiFetch(ENDPOINTS.contact(contact.id), {
        method: 'PATCH',
        body: JSON.stringify(formData)
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      onUpdate(); // refresh list
    } catch (err) {
      console.error('Failed to update contact:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to archive ${contact.display_name}?`)) return;
    
    try {
      await apiFetch(ENDPOINTS.contact(contact.id), { method: 'DELETE' });
      onClose();
      onUpdate();
    } catch (err) {
      console.error('Failed to delete contact:', err);
      alert(err.message || 'Failed to delete contact');
    }
  };

  const handleToggleDNC = async (checked) => {
    setFormData(prev => ({ ...prev, do_not_contact: checked }));
    
    // Auto-save DNC toggle for immediate feedback
    try {
      await apiFetch(ENDPOINTS.contact(contact.id), {
        method: 'PATCH',
        body: JSON.stringify({ do_not_contact: checked })
      });
      onUpdate();
    } catch (err) {
      console.error('Failed to update DNC status:', err);
      setFormData(prev => ({ ...prev, do_not_contact: !checked })); // revert on error
    }
  };

  return (
    <>
      <div 
        className="modal-overlay" 
        onClick={onClose}
        style={{ zIndex: 100 }}
      >
        <motion.div 
          className="glass-card-static"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
          style={{ 
            position: 'absolute', 
            top: 0, 
            right: 0, 
            width: '100%', 
            maxWidth: '450px', 
            height: '100%', 
            borderRadius: '0',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}
        >
          {/* Header */}
          <div className="flex justify-between items-start p-lg border-b border-glass" style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)', backgroundColor: 'rgba(23, 23, 23, 0.8)' }}>
            <div className="flex items-center gap-md">
              <div 
                style={{ 
                  width: '64px', height: '64px', borderRadius: '50%', 
                  backgroundColor: `${getStageColor(contact.relationship_stage)}20`,
                  color: getStageColor(contact.relationship_stage),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '24px', fontWeight: 'bold', border: `1px solid ${getStageColor(contact.relationship_stage)}50`
                }}
              >
                {getInitials(contact.display_name)}
              </div>
              <div>
                <h2 className="text-xl font-bold truncate" style={{ maxWidth: '200px' }}>
                  {contact.display_name}
                </h2>
                <p className="text-secondary flex items-center gap-xs">
                  <Phone size={14} />
                  {contact.phone_number}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-sm text-secondary hover:text-primary transition-colors" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              <X size={24} />
            </button>
          </div>

          {/* Body */}
          <div className="p-lg flex-1 flex flex-col gap-lg">
            
            {/* Stage & Actions */}
            <div className="flex items-center justify-between gap-md">
              <div>
                <label className="text-xs text-secondary uppercase tracking-wider mb-xs block">Relationship Stage</label>
                <StageBadge stage={contact.relationship_stage} />
              </div>
              <div className="flex gap-sm">
                <Button 
                  variant="secondary" 
                  size="sm"
                  onClick={handleStartChatting}
                  loading={loading}
                >
                  <MessageSquare size={16} className="mr-sm" />
                  Start Chatting
                </Button>
                <Button 
                  variant="primary" 
                  size="sm"
                  onClick={() => {
                    onClose();
                    navigate('/conversations');
                  }}
                >
                  <MessageSquare size={16} className="mr-sm" />
                  Conversation
                </Button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-2 gap-sm">
              <div className="glass-card p-md rounded-lg flex flex-col items-center justify-center text-center">
                <ArrowUpRight size={24} className="text-success mb-xs" />
                <span className="text-2xl font-bold">{contact.total_messages_sent || 0}</span>
                <span className="text-xs text-secondary">Sent</span>
              </div>
              <div className="glass-card p-md rounded-lg flex flex-col items-center justify-center text-center">
                <ArrowDownLeft size={24} className="text-info mb-xs" />
                <span className="text-2xl font-bold">{contact.total_messages_received || 0}</span>
                <span className="text-xs text-secondary">Received</span>
              </div>
              <div className="glass-card p-md rounded-lg flex flex-col items-center justify-center text-center col-span-2" style={{ gridColumn: 'span 2' }}>
                <Clock size={20} className="text-secondary mb-xs" />
                <span className="text-sm font-medium">{contact.last_message_at ? new Date(contact.last_message_at).toLocaleString() : 'Never'}</span>
                <span className="text-xs text-secondary">Last Active</span>
              </div>
            </div>

            <hr className="border-glass" />

            {/* Edit Form */}
            <div className="flex flex-col gap-md">
              <h3 className="font-semibold flex items-center gap-sm text-lg">
                <Settings size={18} />
                Contact Settings
              </h3>

              {error && (
                <div className="p-sm text-sm" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px' }}>
                  {error}
                </div>
              )}

              {/* DNC Toggle */}
              <div className="flex items-center justify-between p-md glass-card rounded-lg border border-glass" style={{ borderColor: formData.do_not_contact ? 'rgba(239, 68, 68, 0.3)' : '' }}>
                <div>
                  <h4 className="font-medium flex items-center gap-xs" style={{ color: formData.do_not_contact ? '#ef4444' : '' }}>
                    <ShieldAlert size={16} /> Do Not Contact (DNC)
                  </h4>
                  <p className="text-xs text-secondary mt-xs" style={{ maxWidth: '250px' }}>
                    Prevents Aisha from sending any proactive messages to this person.
                  </p>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input 
                    type="checkbox" 
                    checked={formData.do_not_contact}
                    onChange={(e) => handleToggleDNC(e.target.checked)}
                    style={{ width: '20px', height: '20px', accentColor: '#ef4444' }}
                  />
                </label>
              </div>

              <div>
                <label className="label mb-xs block">Nickname</label>
                <input 
                  type="text" 
                  className="input-field w-full" 
                  placeholder="e.g. Boss, Mom" 
                  value={formData.nickname}
                  onChange={e => setFormData({...formData, nickname: e.target.value})}
                />
              </div>

              <div>
                <label className="label mb-xs block">Notes</label>
                <textarea 
                  className="input-field w-full" 
                  placeholder="Context for Aisha about this person..." 
                  value={formData.notes}
                  onChange={e => setFormData({...formData, notes: e.target.value})}
                  style={{ minHeight: '100px' }}
                />
              </div>

              <div className="flex justify-end mt-sm">
                <Button variant="primary" onClick={handleSave} loading={loading} disabled={loading}>
                  {isSaved ? 'Saved!' : 'Save Changes'}
                </Button>
              </div>
            </div>

            <hr className="border-glass mt-auto pt-lg" />

            {/* Danger Zone */}
            <div className="flex justify-between items-center pb-xl">
              <div>
                <h4 className="font-medium text-danger">Archive Contact</h4>
                <p className="text-xs text-secondary">Hide from active contacts</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleDelete}>
                <Archive size={16} className="mr-sm" />
                Archive
              </Button>
            </div>
            
          </div>
        </motion.div>
      </div>
    </>
  );
}
