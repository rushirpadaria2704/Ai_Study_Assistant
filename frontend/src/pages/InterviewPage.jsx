import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function InterviewPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [interviewData, setInterviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchInterview();
  }, [id]);

  const fetchInterview = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/interview/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setInterviewData(res.data.interview_data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`/api/interview/${id}`);
      if (res.data.ok) {
        setInterviewData(res.data.interview_data);
      }
    } catch (e) {
      alert('Error generating interview set');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Interview Preparation Module...</div>
      </div>
    );
  }

  const questions = interviewData?.questions || [];

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">Interview Practice</li>
        </ol>
      </nav>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="badge bg-info bg-opacity-10 text-info font-monospace extra-small mb-1">
              <i className="bi bi-briefcase-fill me-1"></i> INTERVIEW QUESTION GENERATOR
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">{doc?.original_name}</h1>
          </div>
          <button type="button" disabled={generating} className="btn gradient-btn-emerald font-monospace extra-small px-4 py-2 rounded-3 fw-bold shadow-sm" onClick={handleGenerate}>
            {generating ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-magic fs-5 me-1"></i>}
            <span>GENERATE_INTERVIEW_QUESTIONS</span>
          </button>
        </div>
      </div>

      {questions.length > 0 ? (
        <div className="d-flex flex-column gap-4 mb-5">
          {questions.map((q, idx) => (
            <div key={idx} className="card workbench-card rounded-4 border-0 shadow-sm p-4">
              <div className="fw-bold font-monospace extra-small text-info mb-2">Technical Interview Q{idx + 1}</div>
              <h2 className="h6 fw-bold text-body mb-3 font-sans lh-base">{q.question}</h2>
              <div className="p-3 rounded bg-body border border-secondary border-opacity-15 extra-small text-secondary font-monospace">
                <strong className="text-body d-block mb-1">Model Answer / Key Points:</strong>
                {q.answer || q.model_answer}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-5 text-center text-muted font-monospace extra-small">
          <i className="bi bi-briefcase fs-1 d-block mb-3 text-info"></i>
          No interview set generated. Click <strong>GENERATE_INTERVIEW_QUESTIONS</strong>.
        </div>
      )}
    </div>
  );
}
