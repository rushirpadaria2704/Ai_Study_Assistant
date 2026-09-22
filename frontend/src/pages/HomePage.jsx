import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function HomePage() {
  const [stats, setStats] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHomeData();
  }, []);

  const fetchHomeData = async () => {
    try {
      const res = await axios.get('/api/index');
      if (res.data.ok) {
        setStats(res.data.stats || {});
        setDocuments(res.data.recent_documents || []);
      }
    } catch (err) {
      console.error('Failed to load home data:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      {/* Hero Header Banner */}
      <div className="card workbench-card rounded-4 border-0 shadow-lg mb-4 overflow-hidden">
        <div className="card-body p-4 p-md-5">
          <div className="row align-items-center g-4">
            <div className="col-lg-7">
              <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1 font-monospace extra-small mb-3">
                <i className="bi bi-cpu-fill me-1"></i> RAG &amp; AI POWERED STUDY SUITE
              </span>
              <h1 className="display-5 fw-bold text-body font-monospace mb-3">
                Master Your Coursework with Offline AI
              </h1>
              <p className="text-muted fs-6 lh-relaxed mb-4">
                Upload notes, textbooks, and slides. Extract intelligent summaries, challenge yourself with RAG-generated quizzes, practice oral viva voce, and run timed online MCQ exams.
              </p>

              <div className="d-flex align-items-center gap-3 flex-wrap">
                <Link to="/upload" className="btn gradient-btn-emerald font-monospace extra-small px-4 py-3 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2">
                  <i className="bi bi-upload fs-5"></i>
                  <span>UPLOAD_STUDY_MATERIAL</span>
                </Link>
                <Link to="/dashboard" className="btn btn-outline-secondary font-monospace extra-small px-4 py-3 rounded-3 fw-semibold">
                  <i className="bi bi-speedometer2 me-1"></i> View Dashboard
                </Link>
              </div>
            </div>

            <div className="col-lg-5">
              <div className="row g-3">
                <div className="col-6">
                  <div className="p-3 rounded-3 border bg-body text-center">
                    <div className="extra-small text-muted font-monospace mb-1">DOCUMENTS</div>
                    <div className="fs-3 fw-bold font-monospace text-primary">{stats?.documents_count ?? 0}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-3 rounded-3 border bg-body text-center">
                    <div className="extra-small text-muted font-monospace mb-1">QUIZZES</div>
                    <div className="fs-3 fw-bold font-monospace text-success">{stats?.quizzes_count ?? 0}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-3 rounded-3 border bg-body text-center">
                    <div className="extra-small text-muted font-monospace mb-1">VIVA SESSIONS</div>
                    <div className="fs-3 fw-bold font-monospace text-warning">{stats?.viva_count ?? 0}</div>
                  </div>
                </div>
                <div className="col-6">
                  <div className="p-3 rounded-3 border bg-body text-center">
                    <div className="extra-small text-muted font-monospace mb-1">ONLINE TESTS</div>
                    <div className="fs-3 fw-bold font-monospace text-info">{stats?.tests_count ?? 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Grid */}
      <h2 className="h5 fw-bold text-body font-monospace mb-3 border-bottom pb-2">
        <i className="bi bi-grid-fill me-1 text-success"></i> Comprehensive Learning Tools
      </h2>

      <div className="row g-3 mb-4">
        <div className="col-md-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <div className="icon-box bg-primary bg-opacity-10 text-primary rounded-3 p-2 mb-3 d-inline-block">
              <i className="bi bi-chat-quote-fill fs-4"></i>
            </div>
            <h3 className="h6 fw-bold font-monospace">RAG Chat Assistant</h3>
            <p className="extra-small text-muted mb-3">Ask questions about your uploaded documents with page-level citations.</p>
            <Link to="/dashboard" className="text-decoration-none extra-small font-monospace text-primary fw-bold">Open Chat &rarr;</Link>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <div className="icon-box bg-success bg-opacity-10 text-success rounded-3 p-2 mb-3 d-inline-block">
              <i className="bi bi-file-earmark-text-fill fs-4"></i>
            </div>
            <h3 className="h6 fw-bold font-monospace">AI Summaries &amp; Cards</h3>
            <p className="extra-small text-muted mb-3">Generate instant executive summaries, chapter takeaways, and study notes.</p>
            <Link to="/dashboard" className="text-decoration-none extra-small font-monospace text-success fw-bold">Generate Summary &rarr;</Link>
          </div>
        </div>

        <div className="col-md-4">
          <div className="card workbench-card rounded-4 p-4 h-100">
            <div className="icon-box bg-warning bg-opacity-10 text-warning rounded-3 p-2 mb-3 d-inline-block">
              <i className="bi bi-mic-fill fs-4"></i>
            </div>
            <h3 className="h6 fw-bold font-monospace">Oral Viva Voce Simulator</h3>
            <p className="extra-small text-muted mb-3">Practice oral examination sessions with voice interaction and feedback.</p>
            <Link to="/viva" className="text-decoration-none extra-small font-monospace text-warning fw-bold">Start Oral Viva &rarr;</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
