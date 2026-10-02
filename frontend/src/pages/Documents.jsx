import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Trash2, Download, Mic, Square, FolderOpen, Loader2, Sparkles, ListChecks, FileSearch, Check, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { docsApi, meetingsApi, lettersApi, planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, Empty, Select, Modal, Input } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";

const CATS = ["document", "statement", "will", "tax", "insurance", "other"];
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtTs = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Documents() {
  const { user } = useAuth();
  const readOnly = user.tier === "enterprise" && !user.enterprise_write;
  const [tab, setTab] = useState("vault");
  const tabs = [{ k: "vault", l: "Document Vault", i: FolderOpen }, { k: "meetings", l: "Meetings", i: Mic }];
  if (!readOnly) tabs.push({ k: "letters", l: "Letters & Policies", i: FileSearch });
  return (
    <div data-testid="documents-page">
      <PageHeader title="Documents & Meetings" subtitle="A secure vault for plans, statements and wills — plus recorded meeting notes." />
      <div className="flex gap-1 mb-6 border-b border-compass-border">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`documents-tab-${t.k}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.k ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.i size={16} /> {t.l}
          </button>
        ))}
      </div>
      {tab === "vault" && <Vault readOnly={readOnly} />}
      {tab === "meetings" && <Meetings readOnly={readOnly} isAdvisor={user.tier === "advisor"} />}
      {tab === "letters" && <LettersImporter />}
    </div>
  );
}

function Vault({ readOnly }) {
  const qc = useQueryClient();
  const [cat, setCat] = useState("document");
  const fileRef = useRef(null);
  const files = useQuery({ queryKey: ["doc-files"], queryFn: docsApi.list });
  const upload = useMutation({
    mutationFn: (file) => { const fd = new FormData(); fd.append("file", file); fd.append("category", cat); return docsApi.upload(fd); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["doc-files"] }); toast.success("File uploaded"); if (fileRef.current) fileRef.current.value = ""; },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Upload failed"),
  });
  const del = useMutation({ mutationFn: docsApi.remove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["doc-files"] }); toast.success("File removed"); } });
  const download = async (f) => {
    try {
      const res = await api.get(docsApi.downloadUrl(f.id), { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: f.content_type }));
      const a = document.createElement("a"); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch { toast.error("Download failed"); }
  };
  const rows = files.data || [];

  return (
    <div>
      {!readOnly && (
        <Card className="p-5 mb-6 flex flex-wrap items-center gap-3" data-testid="vault-upload">
          <div className="w-44"><Select value={cat} onChange={(e) => setCat(e.target.value)} data-testid="vault-category">{CATS.map((c) => <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>)}</Select></div>
          <input ref={fileRef} type="file" onChange={(e) => e.target.files[0] && upload.mutate(e.target.files[0])} className="hidden" data-testid="vault-file-input" />
          <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending} data-testid="vault-upload-btn">
            {upload.isPending ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {upload.isPending ? "Uploading…" : "Upload file"}
          </Button>
          <span className="text-xs text-compass-muted">Max 10MB · stored securely in your household vault.</span>
        </Card>
      )}
      {rows.length === 0 ? (
        <Empty icon={FileText} title="No documents yet">Upload plans, statements, wills and other household documents.</Empty>
      ) : (
        <div className="space-y-2" data-testid="vault-list">
          {rows.map((f) => (
            <Card key={f.id} className="p-4 flex items-center gap-3" data-testid={`doc-${f.id}`}>
              <div className="h-9 w-9 rounded-xl bg-compass-blue/10 flex items-center justify-center shrink-0"><FileText size={18} className="text-compass-blue" /></div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-compass-navy truncate">{f.name}</div>
                <div className="text-xs text-compass-muted">{kb(f.size)} · {fmtTs(f.uploaded_at)}</div>
              </div>
              <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{f.category}</Badge>
              <Button size="sm" variant="outline" onClick={() => download(f)} data-testid={`doc-download-${f.id}`}><Download size={14} /></Button>
              {!readOnly && <Button size="sm" variant="ghost" onClick={() => del.mutate(f.id)} data-testid={`doc-delete-${f.id}`}><Trash2 size={14} /></Button>}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Meetings({ readOnly, isAdvisor }) {
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("Client meeting");
  const recRef = useRef(null);
  const chunks = useRef([]);
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingsApi.list });

  const [suggestFor, setSuggestFor] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [picked, setPicked] = useState({});
  const [dueDates, setDueDates] = useState({});
  const [suggestClient, setSuggestClient] = useState(null);
  const runSuggest = async (m) => {
    setSuggestFor(m); setSuggestLoading(true); setSuggestions([]); setPicked({}); setDueDates({});
    setSuggestClient(m.household_id || localStorage.getItem("compass_active_household"));
    try {
      const res = await meetingsApi.suggestTasks(m.id);
      const list = res.suggestions || [];
      setSuggestions(list);
      const init = {}; list.forEach((_, i) => { init[i] = true; }); setPicked(init);
      if (res.client_id) setSuggestClient(res.client_id);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not suggest tasks"); setSuggestFor(null);
    } finally { setSuggestLoading(false); }
  };
  const addTasks = useMutation({
    mutationFn: async () => {
      const chosen = suggestions.map((t, i) => ({ t, i })).filter(({ i }) => picked[i]);
      for (const { t, i } of chosen) await api.post("/advisor/tasks", { client_id: suggestClient, title: t.title, due_date: dueDates[i] || null });
      return chosen.length;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success(`${n} task${n === 1 ? "" : "s"} added to the board`); setSuggestFor(null); },
    onError: () => toast.error("Could not add tasks"),
  });

  const send = async (blob) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", blob, "recording.webm");
      fd.append("title", title || "Client meeting");
      await meetingsApi.transcribe(fd);
      qc.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Meeting transcribed");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Transcription failed");
    } finally { setBusy(false); }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = () => { stream.getTracks().forEach((t) => t.stop()); send(new Blob(chunks.current, { type: "audio/webm" })); };
      rec.start(); recRef.current = rec; setRecording(true);
    } catch { toast.error("Microphone access denied"); }
  };
  const stop = () => { recRef.current?.stop(); setRecording(false); };
  const del = useMutation({ mutationFn: meetingsApi.remove, onSuccess: () => { qc.invalidateQueries({ queryKey: ["meetings"] }); toast.success("Meeting removed"); } });
  const rows = meetings.data || [];

  return (
    <div>
      {!readOnly && (
        <Card className="p-5 mb-6" data-testid="meeting-recorder">
          <div className="flex flex-wrap items-center gap-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title…" data-testid="meeting-title"
              className="flex-1 min-w-[200px] rounded-lg border border-compass-border bg-white px-3 py-2 text-sm text-compass-navy focus:border-compass-blue focus:outline-none" />
            {!recording ? (
              <Button onClick={start} disabled={busy} data-testid="meeting-record">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Mic size={16} />} {busy ? "Transcribing…" : "Record"}
              </Button>
            ) : (
              <Button onClick={stop} className="!bg-compass-red" data-testid="meeting-stop"><Square size={16} /> Stop & transcribe</Button>
            )}
          </div>
          {recording && <div className="mt-3 flex items-center gap-2 text-sm text-compass-red font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-compass-red animate-pulse" /> Recording… speak now, then Stop to transcribe.</div>}
          <p className="text-xs text-compass-muted mt-3">Audio is transcribed with Whisper and saved as a note on this household. We never store the raw recording.</p>
        </Card>
      )}
      {rows.length === 0 ? (
        <Empty icon={Mic} title="No meeting notes yet">Record a client meeting to capture a searchable transcript.</Empty>
      ) : (
        <div className="space-y-3" data-testid="meeting-list">
          {rows.map((m) => (
            <Card key={m.id} className="p-5" data-testid={`meeting-${m.id}`}>
              <div className="flex items-start justify-between">
                <div><div className="font-heading font-bold text-compass-navy">{m.title}</div><div className="text-xs text-compass-muted">{fmtTs(m.created_at)}</div></div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isAdvisor && <Button size="sm" variant="outline" onClick={() => runSuggest(m)} data-testid={`meeting-suggest-${m.id}`}><Sparkles size={13} /> Suggest tasks</Button>}
                  {!readOnly && <button onClick={() => del.mutate(m.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5" data-testid={`meeting-delete-${m.id}`}><Trash2 size={15} /></button>}
                </div>
              </div>
              <p className="text-sm text-compass-navy mt-3 whitespace-pre-wrap leading-relaxed">{m.transcript || <span className="text-compass-muted italic">No speech detected.</span>}</p>
            </Card>
          ))}
        </div>
      )}
      <Modal open={!!suggestFor} onClose={() => setSuggestFor(null)} title="Suggested follow-up tasks" testid="suggest-tasks-modal">
        {suggestLoading ? (
          <div className="py-8 text-center text-sm text-compass-muted"><Loader2 className="animate-spin inline mr-2" size={16} /> Reading the transcript…</div>
        ) : suggestions.length === 0 ? (
          <div className="py-6 text-center text-sm text-compass-muted" data-testid="suggest-empty">No clear follow-ups found in this meeting.</div>
        ) : (
          <>
            <p className="text-sm text-compass-muted mb-3">Select the tasks to add to your board.</p>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {suggestions.map((t, i) => (
                <label key={i} className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-compass-border px-3 py-2" data-testid={`suggest-task-${i}`}>
                  <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))} className="h-4 w-4 mt-0.5 accent-compass-blue" />
                  <span className="text-compass-navy flex-1 min-w-0">{t.title}</span>
                  <input type="date" value={dueDates[i] || ""} onChange={(e) => setDueDates((d) => ({ ...d, [i]: e.target.value }))} title="Optional due date" data-testid={`suggest-due-${i}`}
                    className="shrink-0 rounded-lg border border-compass-border bg-white px-2 py-1 text-xs text-compass-navy focus:border-compass-blue focus:outline-none" />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="ghost" onClick={() => setSuggestFor(null)}>Cancel</Button>
              <Button onClick={() => addTasks.mutate()} disabled={addTasks.isPending || !Object.values(picked).some(Boolean)} data-testid="suggest-add-selected"><ListChecks size={15} /> Add selected</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}


const POLICY_TYPES = ["Term Life", "Whole Life", "Disability", "Critical Illness", "Long-Term Care", "Health"];

function LettersImporter() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState(null); // null = nothing parsed yet
  const [picked, setPicked] = useState({});
  const [fileName, setFileName] = useState("");
  const reviewQ = useQuery({ queryKey: ["plan", "insurance"], queryFn: () => planApi.list("insurance") });
  const flagged = (reviewQ.data || []).filter((p) => p.needs_review);
  const markReviewed = useMutation({ mutationFn: (id) => planApi.update("insurance", id, { needs_review: false, review_fields: [] }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["plan", "insurance"] }); toast.success("Marked reviewed"); } });

  const parse = async (file) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name)) { toast.error("Please upload a PDF file"); return; }
    setBusy(true); setPolicies(null); setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await lettersApi.parse(fd);
      const list = res.policies || [];
      setPolicies(list);
      const init = {}; list.forEach((_, i) => { init[i] = true; }); setPicked(init);
      if (list.length === 0) toast.info("No policies detected in that document.");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not read that PDF");
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const edit = (i, key, val) => setPolicies((ps) => ps.map((p, idx) => (idx === i ? { ...p, [key]: val } : p)));

  const addSelected = useMutation({
    mutationFn: async () => {
      const chosen = (policies || []).map((p, i) => ({ p, i })).filter(({ i }) => picked[i]);
      for (const { p } of chosen) {
        await planApi.create("insurance", {
          policy_type: p.policy_type,
          carrier: p.carrier || "",
          coverage: Number(p.coverage) || 0,
          premium: Number(p.premium) || 0,
          insured: p.insured || "",
          policy_number: p.policy_number || "",
          renewal_date: p.renewal_date || null,
          source: "imported",
          needs_review: (p.low_confidence || []).length > 0,
          review_fields: p.low_confidence || [],
        });
      }
      return chosen.length;
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ["plan", "insurance"] }); toast.success(`${n} polic${n === 1 ? "y" : "ies"} added to the plan`); setPolicies(null); setFileName(""); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Open a household first"),
  });

  return (
    <div>
      <Card className="p-5 mb-6" data-testid="letters-importer">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" data-testid="letters-file-input"
            onChange={(e) => e.target.files[0] && parse(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="letters-upload-btn">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />} {busy ? "Reading policy…" : "Upload policy PDF"}
          </Button>
          <span className="text-xs text-compass-muted">We read the PDF with AI and extract the policies — you review and confirm before anything is saved.</span>
        </div>
        {fileName && !busy && <div className="text-xs text-compass-muted mt-3 flex items-center gap-1.5"><FileText size={13} /> {fileName}</div>}
      </Card>

      {flagged.length > 0 && (
        <Card className="p-5 mb-6 border-amber-200" data-testid="ocr-review-queue">
          <div className="flex items-center gap-2 mb-3 font-heading font-bold text-compass-navy"><AlertTriangle size={16} className="text-amber-500" /> Needs review ({flagged.length})</div>
          <p className="text-xs text-compass-muted mb-3">Imported policies with fields the scan read with low confidence. Verify the values on each, then mark reviewed.</p>
          <div className="space-y-2">
            {flagged.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm border-b border-compass-border/60 pb-2" data-testid={`review-item-${p.id}`}>
                <div><span className="font-semibold text-compass-navy">{p.carrier || "Policy"} · {p.policy_type}</span>{(p.review_fields || []).length > 0 && <span className="text-amber-600 text-xs ml-2">check: {(p.review_fields || []).join(", ")}</span>}</div>
                <Button size="sm" variant="outline" onClick={() => markReviewed.mutate(p.id)} data-testid={`mark-reviewed-${p.id}`}><Check size={14} /> Mark reviewed</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {policies === null ? (
        <Empty icon={FileSearch} title="Import coverage from a letter or policy">Upload an insurance policy or coverage letter (PDF) and we'll pull out the policies so you can add them to the plan in one click.</Empty>
      ) : policies.length === 0 ? (
        <Empty icon={FileSearch} title="No policies found">We couldn't detect any insurance policies in that document. Try a clearer policy PDF.</Empty>
      ) : (
        <div data-testid="letters-results">
          <p className="text-sm text-compass-muted mb-3">Review the extracted policies, edit anything that looks off, then add the ones you want.</p>
          <div className="space-y-3">
            {policies.map((p, i) => { const lc = p.low_confidence || []; const flagCls = (f) => lc.includes(f) ? " ring-2 ring-amber-400 border-amber-400" : ""; return (
              <Card key={i} className="p-4" data-testid={`letter-policy-${i}`}>
                <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
                  <input type="checkbox" checked={!!picked[i]} onChange={(e) => setPicked((pk) => ({ ...pk, [i]: e.target.checked }))} className="h-4 w-4 accent-compass-blue" data-testid={`letter-pick-${i}`} />
                  <span className="font-heading font-bold text-compass-navy">{p.carrier || "Policy"} <span className="text-compass-muted font-normal">· {p.policy_type}</span></span>
                </label>
                {lc.length > 0 && <div className="flex items-center gap-1.5 mb-3 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5" data-testid={`letter-lowconf-${i}`}><AlertTriangle size={13} /> Low confidence on {lc.length} field{lc.length === 1 ? "" : "s"} — please double-check the highlighted value{lc.length === 1 ? "" : "s"}.</div>}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Lab label="Type"><Select value={p.policy_type} onChange={(e) => edit(i, "policy_type", e.target.value)} className={flagCls("policy_type")} data-testid={`letter-type-${i}`}>{POLICY_TYPES.map((pt) => <option key={pt} value={pt}>{pt}</option>)}</Select></Lab>
                  <Lab label="Carrier"><Input value={p.carrier || ""} onChange={(e) => edit(i, "carrier", e.target.value)} className={flagCls("carrier")} data-testid={`letter-carrier-${i}`} /></Lab>
                  <Lab label="Insured"><Input value={p.insured || ""} onChange={(e) => edit(i, "insured", e.target.value)} className={flagCls("insured")} data-testid={`letter-insured-${i}`} /></Lab>
                  <Lab label="Coverage"><Input type="number" value={p.coverage ?? ""} onChange={(e) => edit(i, "coverage", e.target.value)} className={flagCls("coverage")} data-testid={`letter-coverage-${i}`} /></Lab>
                  <Lab label="Premium"><Input type="number" value={p.premium ?? ""} onChange={(e) => edit(i, "premium", e.target.value)} className={flagCls("premium")} data-testid={`letter-premium-${i}`} /></Lab>
                  <Lab label="Policy #"><Input value={p.policy_number || ""} onChange={(e) => edit(i, "policy_number", e.target.value)} className={flagCls("policy_number")} data-testid={`letter-number-${i}`} /></Lab>
                  <Lab label="Renewal date"><Input type="date" value={p.renewal_date || ""} onChange={(e) => edit(i, "renewal_date", e.target.value)} className={flagCls("renewal_date")} data-testid={`letter-renewal-${i}`} /></Lab>
                </div>
              </Card>
            ); })}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => { setPolicies(null); setFileName(""); }}>Discard</Button>
            <Button onClick={() => addSelected.mutate()} disabled={addSelected.isPending || !Object.values(picked).some(Boolean)} data-testid="letters-add-selected">
              {addSelected.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={15} />} Add selected to plan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Lab({ label, children }) {
  return <div><div className="muted-label mb-1">{label}</div>{children}</div>;
}
