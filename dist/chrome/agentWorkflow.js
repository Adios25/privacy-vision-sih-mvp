(() => {
  const TASK_TEMPLATES = Object.freeze([
    { id: 'summarize_status', label: 'Summarize visible application status', mode: 'answer' },
    { id: 'find_download', label: 'Find the download button', mode: 'highlight' },
    { id: 'locate_fields', label: 'Locate required fields', mode: 'answer' },
    { id: 'prepare_form', label: 'Prepare empty form fields', mode: 'action' },
    { id: 'next_page', label: 'Navigate to the next page', mode: 'action' },
    { id: 'extract_case_info', label: 'Extract non-sensitive case information', mode: 'answer' }
  ]);
  const AGENT_STATES = Object.freeze(['IDLE', 'SCANNING', 'SANITIZING', 'READY_TO_PLAN', 'PLANNING', 'REVIEW_REQUIRED', 'EXECUTING', 'VERIFYING', 'COMPLETED', 'BLOCKED']);
  const ALLOWED_ACTIONS = Object.freeze(['TYPE_PLACEHOLDER', 'CLICK', 'SCROLL', 'FINISH', 'ABORT', 'ANSWER', 'HIGHLIGHT', 'REQUEST_RESCAN']);
  function taskById(id) { return TASK_TEMPLATES.find((task) => task.id === id) || null; }
  function normalizeTask(value) {
    if (value && typeof value === 'object' && taskById(value.id)) return { ...taskById(value.id) };
    const text = String(value || '').trim();
    if (/download/i.test(text)) return { ...taskById('find_download') };
    if (/status/i.test(text)) return { ...taskById('summarize_status') };
    if (/required field/i.test(text)) return { ...taskById('locate_fields') };
    if (/next page|continue/i.test(text)) return { ...taskById('next_page') };
    if (/extract|case information/i.test(text)) return { ...taskById('extract_case_info') };
    return { ...taskById('prepare_form') };
  }
  globalThis.PrivvyAgentWorkflow = { TASK_TEMPLATES, AGENT_STATES, ALLOWED_ACTIONS, taskById, normalizeTask };
})();
