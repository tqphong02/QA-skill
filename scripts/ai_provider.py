"""
ai_provider.py — Auto-detect AI provider for QA skills.

Logic:
  1. Nếu user đang dùng Antigravity hoặc Copilot Pro → free, dùng model sẵn có
  2. Nếu không → đọc key từ config/api_keys.json (gitignored)
  3. Env var vẫn ưu tiên cao nhất (override mọi thứ)

Usage:
  from ai_provider import get_anthropic_client, get_openai_client, get_google_client

  client = get_anthropic_client()  # Returns Anthropic() or None
  if client:
      response = client.messages.create(...)

Hoặc check capability:
  from ai_provider import get_provider_info
  info = get_provider_info()
  print(info)  # {'active': 'antigravity', 'anthropic_key': False, ...}
"""

import os
import json
import sys
from pathlib import Path


def find_config_file():
    """Tìm file config/api_keys.json từ nhiều vị trí có thể."""
    # Tìm từ CWD đi lên
    current = Path.cwd()
    for _ in range(5):
        candidate = current / "config" / "api_keys.json"
        if candidate.exists():
            return candidate
        candidate = current / "qa-skills" / "config" / "api_keys.json"
        if candidate.exists():
            return candidate
        current = current.parent
    return None


def detect_environment():
    """Detect xem user đang dùng môi trường nào.

    Returns:
        'antigravity' - Google Antigravity IDE/CLI (free Gemini)
        'copilot_pro' - GitHub Copilot Pro (free Claude/GPT)
        'claude_code' - Claude Code CLI (đã có sẵn key)
        'standalone' - Chạy script độc lập, cần config API key
    """
    # Check Antigravity (Google AI)
    if os.environ.get("ANTIGRAVITY_API_KEY") or os.path.exists("/Applications/Antigravity.app"):
        return "antigravity"

    # Check Copilot Pro
    if os.environ.get("COPILOT_PRO") or os.environ.get("GITHUB_COPILOT_TOKEN"):
        return "copilot_pro"

    # Check Claude Code (đã có Anthropic key)
    if os.environ.get("ANTHROPIC_API_KEY"):
        return "claude_code"

    return "standalone"


def load_keys():
    """Load API keys từ config/api_keys.json. Returns dict hoặc None."""
    config_path = find_config_file()
    if not config_path:
        return None
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data
    except (json.JSONDecodeError, IOError) as e:
        print(f"⚠️  Không đọc được config: {e}", file=sys.stderr)
        return None


def get_anthropic_client():
    """Trả về anthropic.Anthropic client hoặc None nếu không có key.

    Priority:
      1. ANTHROPIC_API_KEY env var
      2. config/api_keys.json -> anthropic.api_key
      3. None (user dùng Antigravity/Copilot Pro nên không cần)
    """
    # Priority 1: env var
    api_key = os.environ.get("ANTHROPIC_API_KEY")

    # Priority 2: config file
    if not api_key:
        keys = load_keys()
        if keys:
            api_key = keys.get("anthropic", {}).get("api_key", "")

    if not api_key:
        env = detect_environment()
        if env in ("antigravity", "copilot_pro", "claude_code"):
            return None  # User dùng môi trường free, không cần client
        return None  # No key, no env → can't create client

    try:
        from anthropic import Anthropic
        return Anthropic(api_key=api_key)
    except ImportError:
        print("⚠️  anthropic package chưa cài. Chạy: pip install anthropic", file=sys.stderr)
        return None


def get_openai_client():
    """Trả về openai.OpenAI client hoặc None."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        keys = load_keys()
        if keys:
            api_key = keys.get("openai", {}).get("api_key", "")
    if not api_key:
        return None
    try:
        from openai import OpenAI
        return OpenAI(api_key=api_key)
    except ImportError:
        return None


def get_google_client():
    """Trả về google.generativeai client hoặc None."""
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        keys = load_keys()
        if keys:
            api_key = keys.get("google", {}).get("api_key", "")
    if not api_key:
        return None
    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        return genai
    except ImportError:
        return None


def get_provider_info():
    """Trả về dict thông tin về provider đang dùng - dùng để debug/log."""
    env = detect_environment()
    keys = load_keys()

    info = {
        "environment": env,
        "antigravity_detected": env == "antigravity",
        "copilot_pro_detected": env == "copilot_pro",
        "claude_code_detected": env == "claude_code",
        "anthropic_key": bool(os.environ.get("ANTHROPIC_API_KEY") or (keys or {}).get("anthropic", {}).get("api_key")),
        "openai_key": bool(os.environ.get("OPENAI_API_KEY") or (keys or {}).get("openai", {}).get("api_key")),
        "google_key": bool(os.environ.get("GOOGLE_API_KEY") or (keys or {}).get("google", {}).get("api_key")),
        "plane_key": bool(os.environ.get("PLANE_API_KEY") or (keys or {}).get("plane", {}).get("api_key")),
    }

    if env == "antigravity":
        info["active_provider"] = "Antigravity (Gemini - free)"
    elif env == "copilot_pro":
        info["active_provider"] = "Copilot Pro (Claude/GPT - free)"
    elif env == "claude_code":
        info["active_provider"] = "Claude Code (Anthropic - paid key)"
    elif info["anthropic_key"]:
        info["active_provider"] = "Anthropic (config key)"
    elif info["openai_key"]:
        info["active_provider"] = "OpenAI (config key)"
    elif info["google_key"]:
        info["active_provider"] = "Google (config key)"
    else:
        info["active_provider"] = "NONE - cần config API key"
    return info


def print_config_help():
    """In hướng dẫn config khi user chưa có key."""
    print("""
╔══════════════════════════════════════════════════════════════════╗
║  CHƯA CÓ API KEY - HƯỚNG DẪN                                         ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  Nếu bạn dùng 1 trong các môi trường sau, KHÔNG CẦN API key:        ║
║    - GitHub Copilot Pro (có sẵn Claude/GPT)                          ║
║    - Google Antigravity (có sẵn Gemini)                              ║
║    - Claude Code CLI                                                  ║
║                                                                       ║
║  Nếu chạy standalone, tạo file config:                              ║
║    1. Copy config/api_keys.example.json → config/api_keys.json        ║
║    2. Paste API key vào field tương ứng                              ║
║    3. Chạy lại                                                         ║
║                                                                       ║
║  Get API keys tại:                                                     ║
║    - Anthropic: https://console.anthropic.com/                        ║
║    - OpenAI:    https://platform.openai.com/api-keys                  ║
║    - Google:    https://aistudio.google.com/app/apikey                 ║
║                                                                       ║
╚══════════════════════════════════════════════════════════════════╝
""")


if __name__ == "__main__":
    # CLI: in thông tin provider hiện tại
    info = get_provider_info()
    print("=== AI Provider Status ===")
    for k, v in info.items():
        print(f"  {k}: {v}")
    if info["active_provider"].startswith("NONE"):
        print_config_help()
