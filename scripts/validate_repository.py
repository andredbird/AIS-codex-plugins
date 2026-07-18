#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MARKET = ROOT / ".agents/plugins/marketplace.json"
PLUGIN = ROOT / "plugins/plan-mirror"

market = json.loads(MARKET.read_text(encoding="utf-8"))
manifest = json.loads((PLUGIN / ".codex-plugin/plugin.json").read_text(encoding="utf-8"))
assert market["name"] == "andrey-codex"
entry = next(item for item in market["plugins"] if item["name"] == "plan-mirror")
assert entry["source"] == {"source": "local", "path": "./plugins/plan-mirror"}
assert entry["policy"]["installation"] == "INSTALLED_BY_DEFAULT"
assert entry["policy"]["authentication"] == "ON_USE"
assert entry["category"] == "Productivity"
assert manifest["name"] == PLUGIN.name
assert manifest["skills"] == "./skills/"
assert "hooks" not in manifest
for skill in (PLUGIN / "skills").glob("*/SKILL.md"):
    text = skill.read_text(encoding="utf-8")
    assert "[TODO:" not in text
print("repository validation passed")
