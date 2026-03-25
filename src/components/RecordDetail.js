import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import LOGO_BASE64 from './logoBase64';

// ─── Helpers ────────────────────────────────────────────────────────────────

function isUrl(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('http://') || value.startsWith('https://');
}

// Load an image URL into a base64 data URL via canvas (for jsPDF)
async function loadImageAsBase64(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    const blob = await res.blob();
    // createImageBitmap robustly processes EXIF orientation (which fixes 'unoriented' smartphone photos)
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return { data: canvas.toDataURL('image/jpeg', 0.85), ratio: canvas.width / canvas.height };
  } catch (err) {
    // Fallback if fetch or createImageBitmap fails (e.g. strict CORS preventing blob read)
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
          resolve({ data: canvas.toDataURL('image/jpeg', 0.82), ratio: canvas.width / canvas.height });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }
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

  // Try every plausible address field name (including Dutch Funda conventions)
  const recordTitle =
    record.address ||
    record.adres ||
    record.straat ||
    record.straatnaam ||
    record.street ||
    record.street_address ||
    record.name ||
    record.title ||
    // last resort: look for any string field whose key contains 'adres' or 'straat'
    (() => {
      const match = Object.entries(record).find(
        ([k, v]) => typeof v === 'string' && !isUrl(v) &&
          /adres|straat|street|address/i.test(k) && isNaN(Number(v))
      );
      return match ? match[1] : null;
    })() ||
    record.external_id ||
    record.id ||
    'Record Details';

  // ── PDF Generation — ApartmentHub Brochure (landscape letter) ────────────────
  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      // Landscape letter format matching the brochure template (792 x 612 pt)
      const doc = new jsPDF('l', 'pt', 'letter');
      const W = doc.internal.pageSize.getWidth();   // 792
      const H = doc.internal.pageSize.getHeight();   // 612

      // ── Brand colours ─────────────────────────────────────────
      const TEAL      = [42, 90, 93];
      const DARK_TEAL = [32, 68, 70];
      const WHITE     = [255, 255, 255];

      // Fields to exclude from customer-facing brochure
      const EXCLUDED = new Set([
        'id', 'external_id', 'global_id',
        'publication_date', 'published_date', 'publication_at', 'published_at',
        'created_at', 'updated_at', 'createdAt', 'updatedAt', 'created', 'updated',
      ]);

      // Auto-fill teal background on every new page
      const _addPage = doc.addPage.bind(doc);
      doc.addPage = function (...a) {
        _addPage(...a);
        doc.setFillColor(...TEAL);
        doc.rect(0, 0, W, H, 'F');
        return this;
      };

      // ── Collect & load images ─────────────────────────────────
      const imageUrls = collectImageUrls(record);
      const loadedImages = [];
      for (const url of imageUrls.slice(0, 24)) {
        const img = await loadImageAsBase64(url);
        if (img) loadedImages.push(img);
      }

      // ── Key features extraction ───────────────────────────────
      const featuresRaw =
        record.features || record.kenmerken ||
        record.key_features || record.highlights || null;

      const keyFeatureLines = (() => {
        if (!featuresRaw) return [];
        if (typeof featuresRaw === 'string') {
          return featuresRaw.split(/\n|,|;/).map(s => s.trim()).filter(Boolean).slice(0, 18);
        }
        if (Array.isArray(featuresRaw)) {
          return featuresRaw.flatMap(f => {
            if (typeof f === 'string') return [f];
            if (f && f.title) {
              const subs = Array.isArray(f.subfeatures)
                ? f.subfeatures.map(sf => {
                    if (typeof sf === 'object' && sf !== null) {
                      return Object.entries(sf)
                        .filter(([, v]) => v !== null && v !== undefined)
                        .map(([k, v]) => {
                          const val = typeof v === 'object' ? flattenForPDF(v, 1) : v;
                          if (k === 'title' || k === 'label') return String(val);
                          return `${k.replace(/_/g, ' ')} ${val}`;
                        }).join(' ');
                    }
                    return String(sf);
                  })
                : [];
              return [f.title, ...subs.map(s => `  ${s}`)];
            }
            return [];
          }).slice(0, 20);
        }
        return [];
      })();

      // ── Price ─────────────────────────────────────────────────
      const priceRaw =
        record.price || record.asking_price ||
        record.selling_price || record.rental_price ||
        record.prijs || record.koopprijs || record.huurprijs ||
        record.verkoopprijs || record.rent ||
        '';
      const priceStr = priceRaw ? String(priceRaw) : '';

      // ── Helper: draw an image cover-fitted into a rectangular cell ──
      function drawCoverImage(img, cx, cy, cw, ch, maskColor) {
        const mc = maskColor || TEAL;
        let iW, iH;
        if (cw / ch > img.ratio) {
          iW = cw; iH = cw / img.ratio;
        } else {
          iH = ch; iW = ch * img.ratio;
        }
        const iX = cx + (cw - iW) / 2;
        const iY = cy + (ch - iH) / 2;
        doc.addImage(img.data, 'JPEG', iX, iY, iW, iH);
        // Mask overflow with background colour
        doc.setFillColor(...mc);
        if (iX < cx)
          doc.rect(iX - 1, iY - 1, cx - iX + 1, iH + 2, 'F');
        if (iX + iW > cx + cw)
          doc.rect(cx + cw, iY - 1, iX + iW - cx - cw + 1, iH + 2, 'F');
        if (iY < cy)
          doc.rect(Math.min(iX, cx) - 1, iY - 1, Math.max(iW, cw) + 2, cy - iY + 1, 'F');
        if (iY + iH > cy + ch)
          doc.rect(Math.min(iX, cx) - 1, cy + ch, Math.max(iW, cw) + 2, iY + iH - cy - ch + 1, 'F');
      }

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER: logo, address, price, hero image, contact info
      // ═══════════════════════════════════════════════════════════════════════
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, W, H, 'F');

      // Logo centred at top (wide format, ratio ~2.46)
      const logoH = 65;
      const logoW = logoH * 2.458;
      doc.addImage(LOGO_BASE64, 'PNG', (W - logoW) / 2, 18, logoW, logoH);

      // Calculate title + price layout (may wrap for long addresses)
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(String(recordTitle), W - 100);
      const titleBaseY = 120;
      const titleLineH = 34;
      const titleBottomY = titleBaseY + (titleLines.length - 1) * titleLineH;

      // Price immediately below property name
      let priceBottomY = titleBottomY;
      if (priceStr) {
        priceBottomY = titleBottomY + 28;
      }

      const coverImgTop = Math.max(160, priceBottomY + 12);

      // Hero property image (covers bottom portion of page)
      if (loadedImages.length > 0) {
        drawCoverImage(loadedImages[0], 0, coverImgTop, W, H - coverImgTop, TEAL);
      }

      // Re-fill teal band above image for clean logo / address / price area
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, W, coverImgTop, 'F');

      // Re-draw logo on top of teal band
      doc.addImage(LOGO_BASE64, 'PNG', (W - logoW) / 2, 18, logoW, logoH);

      // Address heading
      doc.setTextColor(...WHITE);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text(titleLines, W / 2, titleBaseY, { align: 'center' });

      // Price below property name
      if (priceStr) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(priceStr, W / 2, titleBottomY + 24, { align: 'center' });
      }

      // Contact info at bottom-left (with subtle scrim for readability)
      doc.setGState(new doc.GState({ opacity: 0.4 }));
      doc.setFillColor(0, 0, 0);
      doc.roundedRect(10, H - 110, 200, 100, 5, 5, 'F');
      doc.setGState(new doc.GState({ opacity: 1 }));

      doc.setTextColor(...WHITE);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Korte leidsedwarsstraat', 21, H - 90);
      doc.text('12 Amsterdam 1017PB', 21, H - 74);
      doc.text('https://apartmenthub.nl', 21, H - 58);
      doc.text('+31658975449', 21, H - 42);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2 — KEY FEATURES: image left, features right, bottom strip
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Property image on the left ~65% of the page
      const featImg = loadedImages.length > 1 ? loadedImages[1] : loadedImages[0];
      if (featImg) {
        drawCoverImage(featImg, 45, 80, 480, 460, TEAL);
      }

      // Bottom darker strip
      doc.setFillColor(...DARK_TEAL);
      doc.rect(0, 504, W, H - 504, 'F');

      // "Key features" heading
      doc.setTextColor(...WHITE);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'normal');
      doc.text('Key features', 555, 65);

      // Feature list on the right
      if (keyFeatureLines.length > 0) {
        doc.setFontSize(11);
        let fy = 110;
        for (const line of keyFeatureLines) {
          const isIndented = line.startsWith('  ');
          const text = line.trim();
          if (isIndented) {
            doc.setTextColor(185, 200, 200);
            const wrapped = doc.splitTextToSize(text, W - 560 - 15);
            doc.text(wrapped, 560, fy);
            fy += wrapped.length * 14 + 2;
          } else {
            doc.setTextColor(...WHITE);
            doc.setFillColor(...WHITE);
            doc.circle(550, fy - 3, 2, 'F');
            const wrapped = doc.splitTextToSize(text, W - 560 - 15);
            doc.text(wrapped, 560, fy);
            fy += wrapped.length * 14 + 8;
          }
          if (fy > 585) break;
        }
      } else {
        // Fallback: show scalar text entries as features
        const textEntries = entries.filter(([k, v]) => {
          if (EXCLUDED.has(k)) return false;
          if (!v || (typeof v === 'string' && isUrl(v))) return false;
          if (Array.isArray(v)) return false;
          if (typeof v === 'object') return false;
          return typeof v === 'string' || typeof v === 'number';
        }).slice(0, 16);

        doc.setFontSize(11);
        let fy = 110;
        for (const [k, v] of textEntries) {
          doc.setTextColor(...WHITE);
          doc.setFillColor(...WHITE);
          doc.circle(550, fy - 3, 2, 'F');
          const text = `${k.replace(/_/g, ' ')}: ${String(v).substring(0, 50)}`;
          doc.text(text, 560, fy);
          fy += 28;
          if (fy > 585) break;
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // GALLERY PAGES — 2 x 2 grid per page (no logo on image pages)
      // ═══════════════════════════════════════════════════════════════════════
      const galleryStart = loadedImages.length > 1 ? 2 : 1;
      const galleryImages = loadedImages.slice(galleryStart);
      const PER_PAGE = 4;

      // Cell positions (from template analysis: 792 x 612 pt landscape letter)
      const cells = [
        { x: 43, y: 52, w: 348, h: 261 },  // top-left
        { x: 403, y: 52, w: 348, h: 261 }, // top-right
        { x: 43, y: 345, w: 348, h: 261 }, // bottom-left
        { x: 403, y: 345, w: 348, h: 261 },// bottom-right
      ];

      for (let i = 0; i < galleryImages.length; i += PER_PAGE) {
        doc.addPage();

        // Decorative side lines (matching template)
        doc.setDrawColor(160, 175, 170);
        doc.setLineWidth(1.5);
        doc.line(28, 52, 28, 606);      // left
        doc.line(768, 0, 768, 416);     // right

        const chunk = galleryImages.slice(i, i + PER_PAGE);
        for (let j = 0; j < chunk.length; j++) {
          const c = cells[j];
          drawCoverImage(chunk[j], c.x, c.y, c.w, c.h, TEAL);
        }
      }

      // ═══════════════════════════════════════════════════════════════════════
      // FINAL PAGE — PROPERTY DETAILS (filtered, no IDs / timestamps)
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Logo on details page (no property images, so logo is shown)
      const detLogoH = 35;
      const detLogoW = detLogoH * 2.458;
      doc.addImage(LOGO_BASE64, 'PNG', W - detLogoW - 25, 12, detLogoW, detLogoH);

      doc.setTextColor(...WHITE);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Property Details', 30, 35);

      // Address & price sub-header
      doc.setTextColor(220, 235, 235);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(String(recordTitle).substring(0, 90), 30, 55);
      if (priceStr) doc.text(priceStr, 30, 72);

      // Filtered details table
      const textRows = entries
        .filter(([k, v]) => {
          if (EXCLUDED.has(k)) return false;
          if (v === null || v === undefined) return true;
          if (typeof v === 'string' && isUrl(v)) return false;
          if (Array.isArray(v) && v.length > 0 && v.every(i => isUrl(String(i)))) return false;
          return true;
        })
        .filter(([, v]) => {
          // Remove empty / null values to avoid blank rows
          if (v === null || v === undefined || v === '') return false;
          return true;
        })
        .map(([k, v]) => [
          k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          flattenForPDF(v).substring(0, 400),
        ]);

      autoTable(doc, {
        startY: 85,
        head: [['Field', 'Value']],
        body: textRows,
        theme: 'plain',
        headStyles: {
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: { top: 5, bottom: 5, left: 8, right: 8 },
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 170, textColor: WHITE },
          1: { cellWidth: W - 60 - 170, textColor: [220, 230, 230] },
        },
        styles: {
          fontSize: 9,
          cellPadding: { top: 4, bottom: 4, left: 8, right: 8 },
          overflow: 'linebreak',
          lineColor: [60, 110, 115],
          lineWidth: 0.2,
        },
        margin: { top: 85, right: 30, bottom: 30, left: 30 },
      });

      // Save PDF
      const safeName = String(record.address || record.adres || record.external_id || record.id || 'apartment')
        .replace(/[^a-z0-9]/gi, '-').substring(0, 40);
      doc.save(`${tableName || 'apartment'}-${safeName}-brochure.pdf`);
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
            {/* Breadcrumb / table name */}
            <p style={styles.breadcrumb}>{tableName?.replace(/_/g, ' ')}</p>

            {/* Main address title */}
            <h1 style={styles.title}>{String(recordTitle)}</h1>

            {/* Address subtitle: city · postal only */}
            {(() => {
              const parts = [
                record.city || record.stad || record.plaats,
                record.postal_code || record.postcode || record.zip,
              ].filter(Boolean).map(String);
              return parts.length > 0 ? (
                <p style={styles.subtitle}>{parts.join('  ·  ')}</p>
              ) : null;
            })()}

            {/* Selling price — highlighted */}
            {(() => {
              const price =
                record.price ||
                record.asking_price ||
                record.prijs ||
                record.koopprijs ||
                record.selling_price ||
                record.verkoopprijs;
              return price ? (
                <div style={styles.priceTag}>
                  <span style={styles.priceLabel}>Selling price</span>
                  <span style={styles.priceValue}>{String(price)}</span>
                </div>
              ) : null;
            })()}

            {/* Property ID badge */}
            {(record.external_id || record.id) && (
              <span style={styles.idBadge}>
                ID&nbsp;{String(record.external_id || record.id)}
              </span>
            )}
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
    background: 'linear-gradient(135deg, #008080 0%, #006666 55%, #004d4d 100%)',
    padding: '2rem 2.5rem 1.75rem',
    color: '#fff',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.35rem',
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
    fontSize: '1.75rem',
    fontWeight: '700',
    margin: 0,
    lineHeight: 1.3,
  },
  subtitle: {
    fontSize: '1.05rem',
    fontWeight: '600',
    margin: '0.25rem 0 0',
    opacity: 0.88,
    letterSpacing: '0.02em',
  },
  idBadge: {
    display: 'inline-block',
    marginTop: '0.6rem',
    fontSize: '0.72rem',
    fontWeight: '400',
    opacity: 0.55,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  priceTag: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginTop: '1rem',
    padding: '0.55rem 1.6rem 0.65rem',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.22)',
    border: '1.5px solid rgba(255,255,255,0.55)',
    backdropFilter: 'blur(6px)',
    boxShadow: '0 4px 18px rgba(0,0,0,0.18)',
  },
  priceLabel: {
    fontSize: '0.65rem',
    fontWeight: '600',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.75,
    marginBottom: '0.2rem',
  },
  priceValue: {
    fontSize: '1.55rem',
    fontWeight: '800',
    letterSpacing: '-0.01em',
    lineHeight: 1.15,
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
