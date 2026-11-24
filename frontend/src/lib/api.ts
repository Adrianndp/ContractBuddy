export const API_URL = (import.meta.env["VITE_API_URL"] || "http://localhost:8000").replace(
  /\/+$/,
  "",
);
export const HEALTH_INTERVAL_MS = 30_000;

export interface HealthResponse {
  database: "ok" | "error";
  ollama: "ok" | "error";
}
export interface ContractDocument {
  id: number;
  filename: string;
  uploaded_at: string;
  page_count: number;
  chunk_count: number;
}
export interface DocumentChunk {
  chunk_index: number;
  page_number: number;
  text: string;
}
export interface AnswerSource {
  document_id: number;
  filename: string;
  page_number: number;
  text_snippet: string;
  distance: number;
}
export interface AskRequest {
  question: string;
  document_ids?: number[];
}
export interface AskResponse {
  /** null while the backend only does retrieval (no LLM answer yet). */
  answer: string | null;
  sources: AnswerSource[];
}
export interface ApiErrorResponse {
  detail: string;
}
export interface UploadRequest {
  file: File;
}
export interface DocumentRequest {
  id: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    // Local indexing and generation can be slow. Intentionally no request timeout.
    response = await fetch(`${API_URL}${path}`, options);
  } catch {
    throw new ApiError(`Backend not reachable at ${API_URL}`);
  }
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (typeof body.detail === "string") message = body.detail;
    } catch {
      /* Preserve the HTTP error when no JSON body exists. */
    }
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function isPdf(file: File): boolean {
  return /\.pdf$/i.test(file.name) && (file.type === "application/pdf" || file.type === "");
}
export function buildAskRequest(question: string, ids: number[]): AskRequest {
  return ids.length ? { question, document_ids: ids } : { question };
}
export const api = {
  health: () => request<HealthResponse>("/health"),
  documents: () => request<ContractDocument[]>("/documents"),
  upload: ({ file }: UploadRequest) => {
    if (!isPdf(file)) return Promise.reject(new ApiError("Only PDF files are supported."));
    const body = new FormData();
    body.append("file", file);
    return request<ContractDocument>("/documents", { method: "POST", body });
  },
  deleteDocument: ({ id }: DocumentRequest) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),
  chunks: ({ id }: DocumentRequest) => request<DocumentChunk[]>(`/documents/${id}/chunks`),
  ask: (body: AskRequest) =>
    request<AskResponse>("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
};
