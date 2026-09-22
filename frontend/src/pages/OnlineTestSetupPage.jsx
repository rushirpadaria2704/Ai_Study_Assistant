import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';

export default function OnlineTestSetupPage() {
  const { docId, testId } = useParams();
  const navigate = useNavigate();

  const [document, setDocument] = useState(null);
  const [test, setTest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const [numQuestions, setNumQuestions] = useState(15);
  const [timePerQuestion, setTimePerQuestion] = useState(30);
  const [difficulty, setDifficulty] = useState('mixed');
  const [overrideTimePerQ, setOverrideTimePerQ] = useState(30);

  useEffect(() => {
    fetchData();
  }, [docId, testId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (testId) {
        const res = await axios.get(`/api/online-test/${testId}`);
        if (res.data.ok) {
          setTest(res.data.test);
          setDocument(res.data.document);
          setOverrideTimePerQ(res.data.test.time_per_question || 30);
        }
      } else if (docId) {
        const res = await axios.get(`/api/online-test/setup/${docId}`);
        if (res.data.ok) {
          setDocument(res.data.document);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTest = async (e) => {
    e.preventDefault();
    if (!docId) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await axios.post(`/api/online-test/setup/${docId}`, {
        num_questions: parseInt(numQuestions, 10),
        time_per_question: parseInt(timePerQuestion, 10),
        difficulty: difficulty
      });
      if (res.data.ok) {
        setTest(res.data.test);
        setOverrideTimePerQ(res.data.test.time_per_question || timePerQuestion);
        navigate(`/online-test/setup/test/${res.data.test_id}`, { replace: true });
      } else {
        setError(res.data.error || 'Failed to generate online test.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleStartExam = async (e) => {
    e.preventDefault();
    if (!test) return;
    setStarting(true);
    setError(null);
    try {
      const res = await axios.post(`/api/online-test/${test.id}/start`, {
        time_per_question: parseInt(overrideTimePerQ, 10)
      });
      if (res.data.ok && res.data.attempt_id) {
        navigate(`/online-test/runner/${res.data.attempt_id}`);
      } else {
        setError(res.data.error || 'Could not start exam attempt.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Exam Setup...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0 font-monospace extra-small">
          <li className="breadcrumb-item"><Link to="/" className="text-decoration-none text-secondary">Home</Link></li>
          <li className="breadcrumb-item"><Link to="/online-test" className="text-decoration-none text-secondary">Online Tests</Link></li>
          <li className="breadcrumb-item active text-body fw-semibold" aria-current="page">Exam Setup</li>
        </ol>
      </nav>

      {error && (
        <div className="alert alert-danger font-monospace extra-small rounded-3 mb-4">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>{error}
        </div>
      )}

      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card workbench-card rounded-4 border-0 shadow-lg overflow-hidden">
            <div className="card-header bg-primary bg-opacity-10 py-4 px-4 border-bottom border-primary border-opacity-10 text-center">
              <i className="bi bi-sliders fs-2 text-primary d-block mb-2"></i>
              <h1 className="h4 fw-bold text-body mb-1 font-monospace">Online MCQ Test Configuration</h1>
              <p className="text-muted extra-small font-monospace mb-0">
                Configure exam parameters. Questions will be generated using RAG vector chunks.
              </p>
            </div>

            <div className="card-body p-4 p-md-5">
              {!test && document && (
                <form onSubmit={handleGenerateTest}>
                  <div className="mb-4">
                    <label className="form-label extra-small font-monospace text-secondary fw-bold">SELECTED_STUDY_MATERIAL</label>
                    <div className="p-3 rounded-3 border bg-body d-flex align-items-center justify-content-between font-monospace extra-small">
                      <span className="fw-bold">{document.original_name}</span>
                      <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1">RAG Ready</span>
                    </div>
                  </div>

                  <div className="row g-4 mb-4">
                    <div className="col-md-6">
                      <label className="form-label extra-small font-monospace text-secondary fw-bold">QUESTION_COUNT</label>
                      <select className="form-select font-monospace extra-small rounded-3 py-2" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)}>
                        <option value="15">15 Questions (Standard Exam)</option>
                        <option value="10">10 Questions (Quick Quiz)</option>
                        <option value="20">20 Questions (Comprehensive Test)</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label extra-small font-monospace text-secondary fw-bold">TIMER_PER_QUESTION</label>
                      <select className="form-select font-monospace extra-small rounded-3 py-2" value={timePerQuestion} onChange={(e) => setTimePerQuestion(e.target.value)}>
                        <option value="15">15 Seconds (Speed Blitz)</option>
                        <option value="30">30 Seconds (Standard)</option>
                        <option value="45">45 Seconds (Relaxed)</option>
                        <option value="60">60 Seconds (Deep Conceptual)</option>
                      </select>
                    </div>
                  </div>

                  <button type="submit" disabled={generating} className="btn gradient-btn-emerald w-100 py-3 rounded-3 fw-bold font-monospace extra-small shadow-sm d-flex align-items-center justify-content-center gap-2">
                    {generating ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-magic fs-5"></i>}
                    <span>GENERATE_RAG_MCQ_EXAM</span>
                  </button>
                </form>
              )}

              {test && (
                <form onSubmit={handleStartExam}>
                  <div className="p-4 rounded-4 border bg-body mb-4 text-center font-monospace">
                    <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 rounded-pill px-3 py-1 extra-small mb-2">Test Ready</span>
                    <h2 className="h5 fw-bold text-body mb-1">{test.title}</h2>
                    <p className="text-muted extra-small mb-0">Topic: {test.topic}</p>
                  </div>

                  <div className="mb-4">
                    <label className="form-label extra-small font-monospace text-secondary fw-bold">ADJUST_TIMER_BEFORE_STARTING (OPTIONAL)</label>
                    <select className="form-select font-monospace extra-small rounded-3 py-2" value={overrideTimePerQ} onChange={(e) => setOverrideTimePerQ(e.target.value)}>
                      <option value="15">15 Seconds per question</option>
                      <option value="30">30 Seconds per question</option>
                      <option value="45">45 Seconds per question</option>
                      <option value="60">60 Seconds per question</option>
                    </select>
                  </div>

                  <button type="submit" disabled={starting} className="btn gradient-btn-emerald w-100 py-3 rounded-3 fw-bold font-monospace extra-small shadow-sm d-flex align-items-center justify-content-center gap-2">
                    {starting ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-play-circle-fill fs-5"></i>}
                    <span>START_EXAM_NOW</span>
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
