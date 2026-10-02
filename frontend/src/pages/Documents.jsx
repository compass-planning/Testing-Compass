import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Upload, Trash2, Download, Mic, Square, FolderOpen, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { docsApi, meetingsApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Badge, Empty, Select } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";

const CATS = ["document", "statement", "will", "tax", "insurance", "other"];
const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtTs = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Documents() {
  const { user } = useAuth();
  const readOnly = user.tier === "enterprise";
  const [tab, setTab] = useState("vault");
  return (
    <div data-testid="documents-page">
      <PageHeader title="Documents & Meetings" subtitle="A secure vault for plans, statements and wills — plus recorded meeting notes." />
      <div className="flex gap-1 mb-6 border-b border-compass-border">
        {[{ k: "vault", l: "Document Vault", i: FolderOpen }, { k: "meetings", l: "Meetings", i: Mic }].map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)} data-testid={`documents-tab-${t.k}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.k ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.i size={16} /> {t.l}
          </button>
        ))}
      </div>
      {tab === "vault" ? <Vault readOnly={readOnly} /> : <Meetings readOnly={readOnly} />}
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

function Meetings({ readOnly }) {
  const qc = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("Client meeting");
  const recRef = useRef(null);
  const chunks = useRef([]);
  const meetings = useQuery({ queryKey: ["meetings"], queryFn: meetingsApi.list });

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
                {!readOnly && <button onClick={() => del.mutate(m.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5" data-testid={`meeting-delete-${m.id}`}><Trash2 size={15} /></button>}
              </div>
              <p className="text-sm text-compass-navy mt-3 whitespace-pre-wrap leading-relaxed">{m.transcript || <span className="text-compass-muted italic">No speech detected.</span>}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
