import base64
import hashlib
import json
import os
import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import requests

import config
from models.database import get_connection, now_iso

try:
    from cryptography.fernet import Fernet, InvalidToken

    _FERNET_AVAILABLE = True
except ImportError:
    _FERNET_AVAILABLE = False
    InvalidToken = Exception


PROVIDER_TYPES = {
    "openai": {
        "label": "OpenAI",
        "default_base_url": "https://api.openai.com/v1",
        "default_model": "gpt-3.5-turbo",
        "key_pattern": r"^sk-[A-Za-z0-9_-]{20,}$",
        "test_endpoint": "/models",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
    "gemini": {
        "label": "Google Gemini",
        "default_base_url": "https://aistudio.google.com/app/api-keys?project=gen-lang-client-0748073889",
        "default_model": "gemini-1.5-flash",
        "key_pattern": r"^(AIza[A-Za-z0-9_-]{35,}|AQ\.[A-Za-z0-9_.-]{20,})$",
        "test_endpoint": "/models?key=",
        "auth_header": None,
        "auth_prefix": "",
        "key_in_query": True,
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "default_base_url": "https://api.anthropic.com/v1",
        "default_model": "claude-3-haiku-20240307",
        "key_pattern": r"^sk-ant-[A-Za-z0-9_-]{20,}$",
        "test_endpoint": "/models",
        "auth_header": "x-api-key",
        "auth_prefix": "",
        "extra_headers": {"anthropic-version": "2023-06-01"},
    },
    "ollama": {
        "label": "Ollama (Local)",
        "default_base_url": "http://localhost:11434",
        "default_model": "phi3:mini",
        "key_pattern": r"^.*$",
        "test_endpoint": "/api/tags",
        "auth_header": None,
        "auth_prefix": "",
        "optional_key": True,
    },
    "custom": {
        "label": "Custom / OpenAI-Compatible",
        "default_base_url": "http://localhost:8080/v1",
        "default_model": "default-model",
        "key_pattern": r"^.{3,}$",
        "test_endpoint": "/models",
        "auth_header": "Authorization",
        "auth_prefix": "Bearer ",
    },
}


class _SimpleCipher:
    def __init__(self, key_material: str):
        digest = hashlib.sha256(key_material.encode("utf-8")).digest()
        self._key = digest

    def encrypt(self, plaintext: str) -> str:
        data = plaintext.encode("utf-8")
        out = bytearray()
        key_len = len(self._key)
        for i, b in enumerate(data):
            out.append(b ^ self._key[i % key_len])
        return base64.urlsafe_b64encode(bytes(out)).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        try:
            data = base64.urlsafe_b64decode(ciphertext.encode("ascii"))
        except (ValueError, base64.binascii.Error):
            return ""
        out = bytearray()
        key_len = len(self._key)
        for i, b in enumerate(data):
            out.append(b ^ self._key[i % key_len])
        try:
            return bytes(out).decode("utf-8")
        except UnicodeDecodeError:
            return ""


def _get_cipher():
    secret = config.SECRET_KEY if hasattr(config, "SECRET_KEY") else "study-assistant-default-secret"
    if _FERNET_AVAILABLE:
        key_bytes = hashlib.sha256(secret.encode("utf-8")).digest()
        fernet_key = base64.urlsafe_b64encode(key_bytes)
        return Fernet(fernet_key)
    return _SimpleCipher(secret)


def _encrypt(value: str) -> str:
    cipher = _get_cipher()
    if _FERNET_AVAILABLE:
        return cipher.encrypt(value.encode("utf-8")).decode("ascii")
    return cipher.encrypt(value)


def _decrypt(value: str) -> str:
    if not value:
        return ""
    cipher = _get_cipher()
    try:
        if _FERNET_AVAILABLE:
            return cipher.decrypt(value.encode("ascii")).decode("utf-8")
        return cipher.decrypt(value)
    except (InvalidToken, ValueError, Exception):
        return ""


def validate_api_key(provider_type: str, api_key: str) -> Dict[str, Any]:
    meta = PROVIDER_TYPES.get(provider_type)
    if not meta:
        return {"valid": False, "error": "Unknown provider type"}
    if meta.get("optional_key") and not api_key:
        return {"valid": True}
    if not api_key:
        return {"valid": False, "error": "API key is required"}
    if len(api_key) < 3:
        return {"valid": False, "error": "API key is too short"}
    pattern = meta.get("key_pattern")
    if pattern and provider_type != "custom":
        if not re.match(pattern, api_key):
            return {"valid": False, "error": f"API key format invalid for {meta['label']}"}
    return {"valid": True}


def validate_url(url: str) -> Dict[str, Any]:
    if not url:
        return {"valid": False, "error": "Endpoint URL is required"}
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return {"valid": False, "error": "URL must start with http:// or https://"}
        if not parsed.netloc:
            return {"valid": False, "error": "URL has no valid host"}
        if " " in url:
            return {"valid": False, "error": "URL contains invalid whitespace"}
        return {"valid": True}
    except Exception:
        return {"valid": False, "error": "URL format is invalid"}


def test_api_connection(
    provider_type: str,
    api_key: str,
    base_url: str,
    model_name: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    timeout: int = 15,
) -> Dict[str, Any]:
    meta = PROVIDER_TYPES.get(provider_type)
    if not meta:
        return {"ok": False, "status_code": 0, "error": "Unknown provider type"}
    try:
        endpoint = meta["test_endpoint"]
        url = base_url.rstrip("/")
        headers = {"User-Agent": "StudyAssistant/1.0"}
        if meta.get("extra_headers"):
            headers.update(meta["extra_headers"])
        if extra_headers:
            headers.update(extra_headers)

        if meta.get("key_in_query"):
            test_url = f"{url}{endpoint}{api_key}"
        else:
            test_url = f"{url}{endpoint}"
            auth_header = meta.get("auth_header")
            if auth_header and api_key:
                headers[auth_header] = f"{meta.get('auth_prefix', '')}{api_key}"

        response = requests.get(test_url, headers=headers, timeout=timeout)
        ok = 200 <= response.status_code < 300
        return {
            "ok": ok,
            "status_code": response.status_code,
            "error": None if ok else f"HTTP {response.status_code}: {response.text[:200]}",
            "latency_ms": int(response.elapsed.total_seconds() * 1000),
        }
    except requests.Timeout:
        return {"ok": False, "status_code": 0, "error": "Connection timed out"}
    except requests.ConnectionError:
        return {"ok": False, "status_code": 0, "error": "Could not connect to server"}
    except requests.RequestException as exc:
        return {"ok": False, "status_code": 0, "error": str(exc)}


def set_setting(key: str, value: Any):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO app_settings (setting_key, setting_value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(setting_key) DO UPDATE SET
            setting_value = excluded.setting_value,
            updated_at = excluded.updated_at
        """,
        (key, json.dumps(value) if not isinstance(value, str) else value, now_iso()),
    )
    conn.commit()
    conn.close()


def get_setting(key: str, default: Any = None) -> Any:
    conn = get_connection()
    row = conn.execute(
        "SELECT setting_value FROM app_settings WHERE setting_key = ?", (key,)
    ).fetchone()
    conn.close()
    if not row:
        return default
    raw = row["setting_value"]
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return raw


def list_api_configs(include_keys: bool = False) -> List[Dict[str, Any]]:
    conn = get_connection()
    rows = conn.execute(
        "SELECT * FROM api_configs ORDER BY priority DESC, created_at DESC"
    ).fetchall()
    conn.close()
    results = []
    for row in rows:
        item = dict(row)
        if not include_keys:
            item["api_key_masked"] = _mask_key(_decrypt(item.get("api_key_encrypted") or ""))
            item.pop("api_key_encrypted", None)
        else:
            item["api_key"] = _decrypt(item.get("api_key_encrypted") or "")
        try:
            item["extra_config"] = json.loads(item["extra_config"]) if item.get("extra_config") else {}
        except (json.JSONDecodeError, TypeError):
            item["extra_config"] = {}
        results.append(item)
    return results


def get_api_config(config_id: int, include_key: bool = False) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM api_configs WHERE id = ?", (config_id,)).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    if include_key:
        item["api_key"] = _decrypt(item.get("api_key_encrypted") or "")
    else:
        item["api_key_masked"] = _mask_key(_decrypt(item.get("api_key_encrypted") or ""))
    item.pop("api_key_encrypted", None)
    try:
        item["extra_config"] = json.loads(item["extra_config"]) if item.get("extra_config") else {}
    except (json.JSONDecodeError, TypeError):
        item["extra_config"] = {}
    return item


def create_api_config(data: Dict[str, Any]) -> Dict[str, Any]:
    provider_type = (data.get("provider_type") or "custom").lower()
    if provider_type not in PROVIDER_TYPES:
        raise ValueError(f"Invalid provider type: {provider_type}")
    meta = PROVIDER_TYPES[provider_type]

    provider_name = (data.get("provider_name") or meta["label"]).strip()
    if not provider_name:
        provider_name = meta["label"]
    api_key = (data.get("api_key") or "").strip()
    base_url = (data.get("base_url") or meta["default_base_url"]).strip().rstrip("/")
    model_name = (data.get("model_name") or meta["default_model"]).strip()
    priority = int(data.get("priority", 0))
    is_active = 1 if data.get("is_active") else 0
    extra_config = data.get("extra_config") or {}

    key_check = validate_api_key(provider_type, api_key)
    if not key_check["valid"]:
        raise ValueError(key_check["error"])
    url_check = validate_url(base_url)
    if not url_check["valid"]:
        raise ValueError(url_check["error"])
    if not model_name:
        raise ValueError("Model name is required")

    if is_active:
        _clear_all_active(provider_type)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        INSERT INTO api_configs
        (provider_name, provider_type, api_key_encrypted, base_url, model_name,
         is_active, priority, extra_config, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            provider_name,
            provider_type,
            _encrypt(api_key),
            base_url,
            model_name,
            is_active,
            priority,
            json.dumps(extra_config) if extra_config else None,
            now_iso(),
            now_iso(),
        ),
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return get_api_config(new_id) or {"id": new_id}


def update_api_config(config_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
    existing = get_api_config(config_id, include_key=True)
    if not existing:
        raise ValueError("Config not found")

    provider_type = (data.get("provider_type") or existing.get("provider_type")).lower()
    if provider_type not in PROVIDER_TYPES:
        raise ValueError(f"Invalid provider type: {provider_type}")
    meta = PROVIDER_TYPES[provider_type]

    provider_name = ((data.get("provider_name") or existing.get("provider_name")) or meta["label"]).strip()
    api_key = data.get("api_key")
    if api_key is None:
        api_key = existing.get("api_key") or ""
    else:
        api_key = api_key.strip()
    base_url = ((data.get("base_url") or existing.get("base_url")) or meta["default_base_url"]).strip().rstrip("/")
    model_name = ((data.get("model_name") or existing.get("model_name")) or meta["default_model"]).strip()
    priority = int(data.get("priority", existing.get("priority", 0)))
    is_active = 1 if data.get("is_active") else (existing.get("is_active", 0))
    extra_config = data.get("extra_config") if "extra_config" in data else existing.get("extra_config") or {}

    key_check = validate_api_key(provider_type, api_key)
    if not key_check["valid"]:
        raise ValueError(key_check["error"])
    url_check = validate_url(base_url)
    if not url_check["valid"]:
        raise ValueError(url_check["error"])
    if not model_name:
        raise ValueError("Model name is required")

    if is_active and not existing.get("is_active"):
        _clear_all_active(provider_type)

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        UPDATE api_configs SET
            provider_name = ?,
            provider_type = ?,
            api_key_encrypted = ?,
            base_url = ?,
            model_name = ?,
            is_active = ?,
            priority = ?,
            extra_config = ?,
            updated_at = ?
        WHERE id = ?
        """,
        (
            provider_name,
            provider_type,
            _encrypt(api_key),
            base_url,
            model_name,
            is_active,
            priority,
            json.dumps(extra_config) if extra_config else None,
            now_iso(),
            config_id,
        ),
    )
    conn.commit()
    conn.close()
    return get_api_config(config_id) or {"id": config_id}


def delete_api_config(config_id: int):
    conn = get_connection()
    conn.execute("DELETE FROM api_configs WHERE id = ?", (config_id,))
    conn.commit()
    conn.close()


def set_active_api_config(config_id: int):
    existing = get_api_config(config_id)
    if not existing:
        raise ValueError("Config not found")
    provider_type = existing["provider_type"]
    _clear_all_active(provider_type)
    conn = get_connection()
    conn.execute("UPDATE api_configs SET is_active = 1, updated_at = ? WHERE id = ?", (now_iso(), config_id))
    conn.commit()
    conn.close()


def _clear_all_active(provider_type: str):
    conn = get_connection()
    conn.execute(
        "UPDATE api_configs SET is_active = 0, updated_at = ? WHERE provider_type = ? AND is_active = 1",
        (now_iso(), provider_type),
    )
    conn.commit()
    conn.close()


def get_active_provider(provider_type: Optional[str] = None) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM api_configs WHERE is_active = 1"
    params: tuple = ()
    if provider_type:
        query += " AND provider_type = ?"
        params = (provider_type,)
    query += " ORDER BY priority DESC LIMIT 1"
    conn = get_connection()
    row = conn.execute(query, params).fetchone()
    conn.close()
    if not row:
        return None
    item = dict(row)
    item["api_key"] = _decrypt(item.get("api_key_encrypted") or "")
    item.pop("api_key_encrypted", None)
    try:
        item["extra_config"] = json.loads(item["extra_config"]) if item.get("extra_config") else {}
    except (json.JSONDecodeError, TypeError):
        item["extra_config"] = {}
    return item


def _mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "*" * len(key)
    return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"


def get_provider_types() -> Dict[str, Dict[str, Any]]:
    result = {}
    for key, meta in PROVIDER_TYPES.items():
        result[key] = {
            "label": meta["label"],
            "default_base_url": meta["default_base_url"],
            "default_model": meta["default_model"],
            "optional_key": meta.get("optional_key", False),
        }
    return result


def get_active_models(validate_connection: bool = True) -> List[Dict[str, Any]]:
    """
    Returns all configured or active AI models with their API connection status.
    Checks API connections for Google Gemini, Ollama, OpenAI, Anthropic, Custom, etc.
    Validates that only properly connected API-supported models return status='connected'.
    """
    configs = list_api_configs(include_keys=True)
    models_list = []

    has_ollama_in_configs = False

    for cfg in configs:
        p_type = cfg.get("provider_type", "custom")
        if p_type == "ollama":
            has_ollama_in_configs = True

        status = "unknown"
        latency_ms = None
        error = None

        if validate_connection:
            res = test_api_connection(
                provider_type=p_type,
                api_key=cfg.get("api_key", ""),
                base_url=cfg.get("base_url", ""),
                model_name=cfg.get("model_name"),
                timeout=5,
            )
            if res.get("ok"):
                status = "connected"
                latency_ms = res.get("latency_ms")
            else:
                status = "disconnected"
                error = res.get("error")
        else:
            status = "connected" if cfg.get("is_active") else "configured"

        models_list.append(
            {
                "id": cfg.get("id"),
                "provider_name": cfg.get("provider_name") or PROVIDER_TYPES.get(p_type, {}).get("label", p_type.capitalize()),
                "provider_type": p_type,
                "model_name": cfg.get("model_name", "default"),
                "base_url": cfg.get("base_url", ""),
                "is_active": bool(cfg.get("is_active", 0)),
                "status": status,
                "latency_ms": latency_ms,
                "error": error,
                "api_key_masked": _mask_key(cfg.get("api_key", "")),
            }
        )

    if not has_ollama_in_configs:
        ollama_url = config.OLLAMA_BASE_URL.rstrip("/")
        ollama_model = config.OLLAMA_MODEL
        status = "unknown"
        latency_ms = None
        error = None
        if validate_connection:
            res = test_api_connection(
                provider_type="ollama",
                api_key="",
                base_url=ollama_url,
                model_name=ollama_model,
                timeout=3,
            )
            if res.get("ok"):
                status = "connected"
                latency_ms = res.get("latency_ms")
            else:
                status = "disconnected"
                error = res.get("error")
        else:
            status = "connected"

        active_custom = get_active_provider()
        ollama_active = active_custom is None or active_custom.get("provider_type") == "ollama"

        models_list.append(
            {
                "id": "ollama_default",
                "provider_name": "Ollama (Local)",
                "provider_type": "ollama",
                "model_name": ollama_model,
                "base_url": ollama_url,
                "is_active": ollama_active,
                "status": status,
                "latency_ms": latency_ms,
                "error": error,
                "api_key_masked": "N/A (Local)",
            }
        )

    return models_list


def get_connected_models() -> List[Dict[str, Any]]:
    return [m for m in get_active_models(validate_connection=True) if m["status"] == "connected"]


def get_current_active_model_info() -> Dict[str, Any]:
    """
    Returns details of the single active AI model being used for generation.
    """
    active = get_active_provider()
    if active:
        p_type = active.get("provider_type", "custom")
        p_meta = PROVIDER_TYPES.get(p_type, {})
        provider_name = active.get("provider_name") or p_meta.get("label", p_type.capitalize())
        model_name = active.get("model_name") or p_meta.get("default_model", "default")
        return {
            "provider_name": provider_name,
            "provider_type": p_type,
            "model_name": model_name,
            "display_name": f"{provider_name} ({model_name})"
        }
    else:
        ollama_model = getattr(config, "OLLAMA_MODEL", "phi3:mini")
        return {
            "provider_name": "Ollama (Local)",
            "provider_type": "ollama",
            "model_name": ollama_model,
            "display_name": f"Ollama ({ollama_model})"
        }




class MultiProviderLLMClient:
    def __init__(self):
        self._cache = None

    def _get_active_config(self) -> Optional[Dict[str, Any]]:
        return get_active_provider()

    def is_available(self) -> bool:
        cfg = self._get_active_config()
        if not cfg:
            return False
        meta = PROVIDER_TYPES.get(cfg["provider_type"])
        if not meta:
            return False
        result = test_api_connection(
            cfg["provider_type"],
            cfg.get("api_key", ""),
            cfg.get("base_url", ""),
            cfg.get("model_name"),
            timeout=5,
        )
        return result["ok"]

    def generate(self, prompt: str, system: Optional[str] = None, **kwargs) -> str:
        cfg = self._get_active_config()
        if not cfg:
            return (
                "No active API provider configured. Go to Settings > Advanced to add one, "
                "or use local Ollama."
            )
        provider_type = cfg["provider_type"]
        try:
            if provider_type in ("openai", "custom", "anthropic"):
                return self._chat_completion_generate(cfg, prompt, system, **kwargs)
            if provider_type == "gemini":
                return self._gemini_generate(cfg, prompt, system, **kwargs)
            if provider_type == "ollama":
                return self._ollama_generate(cfg, prompt, system, **kwargs)
            return "Unsupported provider type"
        except requests.RequestException as exc:
            return f"API request failed: {exc}"
        except Exception as exc:
            return f"Unexpected error calling API: {exc}"

    def _chat_completion_generate(self, cfg: Dict[str, Any], prompt: str, system: Optional[str], **kwargs) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        base = cfg["base_url"].rstrip("/")
        url = f"{base}/chat/completions"
        headers = {"Content-Type": "application/json"}
        meta = PROVIDER_TYPES.get(cfg["provider_type"], {})
        if meta.get("extra_headers"):
            headers.update(meta["extra_headers"])
        api_key = cfg.get("api_key", "")
        auth_header = meta.get("auth_header", "Authorization")
        prefix = meta.get("auth_prefix", "Bearer ")
        if auth_header and api_key:
            headers[auth_header] = f"{prefix}{api_key}"
        payload = {
            "model": cfg.get("model_name"),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 1024),
            "stream": False,
        }
        if kwargs.get("json_mode"):
            if cfg["provider_type"] == "anthropic":
                payload["messages"][-1]["content"] += " Output only valid JSON."
            else:
                payload["response_format"] = {"type": "json_object"}
        response = requests.post(url, headers=headers, json=payload, timeout=kwargs.get("timeout", 180))
        response.raise_for_status()
        data = response.json()
        if cfg["provider_type"] == "anthropic":
            content_blocks = data.get("content", [])
            return "".join(block.get("text", "") for block in content_blocks).strip()
        choices = data.get("choices", [])
        if not choices:
            return ""
        msg = choices[0].get("message", {})
        return (msg.get("content") or "").strip()

    def _gemini_generate(self, cfg: Dict[str, Any], prompt: str, system: Optional[str], **kwargs) -> str:
        api_key = cfg.get("api_key", "")
        model = cfg.get("model_name", "gemini-1.5-flash")
        base = cfg["base_url"].rstrip("/")
        url = f"{base}/models/{model}:generateContent?key={api_key}"
        parts = [{"text": prompt}]
        contents = [{"role": "user", "parts": parts}]
        if system:
            contents.insert(0, {"role": "system", "parts": [{"text": system}]})
        payload = {"contents": contents, "generationConfig": {
            "temperature": kwargs.get("temperature", 0.3),
            "maxOutputTokens": kwargs.get("max_tokens", 1024),
        }}
        if kwargs.get("json_mode"):
            payload["generationConfig"]["responseMimeType"] = "application/json"
        headers = {"Content-Type": "application/json"}
        response = requests.post(url, headers=headers, json=payload, timeout=kwargs.get("timeout", 180))
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            return ""
        content = candidates[0].get("content", {})
        parts_list = content.get("parts", [])
        return "".join(part.get("text", "") for part in parts_list).strip()

    def _ollama_generate(self, cfg: Dict[str, Any], prompt: str, system: Optional[str], **kwargs) -> str:
        base = cfg["base_url"].rstrip("/")
        url = f"{base}/api/generate"
        payload = {
            "model": cfg.get("model_name"),
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", 0.3),
                "num_predict": kwargs.get("max_tokens", 1024),
            },
        }
        if system:
            payload["system"] = system
        if kwargs.get("json_mode"):
            payload["format"] = "json"
        headers = {"Content-Type": "application/json"}
        api_key = cfg.get("api_key", "")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        response = requests.post(url, headers=headers, json=payload, timeout=kwargs.get("timeout", 180))
        response.raise_for_status()
        data = response.json()
        return (data.get("response") or "").strip()


multi_llm_client = MultiProviderLLMClient()
