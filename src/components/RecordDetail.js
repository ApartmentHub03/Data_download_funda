import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Helpers ────────────────────────────────────────────────────────────────

function isUrl(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

// Load an image URL into a base64 data URL via canvas (for jsPDF)
function loadImageAsBase64(url) {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 800;
        canvas.height = img.naturalHeight || 600;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const ratio = canvas.width / canvas.height;
        resolve({ data: canvas.toDataURL('image/jpeg', 0.82), ratio });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

// Try to show any URL as an image; fall back to a plain link if it can't load
function SmartImage({ src, altLabel }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" style={styles.link}>
        🔗 Open link
      </a>
    );
  }
  return (
    <img
      src={src}
      alt={altLabel || 'image'}
      style={styles.image}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Detect if an array looks like {title, value, subfeatures} feature sections ─
function isFeatureArray(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 0 &&
    typeof arr[0] === 'object' &&
    arr[0] !== null &&
    ('title' in arr[0] || 'subfeatures' in arr[0])
  );
}


// Recursively render any object without JSON.stringify anywhere
function DeepValue({ value, fieldKey }) {
  if (value === null || value === undefined || value === '') {
    return <span style={styles.nullText}>—</span>;
  }

  // ── Array ────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={styles.nullText}>—</span>;

    // All-URL array → image gallery
    if (value.every(i => typeof i === 'string' && isUrl(i))) {
      return (
        <div style={styles.gallery}>
          {value.map((url, i) => <SmartImage key={i} src={url} altLabel={`${fieldKey} ${i + 1}`} />)}
        </div>
      );
    }

    // Feature sections: [{title, value, subfeatures}, ...]
    if (isFeatureArray(value)) {
      return (
        <div style={styles.featureList}>
          {value.map((section, i) => (
            <div key={i} style={styles.featureSection}>
              {section.title && (
                <div style={styles.featureSectionTitle}>{section.title}</div>
              )}
              {section.value != null && section.value !== '' && (
                <div style={styles.featureSectionValue}>{String(section.value)}</div>
              )}
              {Array.isArray(section.subfeatures) && section.subfeatures.map((sf, j) => (
                <div key={j} style={styles.subFeatureRow}>
                  {typeof sf === 'object' && sf !== null
                    ? Object.entries(sf).map(([k, v]) => {
                        if (v === null || v === undefined) return null;
                        const isLabel = k === 'title' || k === 'label';
                        return (
                          <span key={k} style={isLabel ? styles.sfLabel : styles.sfValue}>
                            {isLabel ? String(v) : `: ${String(v)}`}
                          </span>
                        );
                      })
                    : <span>{String(sf)}</span>
                  }
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Mixed / generic array
    return (
      <div style={styles.flatObj}>
        {value.map((item, i) => (
          <div key={i}>
            <DeepValue value={item} fieldKey={`${fieldKey}[${i}]`} />
          </div>
        ))}
      </div>
    );
  }

  // ── Plain object ──────────────────────────────────────────────────────────
  if (typeof value === 'object') {
    return (
      <div style={styles.flatObj}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={styles.flatRow}>
            <span style={styles.flatKey}>{k.replace(/_/g, ' ')}</span>
            <DeepValue value={v} fieldKey={k} />
          </div>
        ))}
      </div>
    );
  }

  // ── Scalar ────────────────────────────────────────────────────────────────
  const str = String(value);
  if (isUrl(str)) return <SmartImage src={str} altLabel={fieldKey} />;
  return <span>{str}</span>;
}

// Keep SmartValue as a thin alias over DeepValue
function SmartValue({ fieldKey, value }) {
  return <DeepValue value={value} fieldKey={fieldKey || ''} />;
}

// ─── Collect all image URLs from a record ───────────────────────────────────
function collectImageUrls(record) {
  const urls = [];
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && isUrl(value)) {
      urls.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && isUrl(item)) urls.push(item);
      }
    }
  }
  return urls;
}

// ─── Flatten any value recursively to a human-readable string for PDF ────────
function flattenForPDF(value, depth) {
  const d = depth || 0;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value || '—';

  if (Array.isArray(value)) {
    if (value.length === 0) return '—';

    // All-URL array → skip (they are images)
    if (value.every(i => typeof i === 'string' && isUrl(String(i)))) return '(see images)';

    // Feature sections: [{title, value?, subfeatures?}, ...]
    if (isFeatureArray(value)) {
      return value.map(section => {
        const lines = [];
        if (section.title) lines.push(section.title.toUpperCase());
        if (section.value != null && section.value !== '') lines.push(String(section.value));
        if (Array.isArray(section.subfeatures)) {
          section.subfeatures.forEach(sf => {
            if (typeof sf === 'object' && sf !== null) {
              const sfParts = Object.entries(sf)
                .filter(([, v]) => v !== null && v !== undefined)
                .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`);
              if (sfParts.length) lines.push('  • ' + sfParts.join(', '));
            } else {
              lines.push('  • ' + String(sf));
            }
          });
        }
        return lines.join('\n');
      }).join('\n\n');
    }

    // Generic array
    return value
      .filter(v => !isUrl(String(v)))
      .map(v => flattenForPDF(v, d + 1))
      .filter(s => s && s !== '—')
      .join(d === 0 ? '\n' : '; ') || '—';
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${flattenForPDF(v, d + 1)}`)
      .join(' | ') || '—';
  }

  return String(value);
}

// ─── Main Component ──────────────────────────────────────────────────────────

function RecordDetail({ record, tableName, onBack }) {
  const [isGenerating, setIsGenerating] = useState(false);

  if (!record) return null;

  const entries = Object.entries(record);

  const recordTitle =
    record.address ||
    record.street ||
    record.name ||
    record.title ||
    record.external_id ||
    record.id ||
    'Record Details';

  // ── PDF Generation ──────────────────────────────────────────────────────────
  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 15;
      const contentW = pageW - margin * 2;
      const dateStr = new Date().toLocaleString();

      // ── Header band ──────────────────────────────────────────────────────────
      const drawHeader = (doc, subtitle = '') => {
        doc.setFillColor(10, 102, 194);
        doc.rect(0, 0, pageW, 26, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(
          (tableName?.replace(/_/g, ' ') || 'Record').toUpperCase() + (subtitle ? ` — ${subtitle}` : ''),
          margin,
          16
        );
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'normal');
        doc.text(dateStr, pageW - margin, 16, { align: 'right' });
        // thin accent line
        doc.setFillColor(255, 255, 255, 0.3);
        doc.rect(0, 26, pageW, 1, 'F');
      };

      // ── Footer ───────────────────────────────────────────────────────────────
      const drawFooter = (doc, page, total) => {
        doc.setFillColor(245, 246, 250);
        doc.rect(0, pageH - 12, pageW, 12, 'F');
        doc.setDrawColor(210, 215, 225);
        doc.setLineWidth(0.3);
        doc.line(0, pageH - 12, pageW, pageH - 12);
        doc.setFontSize(7);
        doc.setTextColor(140, 140, 160);
        doc.text('Funda Data Dashboard', margin, pageH - 4.5);
        doc.text(`Page ${page} of ${total}`, pageW - margin, pageH - 4.5, { align: 'right' });
      };

      // PAGE 1 — Images ─────────────────────────────────────────────────────────
      const imageUrls = collectImageUrls(record);

      // Record title (shown on page 1 regardless of whether there are images)
      const addRecordTitle = (doc, yStart) => {
        doc.setTextColor(25, 30, 40);
        doc.setFontSize(15);
        doc.setFont(undefined, 'bold');
        doc.text(String(recordTitle).substring(0, 80), margin, yStart);
        doc.setDrawColor(200, 210, 225);
        doc.setLineWidth(0.4);
        doc.line(margin, yStart + 4, pageW - margin, yStart + 4);
      };

      if (imageUrls.length > 0) {
        drawHeader(doc, 'IMAGES');
        addRecordTitle(doc, 36);

        const imageMarginTop = 32;
        let yPos = imageMarginTop;
        const gap = 6;
        const imgPerRow = 2;
        const imgW = (contentW - gap * (imgPerRow - 1)) / imgPerRow;
        let col = 0;
        let rowStartY = yPos;

        for (let idx = 0; idx < imageUrls.length; idx++) {
          const url = imageUrls[idx];
          const imgData = await loadImageAsBase64(url);
          if (!imgData) continue;

          const imgH = Math.min(imgW / imgData.ratio, 80); // max 80mm tall
          const xPos = margin + col * (imgW + gap);

          // New page if no space
          if (yPos + imgH > pageH - 20) {
            doc.addPage();
            drawHeader(doc, 'IMAGES (continued)');
            yPos = imageMarginTop;
            rowStartY = yPos;
            col = 0;
          }

          // Shadow / border
          doc.setFillColor(230, 232, 238);
          doc.roundedRect(xPos + 0.6, yPos + 0.6, imgW, imgH, 2, 2, 'F'); // shadow
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(xPos, yPos, imgW, imgH, 2, 2, 'F');
          doc.addImage(imgData.data, 'JPEG', xPos, yPos, imgW, imgH);
          // border on top of image
          doc.setDrawColor(180, 185, 200);
          doc.setLineWidth(0.25);
          doc.roundedRect(xPos, yPos, imgW, imgH, 2, 2);

          // Image number label below
          doc.setFontSize(6.5);
          doc.setTextColor(140, 145, 160);
          doc.text(`Image ${idx + 1}`, xPos + imgW / 2, yPos + imgH + 4, { align: 'center' });

          col++;
          if (col >= imgPerRow) {
            col = 0;
            yPos = rowStartY + imgH + 14;
            rowStartY = yPos;
          }
        }
      }

      // PAGE — Details ──────────────────────────────────────────────────────────
      if (imageUrls.length > 0) doc.addPage(); // details on a new page if images existed
      drawHeader(doc, 'DETAILS');
      addRecordTitle(doc, 36);

      // Text fields table (exclude pure URL-only fields — they appear as images above)
      const textRows = entries
        .filter(([, v]) => {
          if (v === null || v === undefined) return true;
          if (typeof v === 'string' && isUrl(v)) return false;
          if (Array.isArray(v) && v.length > 0 && v.every(i => isUrl(String(i)))) return false;
          return true;
        })
        .map(([k, v]) => [
          k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          flattenForPDF(v).substring(0, 400),
        ]);

      autoTable(doc, {
        startY: 46,
        head: [['Field', 'Value']],
        body: textRows,
        theme: 'grid',
        headStyles: {
          fillColor: [30, 41, 80],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9,
          cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 58, fillColor: [245, 247, 252], textColor: [55, 65, 90] },
          1: { cellWidth: contentW - 58, textColor: [20, 25, 35] },
        },
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
          overflow: 'linebreak',
          lineColor: [215, 220, 232],
          lineWidth: 0.3,
        },
        alternateRowStyles: { fillColor: [250, 251, 255] },
        margin: { top: 46, right: margin, bottom: 20, left: margin },
      });

      // ── Add footers to every page ────────────────────────────────────────────
      const totalPages = doc.internal.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawFooter(doc, p, totalPages);
      }

      const safeName = String(record.external_id || record.id || 'record').replace(/[^a-z0-9]/gi, '-');
      doc.save(`${tableName || 'record'}-${safeName}.pdf`);
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Could not generate PDF. Error: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { background: #f0f2f5 !important; margin: 0; }
      `}</style>
      <div style={styles.page}>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <button onClick={onBack} style={styles.backBtn}>← Back to Table</button>
          <button
            onClick={handleDownloadPDF}
            disabled={isGenerating}
            style={{
              ...styles.downloadBtn,
              opacity: isGenerating ? 0.65 : 1,
              cursor: isGenerating ? 'wait' : 'pointer',
            }}
          >
            {isGenerating ? '⏳ Generating PDF…' : '⬇ Download PDF'}
          </button>
        </div>

        {/* Main card */}
        <div style={styles.card}>

          {/* Card header */}
          <div style={styles.cardHeader}>
            <p style={styles.breadcrumb}>{tableName?.replace(/_/g, ' ')}</p>
            <h1 style={styles.title}>{String(recordTitle)}</h1>
          </div>

          {/* ── Images section (top) ── */}
          {(() => {
            const imgEntries = entries.filter(([, v]) =>
              (typeof v === 'string' && isUrl(v)) ||
              (Array.isArray(v) && v.length > 0 && v.some(i => isUrl(String(i))))
            );
            if (imgEntries.length === 0) return null;
            const allImgUrls = [];
            imgEntries.forEach(([, v]) => {
              if (typeof v === 'string') allImgUrls.push(v);
              else if (Array.isArray(v)) v.forEach(i => typeof i === 'string' && isUrl(i) && allImgUrls.push(i));
            });
            return (
              <div style={styles.sectionPad}>
                <p style={styles.sectionLabel}>Images ({allImgUrls.length})</p>
                <div style={styles.topGallery}>
                  {allImgUrls.map((url, i) => (
                    <div key={i} style={styles.topImageCard}>
                      <SmartImage src={url} altLabel={`Image ${i + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div style={styles.divider} />

          {/* ── Details rows (below images) ── */}
          <div style={styles.sectionPad}>
            <p style={styles.sectionLabel}>Details</p>
            <div style={styles.detailsTable}>
              {entries
                .filter(([, v]) => {
                  // skip fields that are purely image URLs (already shown above)
                  if (typeof v === 'string' && isUrl(v)) return false;
                  if (Array.isArray(v) && v.length > 0 && v.every(i => isUrl(String(i)))) return false;
                  return true;
                })
                .map(([key, value]) => (
                  <div key={key} style={styles.fieldRow}>
                    <div style={styles.fieldLabel}>{key.replace(/_/g, ' ')}</div>
                    <div style={styles.fieldValue}>
                      <SmartValue fieldKey={key} value={value} />
                    </div>
                  </div>
                ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  page: {
    minHeight: '100vh',
    background: '#f0f2f5',
    padding: '1.5rem 1.5rem 4rem',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: '1100px',
    margin: '0 auto 1.5rem',
  },
  backBtn: {
    background: '#fff',
    border: '1.5px solid #d1d5db',
    padding: '0.55rem 1.2rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: '#374151',
    fontWeight: '500',
  },
  downloadBtn: {
    background: '#0a66c2',
    border: 'none',
    padding: '0.6rem 1.6rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    color: '#fff',
    fontWeight: '600',
    boxShadow: '0 3px 10px rgba(10,102,194,0.30)',
    transition: 'opacity 0.2s',
  },
  card: {
    maxWidth: '1100px',
    margin: '0 auto',
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 4px 30px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  cardHeader: {
    background: 'linear-gradient(125deg, #0a66c2 0%, #1e40af 100%)',
    padding: '2rem 2.5rem',
    color: '#fff',
  },
  breadcrumb: {
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    opacity: 0.72,
    margin: '0 0 0.5rem 0',
    fontWeight: '500',
  },
  title: {
    fontSize: '1.7rem',
    fontWeight: '700',
    margin: 0,
    lineHeight: 1.35,
  },
  sectionPad: {
    padding: '2rem 2.5rem',
  },
  divider: {
    height: '1px',
    background: '#f3f4f6',
    margin: '0 2.5rem',
  },
  topGallery: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '1rem',
  },
  topImageCard: {
    borderRadius: '10px',
    overflow: 'hidden',
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    aspectRatio: '4/3',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: '0.72rem',
    fontWeight: '700',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '0.11em',
    margin: '0 0 1rem 0',
    paddingBottom: '0.5rem',
    borderBottom: '1px solid #f3f4f6',
  },
  detailsTable: {
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  fieldRow: {
    display: 'grid',
    gridTemplateColumns: '210px 1fr',
    borderBottom: '1px solid #f3f4f6',
    minHeight: '46px',
    '&:lastChild': { borderBottom: 'none' },
  },
  fieldLabel: {
    padding: '0.85rem 1.1rem',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'capitalize',
    background: '#f9fafb',
    borderRight: '1px solid #f0f0f0',
    display: 'flex',
    alignItems: 'flex-start',
    paddingTop: '1rem',
  },
  fieldValue: {
    padding: '0.7rem 1.1rem',
    fontSize: '0.93rem',
    color: '#111827',
    wordBreak: 'break-word',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.6rem',
    alignItems: 'flex-start',
  },
  nullText: { color: '#d1d5db', fontStyle: 'italic', fontSize: '0.85rem' },
  link: { color: '#0a66c2', textDecoration: 'none', fontSize: '0.88rem' },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  gallery: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.7rem',
    width: '100%',
  },
  arrayChip: {
    background: '#f0f4ff',
    border: '1px solid #dbeafe',
    color: '#1e40af',
    padding: '0.2rem 0.6rem',
    borderRadius: '4px',
    fontSize: '0.83rem',
  },
  featureList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  featureSection: {
    borderLeft: '3px solid #008080',
    paddingLeft: '0.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.2rem',
  },
  featureSectionTitle: {
    fontWeight: '700',
    fontSize: '0.88rem',
    color: '#1E2A38',
    textTransform: 'capitalize',
  },
  featureSectionValue: {
    fontSize: '0.88rem',
    color: '#555555',
  },
  subFeatureRow: {
    display: 'flex',
    gap: '0.2rem',
    flexWrap: 'wrap',
    fontSize: '0.85rem',
    color: '#333333',
    paddingLeft: '0.5rem',
  },
  sfLabel: {
    fontWeight: '600',
    color: '#444444',
  },
  sfValue: {
    color: '#555555',
  },
  flatObj: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.88rem',
    width: '100%',
  },
  flatRow: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  flatKey: {
    fontWeight: '600',
    color: '#6b7280',
    minWidth: '90px',
    textTransform: 'capitalize',
  },
  flatVal: {
    color: '#111827',
    wordBreak: 'break-word',
  },
};

export default RecordDetail;
