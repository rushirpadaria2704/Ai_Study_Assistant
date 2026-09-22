import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function DocumentDetailPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDocument();
  }, [id]);

  const fetchDocument = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/documents/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
      } else {
        setError(res.data.error || 'Failed to load document details.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Document Workbench...</div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="container-fluid px-0 py-4 font-monospace extra-small">
        <div className="alert alert-danger rounded-3"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error || 'Document not found'}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">{doc.original_name}</li>
        </ol>
      </nav>

      {/* Document Header Card */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center gap-3">
            <div className="icon-box bg-primary bg-opacity-10 text-primary rounded-3 p-3">
              <i className="bi bi-file-earmark-pdf fs-2"></i>
            </div>
            <div>
              <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1 font-monospace extra-small mb-1">
                <i className="bi bi-check-circle-fill me-1"></i> RAG Vector Indexed
              </span>
              <h1 className="h4 fw-bold text-body font-monospace mb-1">{doc.original_name}</h1>
              <div className="extra-small text-muted font-monospace">
                {doc.word_count} words • {doc.page_count} pages • Uploaded {doc.uploaded_at ? doc.uploaded_at.slice(0, 10) : ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Learning Tools Grid */}
      <h2 className="h6 fw-bold text-body font-monospace mb-3 border-bottom pb-2">
        <i className="bi bi-tools me-1 text-primary"></i> Available Study Modules
      </h2>

      <div className="row g-3 mb-4">
        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-chat-text-fill fs-2 text-primary mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">RAG Chat Assistant</h3>
            <p className="extra-small text-muted mb-3">Ask contextual questions with precise page citations.</p>
            <Link to={`/chat/${doc.id}`} className="btn btn-sm btn-primary font-monospace extra-small fw-semibold mt-auto">
              Launch Chat &rarr;
            </Link>
          </div>
        </div>

        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-journal-text fs-2 text-success mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">AI Summary &amp; Takeaways</h3>
            <p className="extra-small text-muted mb-3">Generate chapter key takeaways and revision flashcards.</p>
            <Link to={`/summary/${doc.id}`} className="btn btn-sm btn-success font-monospace extra-small fw-semibold mt-auto">
              Generate Summary &rarr;
            </Link>
          </div>
        </div>

        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-question-circle-fill fs-2 text-warning mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">AI Quiz Generator</h3>
            <p className="extra-small text-muted mb-3">Create custom MCQ or short answer quizzes based on notes.</p>
            <Link to={`/quiz/${doc.id}`} className="btn btn-sm btn-warning font-monospace extra-small fw-semibold mt-auto">
              Create Quiz &rarr;
            </Link>
          </div>
        </div>

        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-mic-fill fs-2 text-info mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">Oral Viva Simulator</h3>
            <p className="extra-small text-muted mb-3">Simulate an interactive oral viva session with voice evaluation.</p>
            <Link to={`/viva/start/${doc.id}`} className="btn btn-sm btn-info text-white font-monospace extra-small fw-semibold mt-auto">
              Start Viva Session &rarr;
            </Link>
          </div>
        </div>

        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-card-checklist fs-2 text-danger mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">Timed MCQ Online Test</h3>
            <p className="extra-small text-muted mb-3">Generate a full-fledged timed online MCQ exam with navigation grid.</p>
            <Link to={`/online-test/setup/${doc.id}`} className="btn btn-sm btn-danger font-monospace extra-small fw-semibold mt-auto">
              Setup Online Exam &rarr;
            </Link>
          </div>
        </div>

        <div className="col-md-6 col-lg-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <i className="bi bi-person-video3 fs-2 text-secondary mb-2"></i>
            <h3 className="h6 fw-bold font-monospace">Teach-Back Mode</h3>
            <p className="extra-small text-muted mb-3">Explain concepts in your own words to verify your mastery.</p>
            <Link to={`/teach/${doc.id}`} className="btn btn-sm btn-secondary font-monospace extra-small fw-semibold mt-auto">
              Start Teach-Back &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
