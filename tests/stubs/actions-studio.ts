/** Test stubs for studio server actions (E2E covers the real ones). */
export async function proposeAction(): Promise<{ ok: boolean; error?: string }> {
  return { ok: false, error: "not available in unit tests" };
}
export async function applyProposalAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function discardProposalAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function dismissSuggestionAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function undoAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function restoreVersionAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function saveCanvasAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function resetToRolePresetAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function switchInterfaceAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function applyTemplateAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function updatePreferencesAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function toggleWorkflowAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function runWorkflowNowAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function runDailyChecksAction(): Promise<{ ok: boolean; results: unknown[] }> {
  return { ok: true, results: [] };
}
export async function createWorkflowAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function runScenarioAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
export async function resetDemoAction(): Promise<{ ok: boolean }> {
  return { ok: true };
}
