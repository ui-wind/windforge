/**
 * Minimal diagnostics shared by compiler surfaces (CLI, Metro plugin).
 * Phase 0 keeps this deliberately small; the full diagnostic model lands with
 * the compiler pipeline in Phase 1+.
 */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type Diagnostic = {
  severity: DiagnosticSeverity;
  message: string;
  code: string;
  file?: string;
  line?: number;
};

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const location = diagnostic.file
    ? `${diagnostic.file}${diagnostic.line !== undefined ? `:${diagnostic.line}` : ''}: `
    : '';
  return `${location}[${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`;
}
