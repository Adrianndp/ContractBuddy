import { afterEach, describe, expect, it, vi } from "vitest";
import { api, API_URL, buildAskRequest, HEALTH_INTERVAL_MS, isPdf } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("ContractBuddy API rules", () => {
  it("omits document_ids when no contracts are selected", () => {
    expect(buildAskRequest("What is my notice period?", [])).toEqual({
      question: "What is my notice period?",
    });
  });
  it("limits the question to the selected contract IDs", () => {
    expect(buildAskRequest("Notice period?", [3, 8])).toEqual({
      question: "Notice period?",
      document_ids: [3, 8],
    });
  });
  it("checks health every 30 seconds", () => {
    expect(HEALTH_INTERVAL_MS).toBe(30_000);
  });
  it("accepts PDFs and rejects other file formats without an API call", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(isPdf(new File(["pdf"], "rental.PDF", { type: "application/pdf" }))).toBe(true);
    await expect(
      api.upload({ file: new File(["text"], "rental.txt", { type: "text/plain" }) }),
    ).rejects.toThrow("Only PDF files are supported.");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("uploads the PDF using the file form field", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 3 }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    await api.upload({ file: new File(["pdf"], "rental.pdf", { type: "application/pdf" }) });
    const options = fetch.mock.calls[0]?.[1] as RequestInit;
    expect(options.body).toBeInstanceOf(FormData);
    expect((options.body as FormData).get("file")).toBeInstanceOf(File);
  });
  it("shows the backend detail unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail: "Contract not found" }), { status: 404 }),
        ),
    );
    await expect(api.deleteDocument({ id: 3 })).rejects.toThrow("Contract not found");
  });
  it("identifies the unreachable backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.health()).rejects.toThrow(`Backend not reachable at ${API_URL}`);
  });
  it("handles successful deletion without parsing an empty body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(api.deleteDocument({ id: 3 })).resolves.toBeUndefined();
  });
});
