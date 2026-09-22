import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function VivaReviewPage() {
  const { sessionId } = useParams();
  const [reviewData, setReviewData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReview();
  }, [sessionId]);

  const fetchReview = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/viva/review/${sessionId}`);
      if (res.data.ok) {
        setReviewData(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Evaluating Viva Voce Transcript...</div>
      </div>
    );
  }

  const session = reviewData?.session || {};
  const stats = reviewData?.stats || {};
  const replies = session?.replies || [];

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/viva" className="text-decoration-none text-secondary">Viva Hub</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">Viva Transcript Review</li>
        </ol>
      </nav>

      {/* Score Header Card */}
      <div className="card workbench-card rounded-4 border-0 shadow-lg p-4 p-md-5 mb-4 text-center">
        <span className="badge bg-warning bg-opacity-10 text-warning border rounded-pill px-3 py-1 font-monospace extra-small mb-3">
          VIVA COMPLETED • {session.student_name || 'Student'}
        </span>
        <div className="display-4 fw-bold font-monospace text-primary mb-1">
          {stats.percentage}%
        </div>
        <div className={`h6 fw-semibold font-monospace ${stats.perf_class} mb-4`}>
          Overall Evaluation: {stats.perf_label} ({stats.total_score} / {stats.max_score} Points)
        </div>
      </div>

      {/* Question & Answer Transcript Stream */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <h2 className="h6 fw-bold font-monospace mb-4 border-bottom pb-2">
          <i className="bi bi-journal-check me-1 text-primary"></i> Viva Transcript &amp; Concept Evaluation
        </h2>

        <div className="d-flex flex-column gap-4">
          {replies.map((item, idx) => (
            <div key={idx} className="p-4 rounded-3 border bg-body">
              <div className="fw-bold font-monospace extra-small text-primary mb-2">Question {idx + 1}</div>
              <h3 className="h6 fw-bold text-body font-sans mb-3">{item.question}</h3>

              <div className="p-3 rounded bg-body-tertiary border mb-3 font-monospace extra-small">
                <strong className="text-secondary d-block mb-1">Your Oral Answer:</strong>
                <span className="text-body">{item.student_answer || 'No answer provided'}</span>
              </div>

              {item.evaluation && (
                <div className="p-3 rounded bg-primary bg-opacity-10 border border-primary border-opacity-25 font-monospace extra-small text-body">
                  <strong className="text-primary d-block mb-1"><i className="bi bi-robot me-1"></i> AI Examiner Feedback &amp; Gap Analysis:</strong>
                  <div style={{ whiteSpace: 'pre-line' }}>{item.evaluation}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex justify-content-between mb-5">
        <Link to="/viva" className="btn btn-outline-secondary font-monospace extra-small px-4 rounded-3">
          <i className="bi bi-arrow-left me-1"></i> Return to Viva Hub
        </Link>
      </div>
    </div>
  );
}
