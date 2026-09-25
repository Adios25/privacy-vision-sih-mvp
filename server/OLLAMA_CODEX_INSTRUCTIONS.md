# Codex Instructions: Test Privvy with Ollama Qwen2.5-VL

## Objective

Make the local FastAPI WebSocket bridge use Ollama's OpenAI-compatible API for local Vision-Language Model testing.

Installed Ollama model:

```text
qwen2.5vl:3b
```

Ollama API:

```text
http://127.0.0.1:11434/v1
```

## Required changes

1. Read `server/vlm_bridge.py` before editing.
2. Keep the existing FastAPI app and WebSocket endpoint:

```text
/agent/loop
```

3. Replace hardcoded vLLM settings with environment-configurable values:

```python
base_url = os.environ.get("VLM_BASE_URL", "http://127.0.0.1:11434/v1")
model = os.environ.get("VLM_MODEL", "qwen2.5vl:3b")
client = AsyncOpenAI(base_url=base_url, api_key=os.environ.get("VLM_API_KEY", "EMPTY"))
```

4. Preserve:
   - data-URI base64 stripping;
   - DOM JSON forwarding;
   - image forwarding as `data:image/jpeg;base64,...`;
   - strict JSON response format;
   - WebSocket disconnect handling.
   - ordered `actions` output so the extension can display and validate the full plan:

```json
{"actions":[{"action":"TYPE|CLICK|COMPLETE","target_id":"exact DOM id","placeholder":"<USER_NAME>"}]}
```
5. Do not send requests to an external provider.
6. Keep vLLM compatibility through environment overrides:

```powershell
$env:VLM_BASE_URL = "http://127.0.0.1:8000/v1"
$env:VLM_MODEL = "Qwen/Qwen2-VL-7B-Instruct"
```

## Verification

Run Ollama checks:

```powershell
D:\Ollama\ollama.exe list
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

Start the bridge:

```powershell
python server/vlm_bridge.py
```

Expected WebSocket endpoint:

```text
ws://127.0.0.1:8788/agent/loop
```

Send a test payload containing:

```json
{
  "goal": "Click the submit button",
  "image_base64": "data:image/jpeg;base64,<BASE64_IMAGE>",
  "dom_elements": [
    {
      "id": "submit-1",
      "role": "button",
      "text": "Submit",
      "enabled": true
    }
  ]
}
```

Confirm that the response is valid JSON and that no raw request data is logged.

## Testing constraints

- Use synthetic screenshots or locally generated test images.
- Do not send real unredacted government IDs to external services.
- Keep the existing extension's local YOLO and OCR privacy pipeline unchanged.
- Run the existing project tests after modifications.
