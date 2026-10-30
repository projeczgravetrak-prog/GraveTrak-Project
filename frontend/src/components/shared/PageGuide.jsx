import { useState } from 'react';
import Modal from './Modal.jsx';
import { getPageGuide, getGuideRequirements, officeStarts } from '../../data/pageGuides.js';
import './PageGuide.css';

function BookIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 5v16M12 5C8 2 4 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-2-1-6-2-10 1Z" /></svg>;
}

// Read-only help: opening a guide never changes a record or makes a network request.
export default function PageGuide({ role, panel, active = true, quickStart = false, compact = false, className = '' }) {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const content = getPageGuide(role, panel);
  const office = officeStarts[role] || officeStarts.guest;
  if (!active || !content) return null;
  const requirements = getGuideRequirements(panel);
  return <>
    {quickStart ? !hidden && <aside className="guide-start" aria-label={`${office.name} quick start`}>
      <div className="guide-start-heading">
        <div><span className="guide-eyebrow">QUICK START · {office.name}</span><h2>New here? Start with these steps.</h2></div>
        <button type="button" className="guide-hide" onClick={() => setHidden(true)} aria-label="Hide quick start" title="You can reopen the instructions using How to use this page">×</button>
      </div>
      <ol>{office.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <button type="button" className="guide-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog"><BookIcon /> View full guide</button>
    </aside> : <div className={`guide-entry ${className}`}>
      <button type="button" className="guide-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`How to use this page: ${content.title}`} title={`How to use ${content.title}`}><BookIcon /><span>{compact ? 'Guide' : 'How to use this page'}</span></button>
    </div>}
    {open && <Modal title={`${content.title} guide`} onClose={() => setOpen(false)} className="page-guide-overlay" portalTarget={document.body} showCloseButton={false}>
      <div className="guide-role">{office.name}</div>
      <p className="guide-purpose">{content.purpose}</p>
      <section className="guide-section"><h3>Step by step</h3><ol className="guide-steps">{content.steps.map(step => <li key={step}>{step}</li>)}</ol></section>
      {requirements.length > 0 && <section className="guide-section"><h3>Prepare these documents</h3><ul className="guide-documents">{requirements.map(item => <li key={item.key}>{item.label}</li>)}</ul></section>}
      <section className="guide-reminder"><h3>Before you proceed</h3><p>{content.reminder}</p></section>
      <section className="guide-section"><h3>What happens next</h3><p>{content.next}</p></section>
      <details className="guide-office-overview"><summary>{office.name} quick start</summary><p>{office.intro}</p><ol>{office.steps.map(step => <li key={step}>{step}</li>)}</ol></details>
      <section className="guide-section guide-help"><h3>Need help?</h3><p>If the page shows a loading or connection error, wait and retry. After a save or submission times out, check the record before repeating the action.</p><p>{role === 'user' || role === 'guest' ? 'Contact the office with the application or grave ID and the error shown. Never send your password.' : 'Available actions depend on your account permissions and the record status. Ask your office administrator if a required action is unavailable.'}</p></section>
      <button type="button" className="btn btn-primary guide-done" onClick={() => setOpen(false)}>Got it — back to page</button>
    </Modal>}
  </>;
}
