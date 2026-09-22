import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';

export default function Navbar() {
  const location = useLocation();
  const [modelInfo, setModelInfo] = useState(null);

  useEffect(() => {
    fetchModelStatus();
  }, [location.pathname]);

  const fetchModelStatus = async () => {
    try {
      const res = await axios.get('/api/settings');
      if (res.data.ok) {
        const active = res.data.active_provider;
        if (active) {
          setModelInfo(`${active.provider_name} (${active.model_name})`);
        } else {
          setModelInfo('Local Model / Configured Provider');
        }
      }
    } catch (e) {
      setModelInfo('AI Engine Connected');
    }
  };

  const isActive = (path) => {
    if (path === '/' && location.pathname === '/') return true;
    if (path !== '/' && location.pathname.startsWith(path)) return true;
    return false;
  };

  return (
    <nav className="navbar navbar-expand-lg border-bottom bg-body-tertiary sticky-top py-2">
      <div className="container-fluid px-3 px-md-4 max-mw-7xl">
        <Link className="navbar-brand d-flex align-items-center gap-2 font-monospace fw-bold" to="/">
          <div className="icon-box bg-emerald bg-opacity-15 text-success rounded-3 p-1 d-inline-flex align-items-center justify-content-center" style={{ width: '34px', height: '34px' }}>
            <i className="bi bi-cpu-fill fs-5"></i>
          </div>
          <span>AI STUDY ASSISTANT</span>
        </Link>

        <button
          className="navbar-toggler border-0"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarMain"
          aria-controls="navbarMain"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        <div className="collapse navbar-collapse" id="navbarMain">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 font-monospace extra-small">
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/') ? 'active fw-bold text-success' : ''}`} to="/">
                <i className="bi bi-house me-1"></i> Home
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/upload') ? 'active fw-bold text-success' : ''}`} to="/upload">
                <i className="bi bi-upload me-1"></i> Upload
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/dashboard') ? 'active fw-bold text-success' : ''}`} to="/dashboard">
                <i className="bi bi-speedometer2 me-1"></i> Dashboard
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/viva') ? 'active fw-bold text-success' : ''}`} to="/viva">
                <i className="bi bi-mic me-1"></i> Oral Viva
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/online-test') ? 'active fw-bold text-success' : ''}`} to="/online-test">
                <i className="bi bi-[#10b981] bi-card-checklist me-1"></i> Online MCQ Tests
              </Link>
            </li>
            <li className="nav-item">
              <Link className={`nav-link px-3 ${isActive('/settings') ? 'active fw-bold text-success' : ''}`} to="/settings">
                <i className="bi bi-sliders me-1"></i> Settings
              </Link>
            </li>
          </ul>

          <div className="d-flex align-items-center gap-2">
            {modelInfo && (
              <span className="badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 font-monospace extra-small px-3 py-1.5 rounded-pill">
                <i className="bi bi-circle-fill me-1 text-success extra-small"></i>
                {modelInfo}
              </span>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
