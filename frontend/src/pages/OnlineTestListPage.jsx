import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function OnlineTestListPage() {
  const [documents, setDocuments] = useState([]);
  const [tests, setTests] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTests();
  }, []);

  const fetchTests = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/online-tests');
      if (res.data.ok) {
        setDocuments(res.data.documents || []);
        setTests(res.data.tests || []);
        setAttempts(res.data.attempts || []);
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
        <div className="mt-2 text-muted font-monospace extra-small">Loading Online Test Hub...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold mb-1 font-monospace">Online MCQ Examination Hub</h2>
          <p className="text-muted extra-small font-monospace mb-0">RAG-powered multiple choice examination suite.</p>
        </div>
      </div>

      <div className="row g-4 mb-4">
        {/* Create Test from Documents */}
        <div className="col-lg-6">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 h-100">
            <h3 className="h6 fw-bold font-monospace text-primary mb-3 border-bottom pb-2">
              <i className="bi bi-plus-circle-fill me-1"></i> Generate Test from Study Notes
            </h3>

            {documents.length > 0 ? (
              <div className="d-flex flex-column gap-2">
                {documents.map((d) => (
                  <div key={d.id} className="p-3 rounded-3 border bg-body d-flex align-items-center justify-content-between font-monospace extra-small">
                    <div>
                      <div className="fw-bold text-body">{d.original_name}</div>
                      <div className="text-muted extra-small">{d.word_count} words • {d.page_count} pages</div>
                    </div>
                    <Link to={`/online-test/setup/${d.id}`} className="btn btn-sm btn-primary rounded-3">
                      Configure Exam &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 text-muted font-monospace extra-small">
                No documents uploaded yet. <Link to="/upload">Upload notes</Link> first.
              </div>
            )}
          </div>
        </div>

        {/* Existing Tests */}
        <div className="col-lg-6">
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 h-100">
            <h3 className="h6 fw-bold font-monospace text-success mb-3 border-bottom pb-2">
              <i className="bi bi-card-checklist me-1"></i> Available Online Tests
            </h3>

            {tests.length > 0 ? (
              <div className="d-flex flex-column gap-2">
                {tests.map((t) => (
                  <div key={t.id} className="p-3 rounded-3 border bg-body d-flex align-items-center justify-content-between font-monospace extra-small">
                    <div>
                      <div className="fw-bold text-body">{t.title}</div>
                      <div className="text-muted extra-small">{t.total_questions} Qs • {t.time_per_question}s / Q • Topic: {t.topic}</div>
                    </div>
                    <Link to={`/online-test/setup/test/${t.id}`} className="btn btn-sm btn-success rounded-3 fw-bold">
                      Start Test &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-5 text-muted font-monospace extra-small">
                No generated tests yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
