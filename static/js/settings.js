(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const modal = $("#configModal");
  const modalTitleText = $("#modal-title-text");
  const form = $("#config-form");
  const cfgId = $("#cfg-id");
  const cfgName = $("#cfg-name");
  const cfgProvider = $("#cfg-provider-type");
  const cfgBaseUrl = $("#cfg-base-url");
  const cfgModel = $("#cfg-model");
  const cfgApiKey = $("#cfg-api-key");
  const cfgPriority = $("#cfg-priority");
  const cfgIsActive = $("#cfg-is-active");
  const testResult = $("#test-result");
  const saveBtn = $("#cfg-save-btn");
  const tbody = $("#config-tbody");

  function providerDefaults() {
    const opt = cfgProvider.options[cfgProvider.selectedIndex];
    return {
      defaultBaseUrl: opt.dataset.defaultUrl,
      defaultModel: opt.dataset.defaultModel,
      optionalKey: opt.dataset.optionalKey === "1",
    };
  }

  function resetForm() {
    cfgId.value = "";
    form.reset();
    const { defaultBaseUrl, defaultModel } = providerDefaults();
    cfgBaseUrl.value = defaultBaseUrl;
    cfgModel.value = defaultModel;
    testResult.innerHTML = "";
    modalTitleText.textContent = "Add API Integration";
    saveBtn.innerHTML = '<i class="bi bi-save me-1"></i> Save Integration';
  }

  function fillForm(config) {
    cfgId.value = config.id;
    cfgName.value = config.provider_name;
    cfgProvider.value = config.provider_type;
    cfgBaseUrl.value = config.base_url;
    cfgModel.value = config.model_name;
    cfgApiKey.value = config.api_key || "";
    cfgPriority.value = config.priority || 0;
    cfgIsActive.checked = !!config.is_active;
    testResult.innerHTML = "";
    modalTitleText.textContent = "Edit API Integration";
    saveBtn.innerHTML = '<i class="bi bi-save me-1"></i> Update Integration';
  }

  function validateField(container, ok, message) {
    container.classList.remove("is-valid", "is-invalid");
    let fb = container.parentElement.querySelector(".invalid-feedback.dynamic");
    if (!ok) {
      if (!fb) {
        fb = document.createElement("div");
        fb.className = "invalid-feedback dynamic small";
        container.parentElement.appendChild(fb);
      }
      fb.textContent = message;
      container.classList.add("is-invalid");
      return false;
    } else {
      if (fb) fb.remove();
      container.classList.add("is-valid");
      return true;
    }
  }

  async function validateInputs() {
    const data = {
      provider_type: cfgProvider.value,
      api_key: cfgApiKey.value,
      base_url: cfgBaseUrl.value,
    };
    const { optionalKey } = providerDefaults();
    let ok = true;
    if (!cfgName.value.trim()) {
      validateField(cfgName, false, "Display name is required.");
      ok = false;
    } else {
      validateField(cfgName, true);
    }
    if (!cfgModel.value.trim()) {
      validateField(cfgModel, false, "Model name is required.");
      ok = false;
    } else {
      validateField(cfgModel, true);
    }
    try {
      const resp = await fetch("/api/settings/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (result.base_url) {
        validateField(cfgBaseUrl, result.base_url.valid, result.base_url.error);
        if (!result.base_url.valid) ok = false;
      }
      if (result.api_key) {
        if (optionalKey && !data.api_key) {
          validateField(cfgApiKey, true);
        } else {
          validateField(cfgApiKey, result.api_key.valid, result.api_key.error);
          if (!result.api_key.valid) ok = false;
        }
      }
    } catch (e) {
      console.warn("validation error", e);
    }
    return ok;
  }

  function payload() {
    return {
      provider_name: cfgName.value.trim(),
      provider_type: cfgProvider.value,
      base_url: cfgBaseUrl.value.trim().replace(/\/+$/, ""),
      model_name: cfgModel.value.trim(),
      api_key: cfgApiKey.value,
      priority: parseInt(cfgPriority.value || "0", 10),
      is_active: cfgIsActive.checked,
    };
  }

  async function submitForm(e) {
    e.preventDefault();
    const valid = await validateInputs();
    if (!valid) return;
    saveBtn.disabled = true;
    try {
      const data = payload();
      const isEdit = !!cfgId.value;
      const url = isEdit
        ? `/api/settings/api-configs/${cfgId.value}`
        : "/api/settings/api-configs";
      const resp = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (!result.ok && !result.config) {
        alert((result && result.error) || "Failed to save integration.");
        return;
      }
      location.reload();
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function runTest() {
    const valid = await validateInputs();
    if (!valid) return;
    testResult.innerHTML =
      '<div class="alert alert-secondary small rounded-3 border-0 mb-0"><i class="bi bi-hourglass-split spinner-border spinner-border-sm me-2"></i> Testing connection...</div>';
    try {
      const data = payload();
      const resp = await fetch("/api/settings/api-configs/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await resp.json();
      if (result.ok) {
        testResult.innerHTML =
          '<div class="alert alert-success small rounded-3 border-0 mb-0">' +
          '<i class="bi bi-check-circle-fill me-1"></i> Connection successful' +
          (result.latency_ms ? ` (${result.latency_ms} ms)` : "") +
          "</div>";
      } else {
        testResult.innerHTML =
          '<div class="alert alert-danger small rounded-3 border-0 mb-0">' +
          '<i class="bi bi-x-circle-fill me-1"></i> ' +
          (result.error || "Connection failed") +
          "</div>";
      }
    } catch (e) {
      testResult.innerHTML =
        '<div class="alert alert-danger small rounded-3 border-0 mb-0">' +
        '<i class="bi bi-x-circle-fill me-1"></i> Network error: ' +
        e.message +
        "</div>";
    }
  }

  function confirmActivate(id) {
    return confirm("Activate this provider? It will become the default for all LLM requests.");
  }

  function confirmDelete(id, name) {
    return confirm(`Delete integration "${name}"? This cannot be undone.`);
  }

  async function onTableAction(e) {
    const btn = e.target.closest("button[data-id]");
    if (!btn || !tbody) return;
    const id = btn.dataset.id;
    const tr = tbody.querySelector(`tr[data-id="${id}"]`);
    if (!tr) return;
    const name = tr.querySelector("td:first-child").textContent.trim();

    if (btn.classList.contains("delete-btn")) {
      if (!confirmDelete(id, name)) return;
      await fetch(`/api/settings/api-configs/${id}`, { method: "DELETE" });
      location.reload();
    } else if (btn.classList.contains("activate-btn")) {
      if (!confirmActivate(id)) return;
      await fetch(`/api/settings/api-configs/${id}/activate`, { method: "POST" });
      location.reload();
    } else if (btn.classList.contains("edit-btn")) {
      const resp = await fetch(`/api/settings/api-configs/${id}`);
      const data = await resp.json();
      if (data.config) {
        resetForm();
        fillForm(data.config);
        new bootstrap.Modal(modal).show();
      }
    } else if (btn.classList.contains("test-btn")) {
      const resp = await fetch(`/api/settings/api-configs/${id}`);
      const data = await resp.json();
      if (!data.config) return;
      resetForm();
      cfgId.value = id;
      cfgProvider.value = data.config.provider_type;
      cfgBaseUrl.value = data.config.base_url;
      cfgModel.value = data.config.model_name;
      cfgApiKey.value = "";
      new bootstrap.Modal(modal).show();
      setTimeout(runTest, 400);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!modal || !form) return;

    $("#add-config-btn")?.addEventListener("click", resetForm);
    form.addEventListener("submit", submitForm);

    cfgProvider.addEventListener("change", () => {
      const { defaultBaseUrl, defaultModel } = providerDefaults();
      if (!cfgBaseUrl.value || Object.values({
        openai: "https://api.openai.com/v1",
        gemini: "https://generativelanguage.googleapis.com/v1beta",
        anthropic: "https://api.anthropic.com/v1",
        ollama: "http://localhost:11434",
        custom: "http://localhost:8080/v1",
      }).includes(cfgBaseUrl.value.replace(/\/+$/, ""))) {
        cfgBaseUrl.value = defaultBaseUrl;
      }
      if (!cfgModel.value || Object.values({
        openai: "gpt-3.5-turbo",
        gemini: "gemini-1.5-flash",
        anthropic: "claude-3-haiku-20240307",
        ollama: "phi3:mini",
        custom: "default-model",
      }).includes(cfgModel.value)) {
        cfgModel.value = defaultModel;
      }
    });

    $$(".toggle-key-visibility").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = cfgApiKey.type === "password" ? "text" : "password";
        cfgApiKey.type = type;
        btn.querySelector("i").className = type === "password" ? "bi bi-eye" : "bi bi-eye-slash";
      });
    });

    $(".test-inline-btn")?.addEventListener("click", runTest);
    tbody?.addEventListener("click", onTableAction);

    [cfgBaseUrl, cfgApiKey, cfgName, cfgModel].forEach((el) => {
      el.addEventListener("blur", validateInputs);
    });
  });
})();
