import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a PDF, TXT, or MD file to upload.');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('document', file);

    try {
      const res = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.ok && res.data.doc_id) {
        navigate(`/document/${res.data.doc_id}`);
      } else {
        setError(res.data.error || 'Failed to upload document.');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container-fluid px-0">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card workbench-card rounded-4 border-0 shadow-lg overflow-hidden">
            <div className="card-header bg-success bg-opacity-10 py-4 px-4 border-bottom border-success border-opacity-10 text-center">
              <div className="icon-box bg-success bg-opacity-15 text-success mx-auto mb-3 d-flex align-items-center justify-content-center" style={{ width: '56px', height: '56px', borderRadius: '14px' }}>
                <i className="bi bi-cloud-upload-fill fs-2"></i>
              </div>
              <h1 className="h4 fw-bold text-body mb-1 font-monospace">Upload Study Material</h1>
              <p className="text-muted extra-small font-monospace mb-0">
                Upload your course notes, textbooks, or slides (PDF, TXT, MD) up to 50 MB.
              </p>
            </div>

            <div className="card-body p-4 p-md-5">
              {error && (
                <div className="alert alert-danger font-monospace extra-small rounded-3 mb-4 d-flex align-items-center justify-content-between">
                  <span><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</span>
                  <button type="button" className="btn-close" onClick={() => setError(null)}></button>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div
                  className={`upload-zone p-5 mb-4 rounded-4 border-2 text-center ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('fileInput').click()}
                >
                  <input
                    type="file"
                    id="fileInput"
                    className="d-none"
                    accept=".pdf,.txt,.md"
                    onChange={handleFileChange}
                  />

                  <i className="bi bi-file-earmark-arrow-up fs-1 text-success mb-3 d-block"></i>

                  {file ? (
                    <div>
                      <div className="fw-bold font-monospace text-body fs-5 mb-1">{file.name}</div>
                      <div className="extra-small font-monospace text-muted">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB • Ready to ingest
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="fw-semibold font-monospace text-body mb-1">Drag and drop your document here</div>
                      <div className="extra-small font-monospace text-muted">or click to browse from your computer</div>
                      <div className="mt-3 badge bg-body text-secondary border font-monospace extra-small">PDF • TXT • MD (Max 50MB)</div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="btn gradient-btn-emerald w-100 py-3 rounded-3 fw-bold font-monospace extra-small shadow-sm d-flex align-items-center justify-content-center gap-2"
                >
                  {uploading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      <span>PARSING_TEXT_AND_GENERATING_FAISS_EMBEDDINGS...</span>
                    </>
                  ) : (
                    <>
                      <i className="bi bi-lightning-charge-fill fs-5"></i>
                      <span>START_RAG_INDEXING</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
