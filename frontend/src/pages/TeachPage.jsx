import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function TeachPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [session, setSession] = useState(null);
  const [userText, setUserText] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchTeachSession();
  }, [id]);

  const fetchTeachSession = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/teach/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setSession(res.data.session);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSendExplanation = async (e) => {
    e.preventDefault();
    if (!userText.trim() || submitting) return;

    const text = userText.trim();
    setUserText('');
    setSubmitting(true);

    try {
      const res = await axios.post(`/api/teach/${id}`, { message: text });
      if (res.data.ok) {
        setSession(res.data.session);
      } else {
        alert('Error: ' + (res.data.error || 'Failed to submit evaluation'));
      }
    } catch (err) {
      alert('Network error: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Teach-Back Mode...</div>
      </div>
    );
  }

  const messages = session?.messages || [];

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">Teach-Back Mode</li>
        </ol>
      </nav>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between">
          <div>
            <span className="badge bg-secondary bg-opacity-10 text-secondary font-monospace extra-small mb-1">
              <i className="bi bi-person-video3 me-1"></i> CONCEPTUAL EVALUATION &amp; GAP DETECTION
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">{doc?.original_name}</h1>
          </div>
        </div>
      </div>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4" style={{ minHeight: '380px' }}>
        <div className="teach-chat-panel d-flex flex-column gap-3">
          {messages.length > 0 ? (
            messages.map((m, idx) => (
              <div key={idx} className={m.sender === 'teacher' ? 'teach-msg-teacher' : 'teach-msg-student'}>
                <div className="teach-message-label">{m.sender === 'teacher' ? 'AI Student' : 'You (Teacher)'}</div>
                <div className="teach-message-body extra-small font-sans text-body">{m.text}</div>
              </div>
            ))
          ) : (
            <div className="text-center py-5 text-muted font-monospace extra-small">
              <i className="bi bi-chat-quote fs-2 d-block mb-2 text-secondary"></i>
              Explain the concepts from <strong>{doc?.original_name}</strong> in your own words below.
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSendExplanation} className="d-flex gap-2">
        <textarea
          rows="3"
          className="form-control font-sans extra-small rounded-3 p-3 shadow-sm"
          placeholder="Explain this concept in your own words..."
          value={userText}
          onChange={(e) => setUserText(e.target.value)}
          disabled={submitting}
        />
        <button type="submit" disabled={submitting || !userText.trim()} className="btn gradient-btn-emerald font-monospace extra-small px-4 rounded-3 fw-bold shadow-sm d-flex align-items-center gap-2">
          {submitting ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-send-fill fs-5"></i>}
          <span>Evaluate</span>
        </button>
      </form>
    </div>
  );
}
