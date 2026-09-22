import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

export default function DashboardPage() {
  const [documents, setDocuments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/dashboard');
      if (res.data.ok) {
        setDocuments(res.data.documents || []);
        setStats(res.data.stats || {});
      }
    } catch (err) {
      console.error('Failed to fetch dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!window.confirm('Are you sure you want to delete this document and all related indexes?')) return;
    setDeletingId(docId);
    try {
      await axios.post(`/api/documents/${docId}/delete`);
      await fetchDashboard();
    } catch (err) {
      alert('Failed to delete document: ' + (err.response?.data?.error || err.message));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Analytics Dashboard...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold mb-1 font-monospace">Study Dashboard</h2>
          <p className="text-muted extra-small font-monospace mb-0">Overview of uploaded study materials and learning sessions.</p>
        </div>
        <Link to="/upload" className="btn gradient-btn-emerald font-monospace extra-small px-3 py-2 rounded-3 fw-bold d-inline-flex align-items-center gap-2">
          <i className="bi bi-plus-lg"></i> Upload New Document
        </Link>
      </div>

      {/* Metrics Row */}
      <div className="row g-3 mb-4 font-monospace extra-small">
        <div className="col-6 col-md-3">
          <div className="p-3 rounded-3 border bg-body">
            <div className="text-secondary">TOTAL DOCUMENTS</div>
            <div className="fs-4 fw-bold text-primary mt-1">{stats?.documents_count ?? 0}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="p-3 rounded-3 border bg-body">
            <div className="text-secondary">AI QUIZZES</div>
            <div className="fs-4 fw-bold text-success mt-1">{stats?.quizzes_count ?? 0}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="p-3 rounded-3 border bg-body">
            <div className="text-secondary">VIVA SESSIONS</div>
            <div className="fs-4 fw-bold text-warning mt-1">{stats?.viva_count ?? 0}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="p-3 rounded-3 border bg-body">
            <div className="text-secondary">ONLINE TESTS</div>
            <div className="fs-4 fw-bold text-info mt-1">{stats?.tests_count ?? 0}</div>
          </div>
        </div>
      </div>

      {/* Documents List */}
      <div className="card workbench-card rounded-4 border-0 shadow-sm p-4">
        <h3 className="h6 fw-bold font-monospace mb-3 border-bottom pb-2 d-flex align-items-center justify-content-between">
          <span><i className="bi bi-folder2-open me-1 text-primary"></i> Uploaded Study Materials</span>
          <span className="badge bg-body text-secondary border font-monospace extra-small">{documents.length} Files</span>
        </h3>

        {documents.length > 0 ? (
          <div className="table-responsive">
            <table className="table table-hover align-middle extra-small font-monospace">
              <thead className="table-light">
                <tr>
                  <th>Document Name</th>
                  <th>Words</th>
                  <th>Pages</th>
                  <th>Uploaded</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <Link to={`/document/${doc.id}`} className="text-decoration-none fw-bold text-body hover-emerald">
                        <i className="bi bi-file-earmark-pdf text-primary me-2 fs-5"></i>
                        {doc.original_name}
                      </Link>
                    </td>
                    <td>{doc.word_count} words</td>
                    <td>{doc.page_count} pages</td>
                    <td>{doc.uploaded_at ? doc.uploaded_at.slice(0, 10) : ''}</td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm">
                        <Link to={`/document/${doc.id}`} className="btn btn-outline-primary" title="Workbench">
                          <i className="bi bi-lightning-charge"></i>
                        </Link>
                        <Link to={`/chat/${doc.id}`} className="btn btn-outline-success" title="Chat">
                          <i className="bi bi-chat-text"></i>
                        </Link>
                        <Link to={`/quiz/${doc.id}`} className="btn btn-outline-warning" title="Quiz">
                          <i className="bi bi-question-circle"></i>
                        </Link>
                        <button
                          type="button"
                          disabled={deletingId === doc.id}
                          className="btn btn-outline-danger"
                          title="Delete"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-5 text-muted font-monospace extra-small">
            <i className="bi bi-inbox fs-2 d-block mb-2 text-secondary"></i>
            No documents uploaded yet. Click <strong>Upload New Document</strong> to get started.
          </div>
        )}
      </div>
    </div>
  );
}
