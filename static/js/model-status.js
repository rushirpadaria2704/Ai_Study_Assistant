/**
 * Active AI Model & API Connection Display Script
 * Manages fetching, rendering, and real-time verification of active models during generation.
 */

(function () {
    'use strict';

    // Provider Badge Configurations with Icons & Color Schemes
    const PROVIDER_THEMES = {
        gemini: {
            icon: 'bi bi-stars',
            badgeClass: 'bg-primary bg-opacity-10 text-primary border-primary border-opacity-25',
            gradient: 'linear-gradient(135deg, #4285f4 0%, #a142f4 100%)',
            label: 'Google Gemini AI'
        },
        ollama: {
            icon: 'bi bi-cpu-fill',
            badgeClass: 'bg-dark bg-opacity-10 text-dark border-dark border-opacity-25',
            gradient: 'linear-gradient(135deg, #1e293b 0%, #475569 100%)',
            label: 'Ollama (Local)'
        },
        openai: {
            icon: 'bi bi-robot',
            badgeClass: 'bg-success bg-opacity-10 text-success border-success border-opacity-25',
            gradient: 'linear-gradient(135deg, #10a37f 0%, #059669 100%)',
            label: 'OpenAI API'
        },
        anthropic: {
            icon: 'bi bi-chat-quote-fill',
            badgeClass: 'bg-warning bg-opacity-10 text-warning border-warning border-opacity-25',
            gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
            label: 'Anthropic Claude'
        },
        custom: {
            icon: 'bi bi-gear-wide-connected',
            badgeClass: 'bg-info bg-opacity-10 text-info border-info border-opacity-25',
            gradient: 'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
            label: 'Custom API Endpoint'
        }
    };

    /**
     * Fetch active models with connection validation
     */
    async function fetchActiveModels() {
        try {
            const response = await fetch('/api/models/active');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.warn('[ModelStatus] Failed to fetch active models:', err);
            return { ok: false, connected_models: [], total_count: 0 };
        }
    }

    /**
     * Force live verification of all model connections
     */
    async function verifyModels() {
        try {
            const response = await fetch('/api/models/verify', { method: 'POST' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            console.error('[ModelStatus] Verification request failed:', err);
            return { ok: false, models: [], connected_models: [], disconnected_models: [] };
        }
    }

    /**
     * Generate HTML for active model cards/pills
     */
    function buildModelCardsHtml(models, isGenerationView = true) {
        if (!models || models.length === 0) {
            return `
                <div class="alert alert-warning border-0 rounded-3 p-3 mb-0 d-flex align-items-center gap-2 extra-small">
                    <i class="bi bi-exclamation-triangle-fill text-warning fs-6"></i>
                    <span>No active API models connected. Requests will fallback to local defaults.</span>
                </div>
            `;
        }

        const cards = models.map(m => {
            const theme = PROVIDER_THEMES[m.provider_type] || PROVIDER_THEMES.custom;
            const isConnected = m.status === 'connected';
            const statusBadge = isConnected
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2 py-1 extra-small"><i class="bi bi-check-circle-fill me-1"></i>API Connected</span>`
                : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2 py-1 extra-small"><i class="bi bi-x-circle-fill me-1"></i>Disconnected</span>`;

            const activeBadge = m.is_active
                ? `<span class="badge bg-primary text-white rounded-pill px-2 py-1 extra-small ms-1">Active Engine</span>`
                : '';

            const latencyTag = isConnected && m.latency_ms
                ? `<span class="text-muted extra-small font-monospace ms-2"><i class="bi bi-stopwatch me-1"></i>${m.latency_ms}ms</span>`
                : '';

            return `
                <div class="card border-0 shadow-sm rounded-3 p-3 mb-2 bg-body-tertiary">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2.5">
                            <div class="p-2 rounded-2 text-white d-flex align-items-center justify-content-center shadow-xs"
                                 style="width:34px; height:34px; background: ${theme.gradient}">
                                <i class="${theme.icon} fs-6"></i>
                            </div>
                            <div>
                                <div class="d-flex align-items-center gap-1">
                                    <strong class="small text-body font-monospace">${m.provider_name || theme.label}</strong>
                                    ${activeBadge}
                                </div>
                                <div class="text-muted extra-small font-monospace">
                                    Model: <span class="text-body fw-semibold">${m.model_name}</span>
                                </div>
                            </div>
                        </div>
                        <div class="d-flex align-items-center gap-1">
                            ${statusBadge}
                            ${latencyTag}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="active-models-panel mt-3">
                <div class="d-flex align-items-center justify-content-between mb-2">
                    <span class="extra-small font-monospace text-uppercase text-secondary fw-semibold">
                        <i class="bi bi-cpu me-1 text-primary"></i> Active AI Models &amp; API Connections
                    </span>
                    <span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 rounded-pill px-2 py-1 extra-small font-monospace">
                        ${models.filter(m => m.status === 'connected').length} Verified Connected
                    </span>
                </div>
                <div class="models-list-container">
                    ${cards}
                </div>
            </div>
        `;
    }

    /**
     * Inject Active Model Status into Generation Loading Container
     */
    async function updateGenerationLoadingPanels() {
        const loadingContainers = document.querySelectorAll('.active-model-display-target, #loadingStateContainer, #loadingState, #chatLoadingState');
        if (!loadingContainers || loadingContainers.length === 0) return;

        const data = await fetchActiveModels();
        const connectedModels = data.connected_models && data.connected_models.length > 0
            ? data.connected_models
            : data.models || [];

        const html = buildModelCardsHtml(connectedModels, true);

        loadingContainers.forEach(container => {
            let existingPanel = container.querySelector('.active-models-panel');
            if (existingPanel) {
                existingPanel.outerHTML = html;
            } else {
                container.insertAdjacentHTML('beforeend', html);
            }
        });
    }

    /**
     * Attach generation submit listeners to toggle loading container on submit
     */
    function initGenerationFormHooks() {
        const forms = document.querySelectorAll('form');
        forms.forEach(form => {
            form.addEventListener('submit', function () {
                const loadingContainer = document.querySelector('#loadingStateContainer, #loadingState, #processingState, #loadingOverlay');
                if (loadingContainer) {
                    loadingContainer.classList.remove('d-none');
                    if (loadingContainer.id === 'loadingOverlay') {
                        loadingContainer.classList.add('active');
                    }
                }
            });
        });
    }

    /**
     * Initialize verification widget in Settings
     */
    function initVerificationWidget() {
        const verifyBtn = document.getElementById('verify-models-btn');
        const resultsContainer = document.getElementById('verification-results');
        if (!verifyBtn || !resultsContainer) return;

        verifyBtn.addEventListener('click', async function () {
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2" role="status"></span>Verifying API Connections...`;
            resultsContainer.innerHTML = `
                <div class="alert alert-info border-0 rounded-3 p-3 extra-small font-monospace d-flex align-items-center gap-2">
                    <span class="spinner-grow spinner-grow-sm text-info"></span>
                    <span>Pinging active model endpoints (Ollama, Gemini AI, OpenAI, Anthropic, Custom)...</span>
                </div>
            `;

            const res = await verifyModels();
            verifyBtn.disabled = false;
            verifyBtn.innerHTML = `<i class="bi bi-shield-check me-1"></i> Verify Model Connections`;

            if (!res.ok) {
                resultsContainer.innerHTML = `
                    <div class="alert alert-danger border-0 rounded-3 p-3 extra-small">
                        <i class="bi bi-exclamation-triangle-fill me-1"></i> Verification failed to execute.
                    </div>
                `;
                return;
            }

            const connectedList = (res.connected_models || []).map(m => `
                <div class="d-flex align-items-center justify-content-between p-2 border-bottom extra-small font-monospace">
                    <div>
                        <i class="bi bi-check-circle-fill text-success me-2"></i>
                        <strong class="text-body">${m.provider_name}</strong> (${m.model_name})
                    </div>
                    <div class="text-muted">
                        <span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill">Connected</span>
                        ${m.latency_ms ? `<span class="ms-2">${m.latency_ms}ms</span>` : ''}
                    </div>
                </div>
            `).join('');

            const disconnectedList = (res.disconnected_models || []).map(m => `
                <div class="d-flex align-items-center justify-content-between p-2 border-bottom extra-small font-monospace">
                    <div>
                        <i class="bi bi-x-circle-fill text-danger me-2"></i>
                        <strong class="text-body">${m.provider_name}</strong> (${m.model_name})
                    </div>
                    <div class="text-danger">
                        <span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill">Disconnected</span>
                        <span class="ms-2 extra-small text-muted">${m.error || 'Connection failed'}</span>
                    </div>
                </div>
            `).join('');

            resultsContainer.innerHTML = `
                <div class="card border-0 shadow-sm rounded-3 overflow-hidden">
                    <div class="card-header bg-light py-2 px-3 d-flex align-items-center justify-content-between extra-small font-monospace fw-bold">
                        <span><i class="bi bi-clipboard-check text-primary me-1"></i> VERIFICATION SUMMARY (${res.timestamp})</span>
                        <span class="badge bg-primary text-white rounded-pill">${res.connected_count} / ${res.total_models} Connected</span>
                    </div>
                    <div class="card-body p-3">
                        ${connectedList || '<div class="text-muted extra-small p-2">No connected models found.</div>'}
                        ${disconnectedList}
                    </div>
                </div>
            `;
        });
    }

    // Auto-initialize when DOM is loaded
    document.addEventListener('DOMContentLoaded', function () {
        initGenerationFormHooks();
        initVerificationWidget();
    });

    // Expose global namespace helper for manual calls
    window.ModelStatus = {
        fetchActiveModels,
        verifyModels,
        buildModelCardsHtml
    };
})();
