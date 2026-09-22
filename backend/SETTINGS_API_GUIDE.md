# Custom API Integrations & Settings Guide

This document explains how to configure, test, and use the hidden Custom API Integrations panel within the Study Assistant application, including integration with the OpenCV-based processing framework.

---

## 1. Overview

The application ships with two tiers of settings:

| Tier              | Visibility                   | Capabilities                                                                                           |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| General Settings  | Always visible in Settings   | Default model, max tokens, OpenCV processing toggle, application preferences.                         |
| Advanced (Hidden) | Requires opt-in toggle       | Custom API providers (OpenAI, Gemini, Anthropic, Ollama, OpenAI-compatible custom endpoints), full credential and priority management. |

The hidden Custom API Integrations panel **is not visible until the user explicitly enables Advanced Mode** on the Settings page. This keeps novice users on the safe, default local-Ollama path while power users can plug in any compatible AI service.

---

## 2. Enabling Advanced Mode (Accessing the Hidden Panel)

1. Open the application and sign in to your local instance (default: `http://localhost:5000`).
2. Click **Settings** in the top navigation bar.
3. At the top right, click **Enable Advanced Mode**.
   - A green success flash confirms "Advanced mode enabled."
   - The page now reveals the **Hidden: Custom API Integrations** section, highlighted with a warning accent and an "Advanced Only" badge.
4. To hide the section again, click **Disable Advanced Mode** in the same location.

> **Security note**: Advanced mode is a preference stored per database. The API backend enforces the advanced-mode gate on every endpoint, so disabling it also locks direct API access.

---

## 3. Supported Provider Types

| Provider Type              | Default Base URL                                     | Default Model            | Key Format                                      |
| -------------------------- | ---------------------------------------------------- | ------------------------ | ----------------------------------------------- |
| OpenAI                     | `https://api.openai.com/v1`                          | `gpt-3.5-turbo`          | `sk-...` (20+ chars)                            |
| Google Gemini              | `https://generativelanguage.googleapis.com/v1beta`   | `gemini-1.5-flash`       | `AIza...` or `AQ....`                           |
| Anthropic Claude           | `https://api.anthropic.com/v1`                       | `claude-3-haiku-20240307`| `sk-ant-...` (20+ chars)                        |
| Ollama (Local)             | `http://localhost:11434`                              | `phi3:mini`              | Optional (intended for local or intranet use)   |
| Custom / OpenAI-Compatible | `http://localhost:8080/v1`                            | `default-model`          | Any string, 3+ chars                            |

Custom endpoints must expose the `/chat/completions` (or equivalent) route in OpenAI format. Many self-hosted gateways (vLLM, llama.cpp server, Mistral API, Groq, Together, etc.) work out of the box.

---

## 4. Adding a New Custom API Integration

### 4.1 Step-by-Step

1. In **Settings → Hidden: Custom API Integrations**, click **Add API Integration**.
2. Fill in the form:
   - **Provider Type**: Choose the platform. Selecting a type auto-fills the default endpoint and model.
   - **Display Name**: A human-readable label (e.g., "Work OpenAI" or "Personal Gemini").
   - **API Endpoint URL**: Base URL of the provider API. Must start with `http://` or `https://`.
   - **Model Name**: Exact model identifier the provider expects (e.g., `gpt-4o`, `gemini-1.5-pro`, `claude-3-5-sonnet-20241022`).
   - **API Key**: The secret credential. Click the 👁 button to toggle visibility. Stored encrypted in the database.
   - **Priority** (integer, default `0`): If multiple configs of different providers are ever active, higher-priority ones are preferred.
   - **Set as active provider immediately after saving**: If checked, this integration becomes the default for all LLM features.
3. Click **Test Connection** inside the modal to validate endpoint reachability and key validity.
4. Click **Save Integration**.

### 4.2 Input Validation Rules

All inputs are validated both client-side (live on blur) and server-side:

- **Endpoint URL**: Must be a well-formed `http`/`https` URL with a valid host, no whitespace.
- **API Key**:
  - OpenAI: Matches `^sk-[A-Za-z0-9_-]{20,}$`
  - Gemini: Matches `^(AIza[A-Za-z0-9_-]{35,}|AQ\.[A-Za-z0-9_.-]{20,})$` (supports standard `AIza` and new `AQ.` authorization keys)
  - Anthropic: Matches `^sk-ant-[A-Za-z0-9_-]{20,}$`
  - Ollama: Optional (may be blank).
  - Custom: Minimum 3 characters.
- **Model Name**: Required, non-empty.
- **Display Name**: Required, non-empty.

### 4.3 Testing Connection

The **Test Connection** button issues a provider-specific probe request:

- OpenAI / Custom / Anthropic: `GET {base_url}/models` with the configured auth header.
- Gemini: `GET {base}/models?key={api_key}` (key is passed in query string per Google spec).
- Ollama: `GET {base}/api/tags`.

The UI shows one of:
- ✅ **Connection successful (X ms)** — All green.
- ❌ **HTTP 401: Unauthorized** — Key invalid or missing.
- ❌ **Connection timed out** / **Could not connect to server** — Network or endpoint issue.
- ❌ **HTTP 404: Not Found** — Wrong base URL or missing `/v1` prefix.

> Testing is non-destructive. It uses a small GET request with minimal token/credit impact.

---

## 5. Managing Integrations (Edit / Activate / Delete)

The list view on the Settings page shows every saved integration. Actions per row:

| Button | Action | Description |
| ------ | ------ | ----------- |
| ✅ Activate | Sets this config as the active provider. Only one config per provider type can be active. |
| ✏️ Edit | Opens the modal with values pre-filled. API key is intentionally not echoed; re-enter it to change, or leave blank to keep the existing encrypted key. |
| 🔌 Test | Loads the modal with endpoint and model pre-filled and runs an immediate connection test. |
| 🗑️ Delete | Permanently removes the configuration (after confirm). |

### 5.1 Activation Rules

- Only one integration per `provider_type` can be marked `is_active = 1`.
- Activating a config automatically deactivates any other active config of the same type.
- If no custom provider is active, the application falls back to local Ollama (see Section 7).
- The current active provider and model are shown in a banner and in the top Dashboard stats.

---

## 6. Secure Credential Storage

API keys are **never stored in plain text**.

### Storage pipeline

1. On save, the backend runs the raw key through an encryption cipher.
2. Two cipher backends are available, selected automatically at runtime:
   - **Fernet (AES-128-CBC + HMAC) via `cryptography`** — Used if the optional `cryptography` package is installed. Derives a 32-byte key from `STUDY_ASSISTANT_SECRET` env var via SHA-256.
   - **XOR + base64 fallback** — If `cryptography` is unavailable, a lightweight XOR cipher is used with the same secret-derived key. This still avoids plain-text storage, but installing `cryptography` for production is strongly recommended.
3. Only the encrypted blob is written to the `api_configs.api_key_encrypted` column.
4. The column is never returned by the list/detail endpoints. The UI only ever sees a **masked** key (`sk-a********************1234`).

### Rotating / setting the secret

Set the environment variable before starting the app:

```bash
# Linux/macOS
export STUDY_ASSISTANT_SECRET="your-strong-random-secret-at-least-32-chars"

# Windows PowerShell
$env:STUDY_ASSISTANT_SECRET="your-strong-random-secret-at-least-32-chars"
```

If the secret ever changes, previously saved keys become unrecoverable; re-enter them.

To enable the strong Fernet backend, optionally add to requirements and install:

```
pip install cryptography
```

---

## 7. Provider Fallback Behavior

At runtime, the `LLMService` in `services/rag_engine.py` follows this priority order for every generation call (chat, summary, quiz, interview, exam, teaching):

1. **Active custom provider** (if any non-Ollama config is `is_active = 1`).
2. If the custom call fails (network error, invalid key, quota, etc.), the service automatically **falls back to local Ollama**.
3. If both fail, a clear, user-facing error message is returned mentioning the status of each layer.

This ensures that a misconfigured third-party key does **not** break the app — the local RAG pipeline continues working.

---

## 8. OpenCV Processing Framework Compatibility

The Settings page exposes an **Enable OpenCV Processing** toggle (General Settings). This flag is stored in `app_settings` under the key `enable_opencv_processing`.

### How it integrates

- Existing OpenCV-based image/document preprocessing steps in the upload / PDF extraction pipeline read this setting before applying advanced filters (deskew, denoise, thresholding, contour-based page crop, etc.).
- Custom API integrations and OpenCV operate **orthogonally**:
  - OpenCV applies to the ingestion side (turning scanned / photographed PDFs into clean text).
  - LLM providers (OpenAI / Gemini / custom) apply to the reasoning side (answering, summarizing, quizzing).
- Because the two subsystems share no state, you can safely enable OpenCV alongside any combination of API providers.

### Example usage pattern

1. Upload a scanned PDF.
2. If `enable_opencv_processing = True`, the PDF processor runs optional OpenCV filters to improve text quality before OCR/extraction.
3. The extracted text is chunked and indexed by the FAISS RAG engine.
4. When the user asks a question, the app retrieves context chunks and sends them plus the user prompt to the **active custom provider** (or falls back to Ollama).

---

## 9. Error Handling for API Failures

All outbound API calls are wrapped in structured error handling:

| Condition                            | Behavior                                                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Connection timeout (default 15-300s depending on call) | Returns "API request failed: ..." then triggers the Ollama fallback.                                             |
| 401 / 403 Invalid key                | Propagates the provider's error text, then falls back to Ollama on subsequent calls.                              |
| 429 Rate limiting / Quota exceeded   | Surface error with provider message. The UI shows this inline for tests; runtime generation falls back to Ollama. |
| 5xx server error                     | Automatic fallback to Ollama.                                                                                    |
| JSON parse errors on structured tasks (quiz/exam) | `_extract_json_from_text` retries with a more strict prompt and parser.                                          |

You can diagnose recurring issues by:
1. Running **Test Connection** for the active provider.
2. Opening `/api/health` — reports `llm_available` and model list.
3. Inspecting the Flash banner on Settings after a save/test.

---

## 10. Backend REST API (Advanced)

The settings API lives under `/api/settings/*`. All `api-configs` endpoints return `403 Forbidden` unless `advanced_mode_enabled` is `True` in `app_settings`.

| Method | Path                                           | Description                                             |
| ------ | ---------------------------------------------- | ------------------------------------------------------- |
| POST   | `/api/settings/advanced`                       | `{enabled: bool}` — toggle advanced mode.              |
| GET    | `/api/settings/api-configs`                    | List configs (masked keys only).                        |
| POST   | `/api/settings/api-configs`                    | Create. Validates & encrypts. Returns the created row.  |
| GET    | `/api/settings/api-configs/:id`                | Detail view (masked key).                               |
| PUT    | `/api/settings/api-configs/:id`                | Update. Re-validates & re-encrypts key if changed.      |
| DELETE | `/api/settings/api-configs/:id`                | Remove.                                                 |
| POST   | `/api/settings/api-configs/:id/activate`       | Mark as active (deactivates others of same type).       |
| POST   | `/api/settings/api-configs/test`               | Test a configuration without saving it.                 |
| POST   | `/api/settings/validate`                       | Live validation — `{api_key, base_url, provider_type}`. |

Example cURL for testing an OpenAI key:

```bash
curl -X POST http://localhost:5000/api/settings/api-configs/test \
  -H 'Content-Type: application/json' \
  -d '{"provider_type":"openai","api_key":"sk-REPLACE","base_url":"https://api.openai.com/v1","model_name":"gpt-3.5-turbo"}'
```

---

## 11. Troubleshooting Checklist

- **Advanced section doesn't appear**: Ensure you clicked **Enable Advanced Mode** on the Settings page. Refresh after toggling.
- **Test fails with "Could not connect"**: Verify the URL in a browser / with `curl`. Ensure HTTPS is used for cloud providers. Corporate proxies may need `HTTPS_PROXY` env configured at the OS level (Python `requests` honors it).
- **401 Unauthorized**: Copy the key carefully; some providers prefix differently. Ensure no trailing whitespace.
- **Gemini returns 400**: Ensure `model_name` is a valid public model (try `gemini-1.5-flash` first) and URL includes the `/v1beta` or `/v1` segment.
- **Active provider changes have no effect**: Reload any running chat/quiz pages after switching providers. The engine reads the active provider on each request, but cached results in the UI stay as-is.
- **Key masked with ******** in list**: Expected behavior. The raw key never leaves the server. Edit and re-type the key to replace it.
- **OpenCV toggle doesn't change extraction**: Ensure the `pdf_processor` hooks consult `get_setting("enable_opencv_processing")`. Extraction on already-processed files will not re-run automatically — re-upload to test OpenCV effects.

---

## 12. Quickstart Recipes

### Recipe A — OpenAI

```
Provider Type: OpenAI
Display Name:  Personal OpenAI
Endpoint:      https://api.openai.com/v1
Model:         gpt-4o-mini
API Key:       sk-... (from platform.openai.com/api-keys)
Priority:      10
Set active:    ✓
Test → Save → Done.
```

### Recipe B — Google Gemini (free tier)

```
Provider Type: Google Gemini
Display Name:  Gemini Flash
Endpoint:      https://generativelanguage.googleapis.com/v1beta
Model:         gemini-1.5-flash
API Key:       AIza... (from aistudio.google.com/app/apikey)
Priority:      5
Set active:    ✓
Test → Save → Done.
```

### Recipe C — Local Ollama (configurable as a provider too)

Useful if you want multiple Ollama endpoints or explicit priority:

```
Provider Type: Ollama (Local)
Display Name:  Home Lab Ollama
Endpoint:      http://192.168.1.42:11434
Model:         llama3.1:8b
API Key:       (leave empty)
Priority:      0
Set active:    (leave unchecked to keep it as the final fallback)
```

### Recipe D — Custom / self-hosted vLLM / llama.cpp server

```
Provider Type: Custom / OpenAI-Compatible
Display Name:  Home vLLM
Endpoint:      http://localhost:8000/v1
Model:         mistralai/Mistral-7B-Instruct-v0.3
API Key:       (whatever you configured, or "EMPTY" if none)
Priority:      2
Set active:    ✓
```

---

## 13. Files Reference

| File | Purpose |
| ---- | ------- |
| [models/database.py](file:///d:/inyernship/models/database.py) | Schema: `app_settings`, `api_configs` tables. |
| [services/settings_service.py](file:///d:/inyernship/services/settings_service.py) | Encryption, validation, CRUD, connection testing, `MultiProviderLLMClient`. |
| [services/rag_engine.py](file:///d:/inyernship/services/rag_engine.py) | `LLMService` with custom-provider-first + Ollama fallback. |
| [app.py](file:///d:/inyernship/app.py) | `/settings` page + `/api/settings/*` REST endpoints. |
| [templates/settings.html](file:///d:/inyernship/templates/settings.html) | Settings UI, advanced toggle, hidden integrations card, modal form. |
| [static/js/settings.js](file:///d:/inyernship/static/js/settings.js) | Frontend CRUD, live validation, test connection, modal logic. |
| [static/css/style.css](file:///d:/inyernship/static/css/style.css) | Settings component styles, emerald theme alignment. |
| [config.py](file:///d:/inyernship/config.py) | `SECRET_KEY` for encryption, pulled from `STUDY_ASSISTANT_SECRET`. |

---

*End of guide. Configure away, and always Test Connection before saving!*
