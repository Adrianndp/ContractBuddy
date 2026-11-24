import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Files,
  FolderOpen,
  List,
  LoaderCircle,
  MessageSquare,
  PanelLeft,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  api,
  buildAskRequest,
  HEALTH_INTERVAL_MS,
  type ContractDocument,
  type HealthResponse,
  type DocumentChunk,
  type AnswerSource,
} from "@/lib/api";

interface Message {
  id: number;
  role: "user" | "assistant";
  text: string;
  sources?: AnswerSource[];
  error?: boolean;
}
const RETRIEVAL_ONLY_TEXT =
  "No generated answer yet (the backend currently only retrieves passages). The most relevant passages are listed below.";
const examples = [
  {
    title: "Notice periods",
    label: "When can I cancel?",
    question: "Wie lang ist meine Kündigungsfrist?",
    icon: FileText,
  },
  {
    title: "Costs & payments",
    label: "What am I paying for?",
    question: "Welche Kosten und Zahlungen sind in meinen Verträgen vereinbart?",
    icon: List,
  },
  {
    title: "Rights & obligations",
    label: "What should I know?",
    question: "Welche Rechte und Pflichten habe ich laut meinen Verträgen?",
    icon: ShieldCheck,
  },
];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong. Please try again.";
const dateText = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Sources({ sources }: { sources: AnswerSource[] }) {
  return (
    <div className="mt-5 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Files className="size-3.5" />
        {sources.length} {sources.length === 1 ? "source" : "sources"}
      </div>
      {sources.map((source, index) => (
        <details
          key={`${source.document_id}-${source.page_number}-${index}`}
          className="group rounded-md border bg-background"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-xs">
            <FileText className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate font-medium" title={source.filename}>
              {source.filename}
            </span>
            <span className="shrink-0 text-muted-foreground">Page {source.page_number}</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-3">
            <blockquote className="whitespace-pre-wrap border-l-2 border-primary/30 pl-3 text-sm leading-relaxed">
              {source.text_snippet}
            </blockquote>
            <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
              <span title="Lower distance means greater relevance">
                Relevance · distance {source.distance.toFixed(3)}
              </span>
              <meter
                className="relevance-meter"
                min={0}
                max={1}
                value={1 / (1 + Math.max(0, source.distance))}
                aria-label="Source relevance"
              />
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}

export function ContractWorkspace() {
  const [documents, setDocuments] = useState<ContractDocument[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState("");
  const [healthChecking, setHealthChecking] = useState(true);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{
    name: string;
    index: number;
    total: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ContractDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [chunkTarget, setChunkTarget] = useState<ContractDocument | null>(null);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunkError, setChunkError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scrollEnd = useRef<HTMLDivElement>(null);
  const uploading = useRef(false);
  const busy = useRef(false);
  const nextId = useRef(0);

  async function refreshDocuments() {
    setListLoading(true);
    try {
      const docs = await api.documents();
      setDocuments(docs);
      setSelected((current) => current.filter((id) => docs.some((doc) => doc.id === id)));
      setListError("");
    } catch (error) {
      setListError(errorText(error));
    } finally {
      setListLoading(false);
    }
  }
  async function checkHealth() {
    setHealthChecking(true);
    try {
      setHealth(await api.health());
      setHealthError("");
    } catch (error) {
      setHealth(null);
      setHealthError(errorText(error));
    } finally {
      setHealthChecking(false);
    }
  }
  useEffect(() => {
    void refreshDocuments();
    void checkHealth();
    const timer = setInterval(() => {
      void checkHealth();
    }, HEALTH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    scrollEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, asking]);
  useEffect(() => {
    if (!asking) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [asking]);
  useEffect(() => {
    if (!chunkTarget) return;
    let active = true;
    setChunks([]);
    setChunkError("");
    setChunksLoading(true);
    api
      .chunks({ id: chunkTarget.id })
      .then((data) => {
        if (active) setChunks(data);
      })
      .catch((error) => {
        if (active) setChunkError(errorText(error));
      })
      .finally(() => {
        if (active) setChunksLoading(false);
      });
    return () => {
      active = false;
    };
  }, [chunkTarget]);

  async function uploadFiles(files: File[]) {
    if (!files.length || uploading.current) return;
    uploading.current = true;
    setUploadError("");
    const errors: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress({ name: file.name, index: index + 1, total: files.length });
        try {
          await api.upload({ file });
          await refreshDocuments();
        } catch (error) {
          errors.push(`${file.name}: ${errorText(error)}`);
        }
      }
    } finally {
      setUploadProgress(null);
      uploading.current = false;
      setUploadError(errors.join("\n"));
      if (fileInput.current) fileInput.current.value = "";
    }
    void checkHealth();
  }
  async function sendQuestion() {
    const text = question.trim();
    if (!text || busy.current) return;
    busy.current = true;
    setAsking(true);
    setQuestion("");
    setMessages((current) => [...current, { id: nextId.current++, role: "user", text }]);
    try {
      const result = await api.ask(buildAskRequest(text, selected));
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text: result.answer ?? RETRIEVAL_ONLY_TEXT,
          sources: result.sources,
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: "assistant", text: errorText(error), error: true },
      ]);
    } finally {
      setAsking(false);
      busy.current = false;
      textarea.current?.focus();
    }
  }
  async function deleteDocument() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await api.deleteDocument({ id: deleteTarget.id });
      setDeleteTarget(null);
      await refreshDocuments();
    } catch (error) {
      setDeleteError(errorText(error));
    } finally {
      setDeleting(false);
    }
  }
  const healthy = health?.database === "ok" && health.ollama === "ok";
  const healthTooltip =
    healthError ||
    (health
      ? `Database: ${health.database} · Ollama: ${health.ollama}`
      : "Checking local services…");

  return (
    <div className="app-shell">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b px-5 md:px-7">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            title="Your contracts"
            aria-label="Toggle contract sidebar"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <PanelLeft />
          </Button>
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Files className="size-5" strokeWidth={1.7} />
          </div>
          <span className="font-display text-xl font-bold">
            Contract<span className="text-primary">Buddy</span>
          </span>
          <span className="ml-4 hidden border-l pl-5 text-xs text-muted-foreground lg:block">
            A little clarity. A lot less fine print.
          </span>
        </div>
        <div
          title={healthTooltip}
          aria-label={healthTooltip}
          tabIndex={0}
          className="flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs"
        >
          <span
            className={`size-1.5 rounded-full ${healthy ? "bg-success" : healthChecking && !healthError ? "bg-muted-foreground" : "bg-destructive"}`}
          />{" "}
          <span className="hidden sm:inline">
            {healthy
              ? "Local services online"
              : healthChecking && !healthError && !health
                ? "Connecting…"
                : "Local services offline"}
          </span>
          <span className="sm:hidden">{healthy ? "Online" : "Offline"}</span>
        </div>
      </header>
      <div className="app-body">
        <aside className={`contracts-sidebar ${mobileOpen ? "mobile-open" : ""}`}>
          <div className="flex items-center justify-between px-6 pb-4 pt-6">
            <h2 className="text-sm font-semibold">Your contracts</h2>
            <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
              {documents.length}
            </span>
          </div>
          <div className="px-5">
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className="sr-only"
              aria-label="Upload PDF contracts"
              disabled={!!uploadProgress}
              onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
            />
            <div
              className={`upload-zone flex flex-col items-center px-4 py-6 ${dragging ? "dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void uploadFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <div className="mb-3 grid size-10 place-items-center rounded-full bg-secondary text-primary">
                {uploadProgress ? (
                  <LoaderCircle className="size-5 animate-spin" />
                ) : (
                  <Upload className="size-5" strokeWidth={1.5} />
                )}
              </div>
              <p className="max-w-full truncate text-sm font-medium" title={uploadProgress?.name}>
                {uploadProgress ? uploadProgress.name : "Drop your contracts here"}
              </p>
              <p className="mb-4 mt-1 text-xs text-muted-foreground">
                {uploadProgress
                  ? `Indexing PDF ${uploadProgress.index} of ${uploadProgress.total}…`
                  : "PDF files only"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInput.current?.click()}
                disabled={!!uploadProgress}
              >
                <Plus className="size-3.5" />
                {uploadProgress ? "Processing…" : "Choose files"}
              </Button>
              {uploadProgress && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Large PDFs can take up to a minute.
                </p>
              )}
            </div>
            {uploadError && (
              <p
                role="alert"
                className="mt-3 whitespace-pre-wrap break-words text-xs text-destructive"
              >
                {uploadError}
              </p>
            )}
          </div>
          <div className="mt-6 flex items-center justify-between px-6 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <span>Documents</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              title="Refresh contracts"
              aria-label="Refresh contracts"
              onClick={() => void refreshDocuments()}
              disabled={listLoading}
            >
              <RefreshCw className={listLoading ? "animate-spin" : ""} />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-2">
            {listLoading && !documents.length ? (
              <div className="flex items-center justify-center gap-2 py-12 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading contracts…
              </div>
            ) : !documents.length ? (
              <div className="px-5 py-10 text-center">
                <FolderOpen
                  className="mx-auto mb-3 size-7 text-muted-foreground/60"
                  strokeWidth={1.3}
                />
                <p className="text-sm font-medium">No contracts yet</p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  Your rental agreement, insurance,
                  <br />
                  or that fine print you never read.
                </p>
              </div>
            ) : (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`mb-2 rounded-md border p-3 ${selected.includes(doc.id) ? "border-primary/35 bg-secondary/50" : "bg-background"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <Checkbox
                      id={`document-${doc.id}`}
                      checked={selected.includes(doc.id)}
                      aria-label={`Select ${doc.filename}`}
                      className="mt-1"
                      onCheckedChange={(checked) =>
                        setSelected((ids) =>
                          checked ? [...ids, doc.id] : ids.filter((id) => id !== doc.id),
                        )
                      }
                    />
                    <label htmlFor={`document-${doc.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block break-words text-xs font-semibold leading-5">
                        {doc.filename}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {dateText(doc.uploaded_at)}
                      </span>
                    </label>
                  </div>
                  <div className="ml-6 mt-2 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-muted-foreground">
                      {doc.page_count} pages · {doc.chunk_count} chunks
                    </span>
                    <div className="flex">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6"
                        title="View chunks"
                        aria-label={`View chunks of ${doc.filename}`}
                        onClick={() => setChunkTarget(doc)}
                      >
                        <List className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        title="Delete contract"
                        aria-label={`Delete ${doc.filename}`}
                        onClick={() => {
                          setDeleteError("");
                          setDeleteTarget(doc);
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
            {listError && !healthError && (
              <p role="alert" className="mt-3 break-words text-xs text-destructive">
                {listError}
              </p>
            )}
          </div>
          <div className="border-t px-6 py-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              Your files stay on your machine
            </div>
          </div>
        </aside>
        <main className="chat-panel">
          <div className="flex min-h-[73px] shrink-0 items-center justify-between gap-2 border-b px-6 md:px-8">
            <div>
              <h1 className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquare className="size-4 text-primary" />
                Contract assistant
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.length
                  ? `${selected.length} ${selected.length === 1 ? "contract" : "contracts"} selected`
                  : "All contracts"}
              </p>
            </div>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                disabled={asking}
                onClick={() => setMessages([])}
                title="Clear conversation"
              >
                <Plus />
                New chat
              </Button>
            )}
          </div>
          {healthError && (
            <div
              role="status"
              className="flex items-center gap-3 border-b bg-warning-surface px-5 py-2.5 text-xs text-warning md:px-8"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 break-words">{healthError}</span>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 shrink-0"
                aria-label="Retry connection"
                title="Retry connection"
                disabled={healthChecking}
                onClick={() => {
                  void checkHealth();
                  void refreshDocuments();
                }}
              >
                <RefreshCw className={healthChecking ? "animate-spin" : ""} />
              </Button>
            </div>
          )}
          {!healthError && health && !healthy && (
            <div
              role="status"
              className="border-b bg-warning-surface px-6 py-3 text-xs text-warning"
            >
              {health.database === "error" ? "Database is unavailable. " : ""}
              {health.ollama === "error" ? "Ollama is unavailable." : ""}
            </div>
          )}
          <div className="chat-scroll">
            {!messages.length ? (
              <div className="chat-inner empty-chat">
                <div className="paper-scene" aria-hidden="true">
                  <div className="paper paper-back">
                    <div className="paper-line" />
                    <div className="paper-line short" />
                    <div className="paper-line" />
                  </div>
                  <div className="paper paper-front">
                    <FileText className="size-6 text-primary" strokeWidth={1.3} />
                    <div className="paper-line" />
                    <div className="paper-line" />
                    <div className="paper-line short" />
                  </div>
                  <div className="paper-seal">
                    <Check className="size-4" strokeWidth={2.5} />
                  </div>
                </div>
                <span className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                  Less fine print. More peace of mind.
                </span>
                <h2 className="font-display text-[28px] font-bold leading-tight sm:text-[32px]">
                  Make sense of your contracts.
                </h2>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                  The important details shouldn't be hard to find.
                  <br className="hidden sm:block" /> What would you like to know?
                </p>
                <div className="mt-9 grid w-full max-w-[660px] grid-cols-1 gap-3 sm:grid-cols-3">
                  {examples.map((example) => (
                    <Button
                      key={example.title}
                      variant="outline"
                      className="h-auto min-h-[106px] flex-col items-start gap-3 whitespace-normal p-4 text-left shadow-none"
                      onClick={() => {
                        setQuestion(example.question);
                        textarea.current?.focus();
                      }}
                    >
                      <example.icon className="text-primary" strokeWidth={1.5} />
                      <span className="w-full">
                        <span className="block text-xs font-semibold">{example.title}</span>
                        <span className="mt-1 flex items-center justify-between gap-1 text-[11px] font-normal text-muted-foreground">
                          {example.label}
                          <ArrowRight className="size-3" />
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-inner space-y-7 py-8">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message-enter flex ${message.role === "user" ? "justify-end" : "items-start gap-3"}`}
                  >
                    {message.role === "assistant" && (
                      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-secondary text-primary">
                        <Sparkles className="size-3.5" />
                      </div>
                    )}
                    <div
                      className={
                        message.role === "user"
                          ? "max-w-[85%] rounded-lg bg-secondary px-4 py-3"
                          : "min-w-0 flex-1 pt-1"
                      }
                    >
                      {message.role === "assistant" && (
                        <div className="mb-2 text-xs font-semibold">ContractBuddy</div>
                      )}
                      <p
                        role={message.error ? "alert" : undefined}
                        className={`whitespace-pre-wrap break-words text-sm leading-7 ${message.error ? "text-destructive" : ""}`}
                      >
                        {message.text}
                      </p>
                      {message.sources && message.sources.length > 0 && (
                        <Sources sources={message.sources} />
                      )}
                    </div>
                  </div>
                ))}
                {asking && (
                  <div
                    role="status"
                    className="flex items-center gap-3 text-sm text-muted-foreground"
                  >
                    <div className="grid size-7 place-items-center rounded-md bg-secondary text-primary">
                      <LoaderCircle className="size-3.5 animate-spin" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">
                        Reading between the lines…{" "}
                        <span className="ml-1 tabular-nums">{elapsed}s</span>
                      </p>
                      <p className="mt-1 text-[11px]">Your local model may take up to a minute.</p>
                    </div>
                  </div>
                )}
                <div ref={scrollEnd} />
              </div>
            )}
          </div>
          <div className="chat-inner shrink-0 pb-4 pt-3">
            <form
              className="composer p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void sendQuestion();
              }}
            >
              <textarea
                ref={textarea}
                aria-label="Ask about your contracts"
                placeholder="z. B. Wie lang ist meine Kündigungsfrist?"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                className="block min-h-[52px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/80"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                  <Files className="size-3.5 shrink-0" />
                  {selected.length ? `${selected.length} selected contracts` : "All contracts"}
                  {selected.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-5"
                      aria-label="Search all contracts"
                      title="Search all contracts"
                      onClick={() => setSelected([])}
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </span>
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Send question"
                  title="Send question"
                  disabled={!question.trim() || asking}
                  className="size-8"
                >
                  {asking ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
                </Button>
              </div>
            </form>
            <p className="mt-3 text-center text-[10px] text-muted-foreground">
              A helpful second pair of eyes, not legal advice. Always verify important details.
            </p>
          </div>
        </main>
      </div>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-32px)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {deleteTarget?.filename} and its indexed chunks will be permanently removed. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <p role="alert" className="break-words text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep contract</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={() => void deleteDocument()}>
              {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting…" : "Delete contract"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet
        open={!!chunkTarget}
        onOpenChange={(open) => {
          if (!open) setChunkTarget(null);
        }}
      >
        <SheetContent className="flex w-full flex-col sm:max-w-xl">
          <SheetHeader className="shrink-0 pr-6 text-left">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Document inspector
            </span>
            <SheetTitle className="break-words">{chunkTarget?.filename}</SheetTitle>
            <SheetDescription>
              {chunkTarget?.page_count} pages · {chunkTarget?.chunk_count} indexed chunks
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
            {chunksLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading chunks…
              </div>
            ) : chunkError ? (
              <p role="alert" className="break-words text-sm text-destructive">
                {chunkError}
              </p>
            ) : chunks.length ? (
              chunks.map((chunk) => (
                <article key={chunk.chunk_index} className="rounded-md border p-4">
                  <div className="mb-3 flex justify-between text-xs font-medium">
                    <span className="text-primary">Page {chunk.page_number}</span>
                    <span className="text-muted-foreground">Chunk {chunk.chunk_index}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">{chunk.text}</p>
                </article>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No indexed chunks in this document.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
