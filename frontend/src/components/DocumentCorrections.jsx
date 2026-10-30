import { useRef, useState } from 'react';
import { replaceBurialDocuments } from '../api.js';
import { REQUIRED_DOCUMENTS, DOCUMENT_ACCEPT, MAX_DOCUMENT_SIZE_MB } from '../data/burialRequirements.js';

export default function DocumentCorrections({ application, onSaved }) {
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const documents = application.documents || [];
  const missing = application.documentCompleteness?.missing_document_types || [];
  const required = REQUIRED_DOCUMENTS.filter(item => missing.includes(item.key) || documents.some(
    doc => doc.document_type === item.key && doc.verification_status === 'needs_correction'));
  async function submit() {
    if (pending.current) return;
    setError('');
    if (!required.length) return setError('No replacement documents are listed. Contact the office to clarify the requested action.');
    if (required.some(item => !files[item.key])) return setError('Choose a file for every document requested below.');
    if (Object.values(files).some(file => file.size > MAX_DOCUMENT_SIZE_MB * 1024 * 1024)) return setError(`Each file must be ${MAX_DOCUMENT_SIZE_MB} MB or smaller.`);
    pending.current = true;
    setBusy(true);
    try {
      const result = await replaceBurialDocuments(application.rawId, files);
      if (result.errors?.length || required.some(item => !result.uploaded?.includes(item.key))) {
        throw new Error('The server did not accept all selected documents. Refresh and check their status.');
      }
      setFiles({});
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div style={{ padding: 16, marginBottom: 16, border: '1px solid var(--red)', borderRadius: 'var(--radius)' }}>
    <strong>Action Required: Resubmit Documents</strong>
    <p style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{application.detail}</p>
    {required.map(item => <label key={item.key} style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
      {item.label}
      <span style={{ display: 'block' }}>{documents.find(doc => doc.document_type === item.key)?.verification_note}</span>
      <input type="file" accept={DOCUMENT_ACCEPT} disabled={busy} onChange={event => {
        const file = event.target.files?.[0];
        setFiles(current => { const next = { ...current }; if (file) next[item.key] = file; else delete next[item.key]; return next; });
      }} />
    </label>)}
    {error && <p role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
    <button className="btn btn-primary" disabled={busy || !required.length} onClick={submit}>{busy ? 'Uploading…' : 'Submit Corrected Documents'}</button>
  </div>;
}
