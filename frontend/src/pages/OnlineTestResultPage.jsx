import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function OnlineTestResultPage() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retaking, setRetaking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResult();
  }, [attemptId]);

  const fetchResult = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/online-test/result/${attemptId}`);
      if (res.data.ok) {
        setResult(res.data.result);
      } else {
        setError(res.data.error || 'Failed to load results.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRetake = async () => {
    if (!result?.test_id) return;
    setRetaking(true);
    try {
      const res = await axios.post(`/api/online-test/${result.test_id}/start`);
      if (res.data.ok && res.data.attempt_id) {
        navigate(`/online-test/runner/${res.data.attempt_id}`);
      }
    } catch (err) {
      alert('Error restarting exam: ' + err.message);
    } finally {
      setRetaking(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Evaluating Test Performance...</div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="container-fluid px-0 py-4 font-monospace extra-small">
        <div className="alert alert-danger rounded-3"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error || 'Result record unavailable.'}</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/online-test" className="text-decoration-none text-secondary">Online Tests</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">Exam Result</li>
        </ol>
      </nav>

      {/* Score Header */}
      <div className="card workbench-card rounded-4 border-0 shadow-lg p-4 p-md-5 mb-4 text-center">
        <span className="badge bg-primary bg-opacity-10 text-primary border rounded-pill px-3 py-1 font-monospace extra-small mb-3">
          TEST COMPLETED • {result.topic}
        </span>
        <div className="display-3 fw-bold font-monospace text-primary mb-1">{result.percentage}%</div>
        <div className="h5 fw-semibold font-monospace text-body mb-4">
          Score: {result.score} / {result.total_questions} Correct
        </div>
      </div>

      {/* Question Review Stream */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <h2 className="h6 fw-bold text-body font-monospace mb-4 border-bottom pb-2">
          Detailed Question Analysis &amp; RAG Explanations
        </h2>

        <div className="d-flex flex-column gap-4 font-monospace extra-small">
          {result.review?.map((item, idx) => (
            <div key={idx} className={`p-4 rounded-3 border ${item.is_correct ? 'border-success bg-success bg-opacity-10' : 'border-danger bg-danger bg-opacity-10'}`}>
              <div className="fw-bold mb-2">{idx + 1}. {item.question_text}</div>
              <div className="mb-1">Your Choice: <strong>{item.selected_option || 'None'}</strong></div>
              <div className="mb-2 text-success">Correct Choice: <strong>{item.correct_option}</strong></div>
              {item.explanation && (
                <div className="p-3 rounded bg-body border text-secondary">
                  <strong>Explanation:</strong> {item.explanation}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="d-flex align-items-center justify-content-between mb-5 font-monospace extra-small">
        <Link to="/online-test" className="btn btn-outline-secondary px-4 rounded-3">&larr; Back to Tests</Link>
        <button type="button" disabled={retaking} className="btn gradient-btn-emerald px-4 rounded-3 fw-bold" onClick={handleRetake}>
          {retaking ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
          Retake Exam Now
        </button>
      </div>
    </div>
  );
}
