import {
  formatWhiteLabelContact,
  isWhiteLabelActive,
  type WhiteLabelSettings,
} from '../settings/white-label-settings';

export function AuditWhiteLabelBranding({ settings }: { settings: WhiteLabelSettings }) {
  if (!isWhiteLabelActive(settings)) return null;

  const contact = formatWhiteLabelContact(settings);

  return (
    <>
      <header className="audit-white-label" aria-label="Agency branding">
        {settings.logoDataUrl ? (
          <img className="audit-white-label-logo" src={settings.logoDataUrl} alt="" />
        ) : null}
        <div className="audit-white-label-body">
          {settings.agencyName ? (
            <div className="audit-white-label-name">{settings.agencyName}</div>
          ) : null}
          {settings.tagline ? <div className="audit-white-label-tagline">{settings.tagline}</div> : null}
          {contact ? <div className="audit-white-label-contact">{contact}</div> : null}
          <div className="audit-white-label-report-type">Google Business Profile Audit Report</div>
        </div>
      </header>
      <p className="audit-white-label-hint no-print">Agency branding — shown on exported PDFs</p>
      <footer className="audit-white-label-footer print-only" aria-hidden="true">
        {settings.agencyName ? `Prepared by ${settings.agencyName}` : 'Prepared for your review'}
        {settings.website ? ` · ${settings.website}` : contact ? ` · ${contact}` : ''}
      </footer>
    </>
  );
}
