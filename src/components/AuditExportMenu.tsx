import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import type { GbpAudit } from '../audit/types';
import { useWhiteLabelSettings } from '../hooks/useWhiteLabelSettings';
import type { BusinessLead } from '../types';
import { downloadAuditExport, type AuditExportFormat } from '../utils/audit-export';
import { downloadCsv } from '../utils/csv-export';

interface AuditExportMenuProps {
  lead: BusinessLead;
  audit: GbpAudit;
  standalone?: boolean;
  compact?: boolean;
}

export default function AuditExportMenu({
  lead,
  audit,
  standalone = false,
  compact = false,
}: AuditExportMenuProps) {
  const { settings: whiteLabelSettings } = useWhiteLabelSettings();
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!compact || !triggerRef.current) {
      setMenuStyle({});
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 6,
      left: rect.left,
      right: 'auto',
      minWidth: 220,
    });
  }, [compact]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    const onLayoutChange = () => updateMenuPosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onLayoutChange);
    window.addEventListener('scroll', onLayoutChange, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onLayoutChange);
      window.removeEventListener('scroll', onLayoutChange, true);
    };
  }, [open, updateMenuPosition]);

  const closeMenu = useCallback(() => setOpen(false), []);

  const handleExport = useCallback(
    async (format: AuditExportFormat) => {
      setExporting(true);
      try {
        if (format === 'pdf-print' && compact) {
          closeMenu();
          const params = new URLSearchParams({ leadId: lead.id, print: '1' });
          const url = chrome.runtime.getURL(`src/audit/index.html?${params.toString()}`);
          await chrome.tabs.create({ url, active: true });
          return;
        }
        await downloadAuditExport(lead, audit, format, whiteLabelSettings);
      } finally {
        setExporting(false);
        closeMenu();
      }
    },
    [lead, audit, whiteLabelSettings, closeMenu, compact]
  );

  const handleLeadCsvExport = useCallback(async () => {
    setExporting(true);
    try {
      await downloadCsv([lead]);
    } finally {
      setExporting(false);
      closeMenu();
    }
  }, [lead, closeMenu]);

  const handleOpenBrandingSettings = useCallback(() => {
    closeMenu();
    void chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD', tab: 'settings' });
  }, [closeMenu]);

  return (
    <div
      className={`export-dropdown${compact ? ' export-dropdown-compact' : ''}`}
      ref={rootRef}
    >
      <button
        ref={triggerRef}
        type="button"
        className={compact ? 'btn-audit-link export-menu-trigger' : 'btn-primary export-menu-trigger'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => {
            const next = !prev;
            if (next) updateMenuPosition();
            return next;
          });
        }}
        disabled={exporting}
      >
        {exporting ? 'Exporting…' : compact ? 'Export report' : 'Export ▾'}
      </button>
      {open ? (
        <div className="export-menu" role="menu" style={menuStyle}>
          <button type="button" role="menuitem" disabled={exporting} onClick={() => void handleExport('pdf')}>
            Download PDF
          </button>
          <button type="button" role="menuitem" disabled={exporting} onClick={() => void handleExport('pdf-print')}>
            PDF (Print…)
          </button>
          <button type="button" role="menuitem" disabled={exporting} onClick={() => void handleExport('csv')}>
            CSV Report
          </button>
          <button type="button" role="menuitem" disabled={exporting} onClick={() => void handleExport('json')}>
            JSON (Full Data)
          </button>
          <button type="button" role="menuitem" onClick={handleOpenBrandingSettings}>
            Configure agency branding…
          </button>
          {!standalone ? (
            <button type="button" role="menuitem" disabled={exporting} onClick={() => void handleLeadCsvExport()}>
              Lead CSV (with enrichment)
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
