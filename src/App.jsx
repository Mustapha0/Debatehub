import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Users, User, PlusCircle, Search, Send, X, ArrowLeft, ThumbsUp, Wifi, WifiOff } from 'lucide-react';
import * as Ably from 'ably';
import { AblyProvider, ChannelProvider, useChannel, useConnectionStateListener } from 'ably/react';

const ABLY_KEY = 'N_STWA.0HRHUA:ed6TEW7mZP2xSGvPkkvzsZSuVQW769iX-8C5ale-X68';
const CHANNEL_NAME = 'debatehub:main';

const CATEGORIES = ['All', 'Politics', 'Technology', 'Science', 'Philosophy', 'Sports'];

const INITIAL_DEBATES = [
  {
    id: 1,
    title: 'Universal Basic Income Implementation',
    category: 'Politics',
    type: '1v1',
    description: 'Should UBI be implemented nationwide to combat automation job losses?',
    creator: 'Alex M.',
    participants: ['Alex M.'],
    status: 'open',
    messages: [
      { id: 101, author: 'Alex M.', stance: 'Pro', text: 'Automation will eliminate millions of entry-level jobs. UBI provides an essential safety net.', upvotes: 12, voters: [] },
      { id: 102, author: 'GuestUser', stance: 'Con', text: 'Universal payments without income thresholds could trigger rapid inflation.', upvotes: 5, voters: [] },
    ],
  },
  {
    id: 2,
    title: 'AGI and Future AI Regulation',
    category: 'Technology',
    type: 'Group',
    description: 'Panel discussion on whether AI development should be paused or strictly regulated.',
    creator: 'Elena R.',
    participants: ['Elena R.', 'David K.', 'Sarah L.'],
    status: 'open',
    messages: [
      { id: 103, author: 'Elena R.', stance: 'Con', text: 'Strict regulations right now will only slow down beneficial research and innovation.', upvotes: 8, voters: [] },
      { id: 104, author: 'David K.', stance: 'Pro', text: 'Without guardrails, frontier models pose existential security threats.', upvotes: 15, voters: [] },
    ],
  },
  {
    id: 3,
    title: 'Ethics of Space Commercialization',
    category: 'Science',
    type: '1v1',
    description: 'Is private space exploration beneficial or harmful to humanity long-term?',
    creator: 'Marcus B.',
    participants: ['Marcus B.', 'John D.'],
    status: 'accepted',
    messages: [
      { id: 105, author: 'Marcus B.', stance: 'Pro', text: 'Commercial competition dramatically lowers launching costs.', upvotes: 4, voters: [] },
      { id: 106, author: 'John D.', stance: 'Con', text: 'It risks monopolizing space resources for corporate interests.', upvotes: 9, voters: [] },
    ],
  },
];

/* ---------- Shared-state reducer: every device applies the same events ---------- */
function applyEvent(debates, { name, data }) {
  if (!data) return debates;
  switch (name) {
    case 'new_debate': {
      if (debates.some((d) => d.id === data.id)) return debates;
      return [{ ...data, participants: [data.creator], status: 'open', messages: [] }, ...debates];
    }
    case 'join_debate': {
      return debates.map((d) => {
        if (d.id !== data.debateId || d.participants.includes(data.user)) return d;
        if (d.type === '1v1' && d.participants.length >= 2) return d;
        const participants = [...d.participants, data.user];
        return { ...d, participants, status: d.type === '1v1' && participants.length >= 2 ? 'accepted' : 'open' };
      });
    }
    case 'new_argument': {
      return debates.map((d) => {
        if (d.id !== data.debateId || d.messages.some((m) => m.id === data.message.id)) return d;
        return { ...d, messages: [...d.messages, { ...data.message, upvotes: 0, voters: [] }] };
      });
    }
    case 'vote_argument': {
      return debates.map((d) =>
        d.id !== data.debateId
          ? d
          : {
              ...d,
              messages: d.messages.map((m) => {
                if (m.id !== data.messageId) return m;
                const has = m.voters.includes(data.user);
                if (data.on && !has) return { ...m, voters: [...m.voters, data.user] };
                if (!data.on && has) return { ...m, voters: m.voters.filter((v) => v !== data.user) };
                return m;
              }),
            }
      );
    }
    default:
      return debates;
  }
}

const voteCount = (m) => m.upvotes + m.voters.length;

function DebatePlatform({ username }) {
  const [status, setStatus] = useState('connecting');

  const [debates, setDebates] = useState(INITIAL_DEBATES);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDebateId, setActiveDebateId] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form State
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('Politics');
  const [newType, setNewType] = useState('1v1');
  const [newDescription, setNewDescription] = useState('');
  const [formError, setFormError] = useState('');

  // Chat State
  const [chatMessage, setChatMessage] = useState('');
  const [chatStance, setChatStance] = useState('Pro');
  const messagesEndRef = useRef(null);

  // Live connection: every event (including our own, echoed back by Ably) updates state
  const { channel } = useChannel(CHANNEL_NAME, (message) => {
    setDebates((prev) => applyEvent(prev, { name: message.name, data: message.data }));
  });

  useConnectionStateListener((change) => {
    setStatus(change.current === 'connected' ? 'online' : change.current);
  });

  const publish = (name, data) => {
    channel.publish(name, data).catch(() => setStatus('error'));
  };

  const query = searchQuery.trim().toLowerCase();
  const filteredDebates = debates.filter((d) => {
    const matchesCategory = selectedCategory === 'All' || d.category === selectedCategory;
    const matchesSearch = !query || d.title.toLowerCase().includes(query) || d.description.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  const activeDebate = debates.find((d) => d.id === activeDebateId);
  const messageCount = activeDebate ? activeDebate.messages.length : 0;
  const isJoined = activeDebate ? activeDebate.participants.includes(username) : false;

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ block: 'end' });
  }, [messageCount, activeDebateId]);

  const getStanceStats = (messages = []) => {
    const pro = messages.filter((m) => m.stance === 'Pro').length;
    const con = messages.filter((m) => m.stance === 'Con').length;
    const total = pro + con;
    if (total === 0) return { hasData: false, proPct: 0, conPct: 0 };
    const proPct = Math.round((pro / total) * 100);
    return { hasData: true, proPct, conPct: 100 - proPct };
  };

  const handleAcceptDebate = (id) => publish('join_debate', { debateId: id, user: username });

  const closeModal = () => { setShowCreateModal(false); setFormError(''); };

  const handleCreateDebate = () => {
    if (!newTitle.trim() || !newDescription.trim()) {
      setFormError('Please fill in both the title and description.');
      return;
    }
    publish('new_debate', {
      id: Date.now() + Math.floor(Math.random() * 1000),
      title: newTitle.trim(),
      category: newCategory,
      type: newType,
      description: newDescription.trim(),
      creator: username,
    });
    closeModal();
    setNewTitle('');
    setNewDescription('');
  };

  const handleSendMessage = () => {
    if (!chatMessage.trim() || !activeDebate || !isJoined) return;
    publish('new_argument', {
      debateId: activeDebateId,
      message: {
        id: Date.now() + Math.floor(Math.random() * 1000),
        author: username,
        stance: chatStance,
        text: chatMessage.trim(),
      },
    });
    setChatMessage('');
  };

  const handleUpvote = (msg) => {
    publish('vote_argument', {
      debateId: activeDebateId,
      messageId: msg.id,
      user: username,
      on: !msg.voters.includes(username),
    });
  };

  const inputStyle = { padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontFamily: 'inherit', fontSize: '16px', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 'bold', marginBottom: '4px', color: '#475569' };

  const pageStyle = {
    fontFamily: 'system-ui, sans-serif',
    backgroundColor: '#f8fafc',
    minHeight: '100vh',
    padding: '24px',
    paddingTop: 'max(24px, env(safe-area-inset-top))',
    paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
    boxSizing: 'border-box',
    color: '#0f172a',
  };

  const StatusPill = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 'bold', color: status === 'online' ? '#166534' : '#92400e' }}>
      {status === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}
      {status === 'online' ? 'Live' : status === 'connecting' || status === 'initialized' ? 'Connecting…' : 'Reconnecting…'}
    </span>
  );

  return (
    <div style={pageStyle}>
      {activeDebate ? (
        /* Debate Arena */
        <div style={{ maxWidth: '850px', margin: '0 auto', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <button
              onClick={() => setActiveDebateId(null)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', border: 'none', background: 'none', cursor: 'pointer', color: '#475569', fontWeight: 'bold' }}
            >
              <ArrowLeft size={18} /> Back to Topics
            </button>
            <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '12px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: 'bold' }}>
              {activeDebate.category} • {activeDebate.type} Debate
            </span>
          </div>

          <div style={{ padding: '20px' }}>
            <h2 style={{ margin: '0 0 8px 0' }}>{activeDebate.title}</h2>
            <p style={{ color: '#475569', margin: '0 0 16px 0', fontSize: '15px' }}>{activeDebate.description}</p>

            {(() => {
              const { hasData, proPct, conPct } = getStanceStats(activeDebate.messages);
              return (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', gap: 8 }}>
                    <span style={{ color: '#166534' }}>Pro{hasData ? ` (${proPct}%)` : ''}</span>
                    <span style={{ color: '#64748b', fontSize: '11px' }}>Community stance</span>
                    <span style={{ color: '#991b1b' }}>Con{hasData ? ` (${conPct}%)` : ''}</span>
                  </div>
                  <div style={{ height: '8px', width: '100%', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                    {hasData && (
                      <>
                        <div style={{ width: `${proPct}%`, backgroundColor: '#22c55e', transition: 'width 0.4s ease' }} />
                        <div style={{ width: `${conPct}%`, backgroundColor: '#ef4444', transition: 'width 0.4s ease' }} />
                      </>
                    )}
                  </div>
                  {!hasData && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>No Pro or Con arguments yet.</div>}
                </div>
              );
            })()}

            <div style={{ fontSize: '13px', color: '#64748b', display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span><strong>Participants:</strong> {activeDebate.participants.join(', ')}</span>
              <StatusPill />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', padding: '20px', height: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', backgroundColor: '#fafafa' }}>
            {activeDebate.messages.length === 0 ? (
              <p style={{ color: '#94a3b8', textAlign: 'center', margin: 'auto' }}>No arguments posted yet. Be the first to start the debate!</p>
            ) : (
              activeDebate.messages.map((msg) => {
                const voted = msg.voters.includes(username);
                return (
                  <div key={msg.id} style={{ backgroundColor: 'white', padding: '14px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{msg.author}</span>
                        <span
                          style={{
                            fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold',
                            backgroundColor: msg.stance === 'Pro' ? '#dcfce7' : msg.stance === 'Con' ? '#fee2e2' : '#e2e8f0',
                            color: msg.stance === 'Pro' ? '#166534' : msg.stance === 'Con' ? '#991b1b' : '#334155',
                          }}
                        >
                          {msg.stance}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUpvote(msg)}
                        aria-pressed={voted}
                        aria-label="Upvote argument"
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          border: `1px solid ${voted ? '#2563eb' : '#e2e8f0'}`,
                          background: voted ? '#dbeafe' : '#f8fafc',
                          padding: '4px 8px', borderRadius: '12px', cursor: 'pointer', fontSize: '12px',
                          color: voted ? '#1e40af' : '#475569', fontWeight: voted ? 'bold' : 'normal',
                        }}
                      >
                        <ThumbsUp size={12} /> {voteCount(msg)}
                      </button>
                    </div>
                    <p style={{ margin: 0, fontSize: '14px', color: '#334155', lineHeight: '1.4', overflowWrap: 'anywhere' }}>{msg.text}</p>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {isJoined ? (
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: 'white' }}>
              <select
                value={chatStance}
                onChange={(e) => setChatStance(e.target.value)}
                style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold', cursor: 'pointer' }}
              >
                <option value="Pro">Pro (In Favor)</option>
                <option value="Con">Con (Against)</option>
                <option value="Neutral">Neutral</option>
              </select>
              <input
                type="text"
                placeholder="Type your argument..."
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                style={{ flex: '1 1 180px', padding: '10px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '16px' }}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatMessage.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  backgroundColor: chatMessage.trim() ? '#2563eb' : '#93c5fd', color: 'white', border: 'none',
                  padding: '10px 16px', borderRadius: '6px', cursor: chatMessage.trim() ? 'pointer' : 'not-allowed', fontWeight: 'bold',
                }}
              >
                <Send size={16} /> Submit
              </button>
            </div>
          ) : (
            <div style={{ padding: '16px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', backgroundColor: 'white' }}>
              <span style={{ color: '#64748b', fontSize: '14px' }}>
                {activeDebate.status === 'accepted'
                  ? 'This debate is full. You can read and upvote arguments.'
                  : 'Join this debate to post arguments.'}
              </span>
              {activeDebate.status !== 'accepted' && (
                <button
                  onClick={() => handleAcceptDebate(activeDebate.id)}
                  style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Join Debate
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Dashboard */
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 'bold' }}>DebateHub</h1>
              <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>
                Signed in as <strong>{username}</strong> · <StatusPill />
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#2563eb', color: 'white', padding: '10px 18px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
            >
              <PlusCircle size={18} /> Create Debate
            </button>
          </header>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 280px' }}>
              <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                type="text"
                placeholder="Search debate topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ ...inputStyle, paddingLeft: '38px', backgroundColor: 'white' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', maxWidth: '100%' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  style={{
                    padding: '8px 16px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                    backgroundColor: selectedCategory === cat ? '#2563eb' : '#e2e8f0',
                    color: selectedCategory === cat ? 'white' : '#475569',
                    fontWeight: '600', whiteSpace: 'nowrap',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: '20px' }}>
            {filteredDebates.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: '#64748b', backgroundColor: 'white', borderRadius: '8px' }}>
                No debates match your selection.
              </div>
            ) : (
              filteredDebates.map((debate) => {
                const joined = debate.participants.includes(username);
                const full = debate.status === 'accepted';
                return (
                  <div key={debate.id} style={{ backgroundColor: 'white', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', backgroundColor: '#e0f2fe', color: '#0369a1', fontWeight: 'bold' }}>
                          {debate.category}
                        </span>
                        <span style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b' }}>
                          {debate.type === '1v1' ? <User size={14} /> : <Users size={14} />}
                          {debate.type}
                        </span>
                      </div>
                      <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', color: '#0f172a' }}>{debate.title}</h3>
                      <p style={{ color: '#475569', fontSize: '14px', margin: '0 0 16px 0', lineHeight: '1.4' }}>{debate.description}</p>
                    </div>
                    <div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
                        <strong>Participants:</strong> {debate.participants.join(', ')}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => setActiveDebateId(debate.id)}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', color: '#0f172a', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                        >
                          Open Debate
                        </button>
                        {!joined && !full && (
                          <button
                            onClick={() => handleAcceptDebate(debate.id)}
                            style={{ flex: 1, backgroundColor: '#16a34a', color: 'white', border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
                          >
                            Join
                          </button>
                        )}
                        {joined && <span style={{ fontSize: '12px', color: '#166534', fontWeight: 'bold' }}>Joined</span>}
                        {!joined && full && <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 'bold' }}>Full</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Create Debate Modal */}
      {showCreateModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50 }}
          onClick={closeModal}
        >
          <div
            style={{ width: '100%', maxWidth: '440px', maxHeight: '90vh', overflowY: 'auto', backgroundColor: 'white', borderRadius: '12px', padding: '20px', boxSizing: 'border-box' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '20px' }}>Create Debate</h2>
              <button onClick={closeModal} aria-label="Close" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Title</label>
                <input style={inputStyle} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Remote work vs office" />
              </div>
              <div>
                <label style={labelStyle}>Question or description</label>
                <textarea
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="What is the debate about?"
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Category</label>
                  <select style={inputStyle} value={newCategory} onChange={(e) => setNewCategory(e.target.value)}>
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Format</label>
                  <select style={inputStyle} value={newType} onChange={(e) => setNewType(e.target.value)}>
                    <option value="1v1">1v1</option>
                    <option value="Group">Group</option>
                  </select>
                </div>
              </div>
              {formError && <div style={{ color: '#b91c1c', fontSize: '13px' }}>{formError}</div>}
              <button
                onClick={handleCreateDebate}
                style={{ backgroundColor: '#2563eb', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px' }}
              >
                Create Debate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


/* ---------- Ably wiring ---------- */
function LiveApp({ username }) {
  const [client] = useState(() => new Ably.Realtime({ key: ABLY_KEY, clientId: username }));
  useEffect(() => () => client.close(), [client]);

  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName={CHANNEL_NAME} options={{ params: { rewind: '200' } }}>
        <DebatePlatform username={username} />
      </ChannelProvider>
    </AblyProvider>
  );
}

export default function App() {
  const [username, setUsername] = useState(() => {
    try { return localStorage.getItem('debatehub:name') || ''; } catch { return ''; }
  });
  const [nameInput, setNameInput] = useState('');

  const save = () => {
    const n = nameInput.trim().slice(0, 20);
    if (!n) return;
    try { localStorage.setItem('debatehub:name', n); } catch { /* ignore */ }
    setUsername(n);
  };

  if (username) return <LiveApp username={username} />;

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', padding: '24px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: '380px', backgroundColor: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <h1 style={{ margin: '0 0 4px 0', fontSize: '26px' }}>DebateHub</h1>
        <p style={{ margin: '0 0 16px 0', color: '#64748b', fontSize: '14px' }}>Pick a display name. Others will see it next to your arguments.</p>
        <input
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '16px', width: '100%', boxSizing: 'border-box' }}
          placeholder="Your name"
          maxLength={20}
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          autoFocus
        />
        <button
          onClick={save}
          disabled={!nameInput.trim()}
          style={{ marginTop: '12px', width: '100%', backgroundColor: nameInput.trim() ? '#2563eb' : '#93c5fd', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: nameInput.trim() ? 'pointer' : 'not-allowed' }}
        >
          Start debating
        </button>
      </div>
    </div>
  );
}
