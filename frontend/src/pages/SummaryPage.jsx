import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function SummaryPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSummary();
  }, [id]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/summary/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setSummary(res.data.summary);
      } else {
        setError(res.data.error || 'Failed to load summary.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await axios.post(`/api/summary/${id}`);
      if (res.data.ok) {
        setSummary(res.data.summary);
      } else {
        setError(res.data.error || 'Could not generate summary.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Summary Module...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">AI Summary</li>
        </ol>
      </nav>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="badge bg-success bg-opacity-10 text-success font-monospace extra-small mb-1">
              <i className="bi bi-file-earmark-text-fill me-1"></i> EXECUTIVE SUMMARY &amp; FLASHCARDS
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">{doc?.original_name}</h1>
          </div>
          <button
            type="button"
            disabled={generating}
            className="btn gradient-btn-emerald font-monospace extra-small px-4 py-2 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2"
            onClick={handleGenerateSummary}
          >
            {generating ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-arrow-repeat fs-5"></i>}
            <span>{summary ? 'REGENERATE_SUMMARY' : 'GENERATE_AI_SUMMARY'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger font-monospace extra-small rounded-3 mb-4">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>{error}
        </div>
      )}

      {summary ? (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-4">
          <h2 className="h6 fw-bold font-monospace mb-3 border-bottom pb-2 text-success">
            <i className="bi bi-check-circle-fill me-2"></i> Generated Chapter Takeaways &amp; Key Points
          </h2>
          <div className="lh-relaxed extra-small font-sans text-body" style={{ whiteSpace: 'pre-line' }}>
            {summary.content}
          </div>
        </div>
      ) : (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-5 text-center text-muted font-monospace extra-small">
          <i className="bi bi-journal-plus fs-1 d-block mb-3 text-success"></i>
          No summary generated yet for this document. Click <strong>GENERATE_AI_SUMMARY</strong> to extract key takeaways.
        </div>
      )}
    </div>
  );
}
