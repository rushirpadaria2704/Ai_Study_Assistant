import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ChatPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputQuestion, setInputQuestion] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchChatHistory();
  }, [id]);

  const fetchChatHistory = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/chat/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setMessages(res.data.history || []);
      } else {
        setError(res.data.error || 'Failed to load chat history.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputQuestion.trim() || sending) return;

    const userQ = inputQuestion.trim();
    setInputQuestion('');
    setSending(true);

    const tempMsg = { question: userQ, answer: 'Generating grounded RAG answer...', created_at: 'Just now' };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await axios.post(`/api/chat/${id}`, { question: userQ });
      if (res.data.ok) {
        setMessages((prev) =>
          prev.map((msg, idx) => (idx === prev.length - 1 ? { ...msg, answer: res.data.answer } : msg))
        );
      } else {
        alert('Error: ' + (res.data.error || 'Could not get response.'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading RAG Conversation Workspace...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">RAG Chat Assistant</li>
        </ol>
      </nav>

      {/* Header */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <span className="badge bg-primary bg-opacity-10 text-primary font-monospace extra-small mb-1">
              <i className="bi bi-cpu-fill me-1"></i> RAG CHAT ENGINE
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">Chatting with: {doc?.original_name}</h1>
          </div>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4" style={{ minHeight: '380px' }}>
        <div className="history-panel d-flex flex-column gap-3">
          {messages.length > 0 ? (
            messages.map((item, idx) => (
              <div key={idx} className="d-flex flex-column gap-2">
                {/* User Message */}
                <div className="p-3 rounded-3 bg-primary bg-opacity-10 border border-primary border-opacity-25 ms-auto" style={{ maxWidth: '80%' }}>
                  <div className="fw-bold font-monospace extra-small text-primary mb-1">You</div>
                  <div className="extra-small font-sans text-body">{item.question}</div>
                </div>

                {/* AI RAG Answer */}
                <div className="p-3 rounded-3 bg-body border border-secondary border-opacity-25" style={{ maxWidth: '85%' }}>
                  <div className="fw-bold font-monospace extra-small text-success mb-1">
                    <i className="bi bi-robot me-1"></i> AI Study Assistant (RAG Grounded)
                  </div>
                  <div className="extra-small font-sans text-body lh-relaxed" style={{ whiteSpace: 'pre-line' }}>
                    {item.answer}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-5 text-muted font-monospace extra-small">
              <i className="bi bi-chat-dots fs-2 d-block mb-2 text-primary"></i>
              Ask any question about <strong>{doc?.original_name}</strong>. Answers are grounded in your notes.
            </div>
          )}
        </div>
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="d-flex gap-2">
        <input
          type="text"
          className="form-control font-sans extra-small rounded-3 p-3 shadow-sm"
          placeholder="Ask a question about your uploaded notes..."
          value={inputQuestion}
          onChange={(e) => setInputQuestion(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !inputQuestion.trim()} className="btn gradient-btn-emerald font-monospace extra-small px-4 rounded-3 fw-bold shadow-sm d-flex align-items-center gap-2">
          {sending ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-send-fill fs-5"></i>}
          <span>Ask</span>
        </button>
      </form>
    </div>
  );
}
