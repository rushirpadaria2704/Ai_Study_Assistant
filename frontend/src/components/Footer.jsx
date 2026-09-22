import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer py-3 border-top mt-auto bg-body-tertiary">
      <div className="container-fluid px-3 px-md-4 max-mw-7xl d-flex align-items-center justify-content-between flex-wrap gap-2 font-monospace extra-small text-muted">
        <div>
          © {new Date().getFullYear()} <strong className="text-body">AI Study Assistant</strong>. Powered by RAG &amp; LangChain.
        </div>
        <div className="d-flex align-items-center gap-3">
          <Link to="/" className="text-decoration-none text-muted hover-emerald">Home</Link>
          <Link to="/upload" className="text-decoration-none text-muted hover-emerald">Upload Notes</Link>
          <Link to="/dashboard" className="text-decoration-none text-muted hover-emerald">Dashboard</Link>
          <Link to="/settings" className="text-decoration-none text-muted hover-emerald">Settings</Link>
        </div>
      </div>
    </footer>
  );
}
