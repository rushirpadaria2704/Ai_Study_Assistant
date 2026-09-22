import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function SettingsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [togglingAdvanced, setTogglingAdvanced] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);

  const [defaultModel, setDefaultModel] = useState('');
  const [maxTokens, setMaxTokens] = useState('1024');
  const [enableOpencv, setEnableOpencv] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [cfgId, setCfgId] = useState('');
  const [cfgName, setCfgName] = useState('');
  const [cfgProviderType, setCfgProviderType] = useState('gemini');
  const [cfgBaseUrl, setCfgBaseUrl] = useState('');
  const [cfgModelName, setCfgModelName] = useState('');
  const [cfgApiKey, setCfgApiKey] = useState('');
  const [cfgPriority, setCfgPriority] = useState(0);
  const [cfgIsActive, setCfgIsActive] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [savingIntegration, setSavingIntegration] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/settings');
      if (res.data.ok) {
        setData(res.data);
        const g = res.data.general || {};
        setDefaultModel(g.default_model || '');
        setMaxTokens(g.max_tokens_per_request || '1024');
        setEnableOpencv(!!g.enable_opencv_processing);
      }
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAdvanced = async () => {
    setTogglingAdvanced(true);
    try {
      const newStatus = !data?.advanced_mode;
      await axios.post('/api/settings/advanced', { enabled: newStatus });
      await fetchSettings();
      setAlertMsg({ type: 'success', text: `Advanced mode ${newStatus ? 'enabled' : 'disabled'}.` });
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    } finally {
      setTogglingAdvanced(false);
    }
  };

  const handleSaveGeneral = async (e) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await axios.post('/api/settings', {
        default_model: defaultModel,
        max_tokens_per_request: maxTokens,
        enable_opencv_processing: enableOpencv
      });
      setAlertMsg({ type: 'success', text: 'General settings saved successfully.' });
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    } finally {
      setSavingGeneral(false);
    }
  };

  const defaultMeta = {
    gemini: { label: 'Google Gemini', default_base_url: 'https://generativelanguage.googleapis.com/v1beta', default_model: 'gemini-1.5-flash' },
    openai: { label: 'OpenAI', default_base_url: 'https://api.openai.com/v1', default_model: 'gpt-3.5-turbo' },
    anthropic: { label: 'Anthropic Claude', default_base_url: 'https://api.anthropic.com/v1', default_model: 'claude-3-haiku-20240307' },
    custom: { label: 'Custom Endpoint', default_base_url: 'http://localhost:8080/v1', default_model: 'default-model' }
  };

  const providerMeta = data?.provider_types || defaultMeta;

  const handleProviderChange = (type) => {
    setCfgProviderType(type);
    const meta = providerMeta[type] || {};
    if (meta.default_base_url) setCfgBaseUrl(meta.default_base_url);
    if (meta.default_model) setCfgModelName(meta.default_model);
  };

  const openAddModal = () => {
    setModalMode('add');
    setCfgId('');
    setCfgName('');
    setCfgProviderType('gemini');
    const meta = providerMeta['gemini'] || defaultMeta.gemini;
    setCfgBaseUrl(meta.default_base_url);
    setCfgModelName(meta.default_model);
    setCfgApiKey('');
    setCfgPriority(0);
    setCfgIsActive(false);
    setTestResult(null);
    setShowModal(true);
  };

  const openEditModal = async (configId) => {
    setModalMode('edit');
    setTestResult(null);
    try {
      const res = await axios.get(`/api/settings/api-configs/${configId}`);
      if (res.data.config) {
        const c = res.data.config;
        setCfgId(c.id);
        setCfgName(c.provider_name);
        setCfgProviderType(c.provider_type);
        setCfgBaseUrl(c.base_url);
        setCfgModelName(c.model_name);
        setCfgApiKey(c.api_key || '');
        setCfgPriority(c.priority || 0);
        setCfgIsActive(!!c.is_active);
        setShowModal(true);
      }
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        provider_name: cfgName || 'Test Integration',
        provider_type: cfgProviderType,
        base_url: cfgBaseUrl,
        model_name: cfgModelName,
        api_key: cfgApiKey,
        priority: parseInt(cfgPriority || 0, 10),
        is_active: cfgIsActive
      };
      const res = await axios.post('/api/settings/api-configs/test', payload);
      if (res.data.ok) {
        setTestResult({
          success: true,
          message: `Connection successful ${res.data.latency_ms ? `(${res.data.latency_ms} ms)` : ''}`
        });
      } else {
        setTestResult({ success: false, message: res.data.error || 'Connection failed' });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveIntegration = async (e) => {
    e.preventDefault();
    setSavingIntegration(true);
    try {
      const payload = {
        provider_name: cfgName,
        provider_type: cfgProviderType,
        base_url: cfgBaseUrl,
        model_name: cfgModelName,
        api_key: cfgApiKey,
        priority: parseInt(cfgPriority || 0, 10),
        is_active: cfgIsActive
      };

      if (modalMode === 'edit' && cfgId) {
        await axios.put(`/api/settings/api-configs/${cfgId}`, payload);
      } else {
        await axios.post('/api/settings/api-configs', payload);
      }
      setShowModal(false);
      await fetchSettings();
      setAlertMsg({ type: 'success', text: 'API Integration saved successfully.' });
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.error || err.message });
    } finally {
      setSavingIntegration(false);
    }
  };

  const handleActivateIntegration = async (configId) => {
    if (!window.confirm('Activate this provider? It will become the default for all LLM requests.')) return;
    try {
      await axios.post(`/api/settings/api-configs/${configId}/activate`);
      await fetchSettings();
      setAlertMsg({ type: 'success', text: 'Provider activated.' });
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    }
  };

  const handleDeleteIntegration = async (configId, name) => {
    if (!window.confirm(`Delete integration "${name}"? This cannot be undone.`)) return;
    try {
      await axios.delete(`/api/settings/api-configs/${configId}`);
      await fetchSettings();
      setAlertMsg({ type: 'success', text: 'Integration deleted.' });
    } catch (err) {
      setAlertMsg({ type: 'danger', text: err.response?.data?.error || err.message });
    }
  };

  if (loading) {
    return (
      <div className="container-fluid px-0 text-center py-5">
        <div className="spinner-border text-primary" role="status"></div>
        <div className="mt-2 text-muted font-monospace extra-small">Loading Settings...</div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-0">
      <div className="d-flex align-items-center justify-content-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="fw-bold mb-1 font-monospace">Settings</h2>
          <p className="text-muted extra-small font-monospace mb-0">
            Configure application settings and AI API integrations.
            {data?.advanced_mode && <span className="badge bg-warning text-dark ms-2">Advanced Mode Active</span>}
          </p>
        </div>

        <button type="button" disabled={togglingAdvanced} className="btn btn-outline-primary rounded-3 font-monospace extra-small shadow-sm" onClick={handleToggleAdvanced}>
          <i className="bi bi-gear-wide-connected me-1"></i>
          {data?.advanced_mode ? 'Disable Advanced Mode' : 'Enable Advanced Mode'}
        </button>
      </div>

      {alertMsg && (
        <div className={`alert alert-${alertMsg.type} font-monospace extra-small rounded-3 mb-4 d-flex align-items-center justify-content-between`}>
          <span>{alertMsg.text}</span>
          <button type="button" className="btn-close" onClick={() => setAlertMsg(null)}></button>
        </div>
      )}

      <div className="row">
        <div className="col-lg-8 mx-auto">
          {/* General Settings */}
          <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
            <h4 className="h6 fw-bold font-monospace mb-3 border-bottom pb-2">
              <i className="bi bi-sliders text-primary me-2"></i> General Settings
            </h4>
            <form onSubmit={handleSaveGeneral}>
              <div className="mb-3">
                <label className="form-label extra-small font-monospace text-secondary fw-bold">DEFAULT_MODEL</label>
                <input type="text" className="form-control rounded-2 font-monospace extra-small" value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="e.g. gemini-1.5-flash" />
              </div>

              <div className="mb-3">
                <label className="form-label extra-small font-monospace text-secondary fw-bold">MAX_TOKENS_PER_REQUEST</label>
                <select className="form-select rounded-2 font-monospace extra-small" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)}>
                  {['256', '512', '1024', '2048', '4096', '8192'].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              <div className="d-flex justify-content-end">
                <button type="submit" disabled={savingGeneral} className="btn btn-primary rounded-3 px-4 shadow-sm font-monospace extra-small">
                  {savingGeneral ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="bi bi-save me-1"></i>} Save General Settings
                </button>
              </div>
            </form>
          </div>

          {/* Advanced Integrations */}
          {data?.advanced_mode && (
            <div className="card workbench-card rounded-4 border-0 shadow-sm p-4 mb-4">
              <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                <h4 className="h6 fw-bold font-monospace mb-0 text-warning">
                  <i className="bi bi-lightning-charge me-2"></i> Custom AI API Integrations
                </h4>
                <button type="button" className="btn btn-sm btn-success rounded-3 font-monospace extra-small" onClick={openAddModal}>
                  <i className="bi bi-plus-lg me-1"></i> Add API Integration
                </button>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle font-monospace extra-small">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Model</th>
                      <th>Status</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.api_configs && data.api_configs.length > 0 ? (
                      data.api_configs.map((cfg) => (
                        <tr key={cfg.id}>
                          <td className="fw-semibold">{cfg.provider_name}</td>
                          <td><span className="badge rounded-pill text-bg-light border">{cfg.provider_type}</span></td>
                          <td className="text-muted">{cfg.model_name}</td>
                          <td>
                            {cfg.is_active ? <span className="badge bg-success-subtle text-success rounded-pill">Active</span> : <span className="badge bg-secondary-subtle text-secondary rounded-pill">Inactive</span>}
                          </td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm">
                              {!cfg.is_active && (
                                <button type="button" className="btn btn-outline-success" onClick={() => handleActivateIntegration(cfg.id)}>
                                  <i className="bi bi-check2"></i>
                                </button>
                              )}
                              <button type="button" className="btn btn-outline-primary" onClick={() => openEditModal(cfg.id)}>
                                <i className="bi bi-pencil"></i>
                              </button>
                              <button type="button" className="btn btn-outline-danger" onClick={() => handleDeleteIntegration(cfg.id, cfg.provider_name)}>
                                <i className="bi bi-trash"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="text-center py-4 text-muted">No custom integrations. Click <strong>Add API Integration</strong>.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content rounded-4 border-0 shadow-lg font-monospace extra-small">
              <form onSubmit={handleSaveIntegration}>
                <div className="modal-header border-0">
                  <h5 className="modal-title fw-bold">{modalMode === 'edit' ? 'Edit API Integration' : 'Add API Integration'}</h5>
                  <button type="button" className="btn-close" onClick={() => setShowModal(false)}></button>
                </div>
                <div className="modal-body p-4">
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-bold text-secondary">PROVIDER_TYPE</label>
                      <select className="form-select rounded-2" value={cfgProviderType} onChange={(e) => handleProviderChange(e.target.value)}>
                        {Object.keys(providerMeta).map((k) => (
                          <option key={k} value={k}>{providerMeta[k].label || k}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label fw-bold text-secondary">DISPLAY_NAME</label>
                      <input type="text" className="form-control rounded-2" value={cfgName} onChange={(e) => setCfgName(e.target.value)} required placeholder="e.g. My Gemini API" />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label fw-bold text-secondary">API_ENDPOINT_URL</label>
                      <input type="url" className="form-control rounded-2" value={cfgBaseUrl} onChange={(e) => setCfgBaseUrl(e.target.value)} required />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label fw-bold text-secondary">MODEL_NAME</label>
                      <input type="text" className="form-control rounded-2" value={cfgModelName} onChange={(e) => setCfgModelName(e.target.value)} required />
                    </div>
                    <div className="col-12">
                      <label className="form-label fw-bold text-secondary">API_KEY</label>
                      <div className="input-group">
                        <input type={showApiKey ? 'text' : 'password'} className="form-control rounded-2" value={cfgApiKey} onChange={(e) => setCfgApiKey(e.target.value)} />
                        <button type="button" className="btn btn-outline-secondary" onClick={() => setShowApiKey(!showApiKey)}>
                          <i className={`bi ${showApiKey ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                        </button>
                        <button type="button" disabled={testing} className="btn btn-outline-secondary" onClick={handleTestConnection}>
                          {testing ? <span className="spinner-border spinner-border-sm me-1"></span> : null} Test Connection
                        </button>
                      </div>
                      {testResult && (
                        <div className={`mt-2 alert alert-${testResult.success ? 'success' : 'danger'} rounded-3 mb-0`}>
                          {testResult.message}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer border-0">
                  <button type="button" className="btn btn-light rounded-3" onClick={() => setShowModal(false)}>Cancel</button>
                  <button type="submit" disabled={savingIntegration} className="btn btn-primary rounded-3 px-4 shadow-sm fw-bold">
                    {savingIntegration ? <span className="spinner-border spinner-border-sm me-2"></span> : null} Save Integration
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
