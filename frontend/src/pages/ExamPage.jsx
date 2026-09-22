import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';

export default function ExamPage() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [examData, setExamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchExam();
  }, [id]);

  const fetchExam = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/exam/${id}`);
      if (res.data.ok) {
        setDoc(res.data.document);
        setExamData(res.data.exam_data);
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
      const res = await axios.post(`/api/exam/${id}`);
      if (res.data.ok) {
        setExamData(res.data.exam_data);
      }
    } catch (e) {
      alert('Error generating exam paper');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Exam Paper Generator...</div>
      </div>
    );
  }

  const sections = examData?.sections || [];

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/dashboard" className="text-decoration-none text-secondary">Dashboard</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">AI Exam Paper</li>
        </ol>
      </nav>

      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div>
            <span className="badge bg-danger bg-opacity-10 text-danger font-monospace extra-small mb-1">
              <i className="bi bi-card-checklist me-1"></i> UNIVERSITY EXAM PAPER GENERATOR
            </span>
            <h1 className="h5 fw-bold text-body font-monospace mb-0">{doc?.original_name}</h1>
          </div>
          <button type="button" disabled={generating} className="btn gradient-btn-emerald font-monospace extra-small px-4 py-2 rounded-3 fw-bold shadow-sm" onClick={handleGenerate}>
            {generating ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-magic fs-5 me-1"></i>}
            <span>GENERATE_EXAM_PAPER</span>
          </button>
        </div>
      </div>

      {sections.length > 0 ? (
        <div className="d-flex flex-column gap-4 mb-5">
          {sections.map((sec, sIdx) => (
            <div key={sIdx} className="card workbench-card rounded-4 border-0 shadow-sm p-4">
              <h2 className="h6 fw-bold font-monospace text-danger mb-3 border-bottom pb-2">
                {sec.title || `Section ${sIdx + 1}`} ({sec.instructions || 'Answer all questions'})
              </h2>
              <div className="d-flex flex-column gap-3">
                {sec.questions?.map((q, qIdx) => (
                  <div key={qIdx} className="p-3 rounded bg-body border border-secondary border-opacity-15 font-sans extra-small">
                    <div className="fw-bold text-body mb-1">{qIdx + 1}. {q.text || q.question}</div>
                    <div className="text-muted extra-small font-monospace">Marks: {q.marks || 5}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card workbench-card rounded-4 border-0 shadow-sm p-5 text-center text-muted font-monospace extra-small">
          <i className="bi bi-file-earmark-diff fs-1 d-block mb-3 text-danger"></i>
          No exam paper generated. Click <strong>GENERATE_EXAM_PAPER</strong>.
        </div>
      )}
    </div>
  );
}
