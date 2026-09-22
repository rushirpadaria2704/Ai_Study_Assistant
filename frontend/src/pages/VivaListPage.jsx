import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function VivaListPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState('');
  const [studentName, setStudentName] = useState('');
  const [numQuestions, setNumQuestions] = useState(5);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    fetchVivaData();
  }, []);

  const fetchVivaData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/viva');
      if (res.data.ok) {
        setDocuments(res.data.documents || []);
        setSessions(res.data.sessions || []);
        if (res.data.documents && res.data.documents.length > 0) {
          setSelectedDocId(res.data.documents[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStartViva = async (e) => {
    e.preventDefault();
    if (!selectedDocId) return;

    setStarting(true);
    try {
      const res = await axios.post(`/api/viva/start/${selectedDocId}`, {
        student_name: studentName,
        num_questions: parseInt(numQuestions, 10)
      });
      if (res.data.ok && res.data.session_id) {
        navigate(`/viva/session/${res.data.session_id}`);
      } else {
        alert('Could not start viva: ' + (res.data.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Error starting viva: ' + err.message);
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Oral Viva Voce Hub...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <h2 className="fw-bold mb-4 font-monospace">Oral Viva Voce Hub</h2>

      <div className="row g-4 mb-5">
        {/* Setup Card */}
        <div className="col-lg-6">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 h-100">
            <h3 className="h6 fw-bold font-monospace text-warning mb-3 border-bottom pb-2">
              <i className="bi bi-mic-fill me-1"></i> Launch New Oral Viva Session
            </h3>

            <form onSubmit={handleStartViva}>
              <div className="mb-3">
                <label className="form-label extra-small font-monospace text-secondary fw-bold">SELECT_STUDY_MATERIAL</label>
                <select className="form-select font-monospace extra-small rounded-3 py-2" value={selectedDocId} onChange={(e) => setSelectedDocId(e.target.value)}>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>{d.original_name}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <label className="form-label extra-small font-monospace text-secondary fw-bold">STUDENT_NAME (OPTIONAL)</label>
                <input type="text" className="form-control font-monospace extra-small rounded-3 py-2" placeholder="e.g. Alex Smith" value={studentName} onChange={(e) => setStudentName(e.target.value)} />
              </div>

              <div className="mb-4">
                <label className="form-label extra-small font-monospace text-secondary fw-bold">QUESTION_COUNT</label>
                <select className="form-select font-monospace extra-small rounded-3 py-2" value={numQuestions} onChange={(e) => setNumQuestions(e.target.value)}>
                  <option value="3">3 Questions (Speed Viva)</option>
                  <option value="5">5 Questions (Standard Viva)</option>
                  <option value="10">10 Questions (Comprehensive Viva)</option>
                </select>
              </div>

              <button type="submit" disabled={starting || !selectedDocId} className="btn gradient-btn-emerald w-100 py-3 rounded-3 fw-bold font-monospace extra-small shadow-sm d-flex align-items-center justify-content-center gap-2">
                {starting ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-play-circle-fill fs-5"></i>}
                <span>START_ORAL_VIVA_NOW</span>
              </button>
            </form>
          </div>
        </div>

        {/* Previous Viva Sessions */}
        <div className="col-lg-6">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 h-100">
            <h3 className="h6 fw-bold font-monospace text-body mb-3 border-bottom pb-2">
              <i className="bi bi-clock-history me-1 text-primary"></i> Viva History &amp; Reviews
            </h3>

            {sessions.length > 0 ? (
              <div className="d-flex flex-column gap-2">
                {sessions.map((s) => (
                  <div key={s.id} className="p-3 rounded-3 border bg-body d-flex align-items-center justify-content-between font-monospace extra-small">
                    <div>
                      <div className="fw-bold text-body">{s.document_name || `Session #${s.id}`}</div>
                      <div className="text-muted extra-small">{s.student_name ? `Student: ${s.student_name} • ` : ''}{s.created_at ? s.created_at.slice(0, 10) : ''}</div>
                    </div>
                    <Link to={`/viva/review/${s.id}`} className="btn btn-sm btn-outline-primary rounded-3">
                      Review Transcript &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 text-muted font-monospace extra-small">
                No previous viva sessions found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
