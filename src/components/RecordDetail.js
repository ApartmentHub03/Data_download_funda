import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

  // ── PDF Generation — Funda Property Brochure Style ───────────────────────────
  const handleDownloadPDF = async () => {
    setIsGenerating(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      
      const BG_COLOR = [42, 90, 93];
      const COPPER   = [212, 120, 32];
      const WHITE    = [255, 255, 255];

      // Automatically fill every new page with the dark cyan background
      const originalAddPage = doc.addPage.bind(doc);
      doc.addPage = function(...args) {
        originalAddPage(...args);
        doc.setFillColor(...BG_COLOR);
        doc.rect(0, 0, pageW, pageH, 'F');
        return this;
      };

      const margin = 14;
      const contentW = pageW - margin * 2;

      // ── Brand colours ─────────────────────────────────────────────────────────
      // ── Collect images ────────────────────────────────────────────────────────
      const imageUrls = collectImageUrls(record);

      // Pre-load all images (cap at 12 to keep PDF size manageable)
      const MAX_IMAGES = 12;
      const loadedImages = [];
      for (const url of imageUrls.slice(0, MAX_IMAGES)) {
        const img = await loadImageAsBase64(url);
        if (img) loadedImages.push(img);
      }

      // ── Key features: pull from features/kenmerken field if available ─────────
      const featuresRaw =
        record.features ||
        record.kenmerken ||
        record.key_features ||
        record.highlights ||
        null;

      const keyFeatureLines = (() => {
        if (!featuresRaw) return [];
        if (typeof featuresRaw === 'string') {
          return featuresRaw.split(/\n|,|;/).map(s => s.trim()).filter(Boolean).slice(0, 16);
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
          }).slice(0, 18);
        }
        return [];
      })();

      // ── Price / asking price ──────────────────────────────────────────────────
      const priceRaw =
        record.price ||
        record.asking_price ||
        record.prijs ||
        record.koopprijs ||
        '';
      const priceStr = priceRaw ? String(priceRaw) : '';

      // ═════════════════════════════════════════════════════════════════════════
      // PAGE 1 — COVER: dark teal background, copper lines, map/image, features
      // ═════════════════════════════════════════════════════════════════════════
      // fill entire page with background (for the VERY FIRST page)
      doc.setFillColor(...BG_COLOR);
      doc.rect(0, 0, pageW, pageH, 'F');

      // Copper accent lines
      doc.setDrawColor(...COPPER);
      doc.setLineWidth(0.6);
      
      // Vertical copper line on the left
      const vLineX = margin + 4;
      doc.line(vLineX, 15, vLineX, 90);

      // Horizontal copper line
      const hLineY = 32;
      doc.line(vLineX - 5, hLineY, pageW, hLineY);

      // The user requested to remove the APARTMENTHUB name and logo

      // "Key features" heading on the right
      doc.setFontSize(18);
      doc.setFont(undefined, 'normal');
      doc.text('Key features', pageW * 0.65, hLineY - 6);

      // Image box (Map) below the horizontal line
      const imgPadX = margin + 10;
      const imgPadY = hLineY + 6;
      const imgW = (pageW * 0.55);
      const imgH = pageH - imgPadY - 15;

      if (loadedImages.length > 0) {
        const mapImg = loadedImages[0];
        doc.addImage(mapImg.data, 'JPEG', imgPadX, imgPadY, imgW, imgH);
      }

      // Feature bullets on the right
      const rightX = imgPadX + imgW + 12;
      
      if (keyFeatureLines.length > 0) {
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        let fy = imgPadY + 5;
        for (const line of keyFeatureLines) {
          const isIndented = line.startsWith('  ');
          const textStr = line.trim();
          const indentAmt = isIndented ? 6 : 0;
          
          doc.setTextColor(...WHITE);
          // Set opacity for indented lines
          if (isIndented) {
             doc.setTextColor(200, 210, 210);
          }
          
          const maxTextW = pageW - rightX - margin - indentAmt - 5;
          const wrapped = doc.splitTextToSize(textStr, maxTextW);
          
          // Draw bullet
          if (!isIndented) {
            doc.setFillColor(...WHITE);
            doc.circle(rightX + 1.5, fy - 1.2, 0.8, 'F');
          } else {
            // Indented hyphen
            doc.text('-', rightX + indentAmt, fy);
          }
          
          doc.text(wrapped, rightX + indentAmt + 4, fy);
          fy += wrapped.length * 5 + (isIndented ? 1 : 3);
          if (fy > pageH - 20) break;
        }
      } else {
        // Fallback text entries
        const textEntries = entries.filter(([, v]) => {
          if (!v || (typeof v === 'string' && isUrl(v))) return false;
          if (Array.isArray(v) && v.every(i => isUrl(String(i)))) return false;
          return typeof v === 'string' || typeof v === 'number';
        }).slice(0, 14);

        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        let fy = imgPadY + 5;
        for (const [k, v] of textEntries) {
          doc.setTextColor(...WHITE);
          doc.setFillColor(...WHITE);
          doc.circle(rightX + 1.5, fy - 1.2, 0.8, 'F');
          
          const textStr = `${k.replace(/_/g, ' ').toUpperCase()}: ${String(v).substring(0, 45)}`;
          const wrapped = doc.splitTextToSize(textStr, pageW - rightX - margin - 5);
          
          doc.text(wrapped, rightX + 4, fy);
          fy += wrapped.length * 5 + 3;
          if (fy > pageH - 20) break;
        }
      }
      // ═════════════════════════════════════════════════════════════════════════
      if (loadedImages.length > 1) {
        doc.addPage();

        const heroImg = loadedImages[1] || loadedImages[0];

        // Full-page image (cropped center)
        const heroH = pageH * 0.62;
        const heroAR = heroImg.ratio;
        let hW = pageW, hH = pageW / heroAR;
        if (hH < heroH) { hH = heroH; hW = heroH * heroAR; }
        const hOffX = (pageW - hW) / 2;
        doc.addImage(heroImg.data, 'JPEG', hOffX, 0, hW, hH);

        // Dark scrim over hero
        doc.setGState(new doc.GState({ opacity: 0.45 }));
        doc.setFillColor(0, 0, 0);
        doc.rect(0, 0, pageW, heroH, 'F');
        doc.setGState(new doc.GState({ opacity: 1 }));

        // Address on hero
        doc.setTextColor(...WHITE);
        doc.setFontSize(20);
        doc.setFont(undefined, 'bold');
        doc.text(String(recordTitle).substring(0, 50), margin, heroH - 22, { maxWidth: contentW });

        if (priceStr) {
          doc.setFontSize(11);
          doc.setFont(undefined, 'normal');
          doc.text(priceStr, margin, heroH - 12);
        }

        // Info strip below hero image
        const stripY = heroH;
        const stripH = pageH - heroH - 9;

        doc.setFillColor(...BG_COLOR); // Changed from LGRAY to BG_COLOR
        doc.rect(0, stripY, pageW, stripH, 'F');

        // Show a few key text fields in the strip
        const stripEntries = entries.filter(([, v]) => {
          if (!v) return false;
          if (typeof v === 'string' && isUrl(v)) return false;
          if (Array.isArray(v)) return false;
          if (typeof v === 'object') return false;
          return true;
        }).slice(0, 5);

        const colW = contentW / Math.max(stripEntries.length, 1);
        let sx = margin;
        const sy = stripY + 10;

        for (const [k, v] of stripEntries) {
          doc.setTextColor(200, 220, 220); // Changed from MGRAY
          doc.setFontSize(6.5);
          doc.setFont(undefined, 'normal');
          doc.text(k.replace(/_/g, ' ').toUpperCase(), sx, sy);
          doc.setTextColor(...WHITE); // Changed from DARK
          doc.setFontSize(9);
          doc.setFont(undefined, 'bold');
          doc.text(String(v).substring(0, 22), sx, sy + 6);
          // vertical separator
          if (sx + colW < pageW - margin) {
            doc.setDrawColor(...COPPER); // Changed from 210, 215, 225 to COPPER
            doc.setLineWidth(0.3);
            doc.line(sx + colW - 2, sy - 3, sx + colW - 2, sy + 12);
          }
          sx += colW;
        }

        // No footer bar
      }

      // ═════════════════════════════════════════════════════════════════════════
      // PAGE 3+ — PHOTO GALLERY: 2 × 2 mosaic per page, teal watermark
      // ═════════════════════════════════════════════════════════════════════════
      const galleryStart = loadedImages.length > 1 ? 2 : 1;
      const galleryImages = loadedImages.slice(galleryStart);

      if (galleryImages.length > 0) {
        const COLS = 2, ROWS = 3; // 3 rows x 2 cols = 6 landscape-ish images
        const perPage = COLS * ROWS;
        const gap = 12;
        const mgX = 22; // left/right margin
        const mgYTop = 38; // big top margin
        const mgYBot = 28;
        
        const cellW = (pageW - mgX * 2 - gap) / 2;
        const cellH = (pageH - mgYTop - mgYBot - gap * (ROWS - 1)) / ROWS;

        for (let i = 0; i < galleryImages.length; i += perPage) {
          doc.addPage(); // background automatically filled via addPage hook

          // Copper cross line & edge lines
          doc.setDrawColor(...COPPER);
          doc.setLineWidth(0.6);
          // Left track line
          doc.line(7, mgYTop, 7, pageH - mgYBot);
          // Right track line
          doc.line(pageW - 7, mgYTop, pageW - 7, pageH - mgYBot);
          
          // Center vertical cross line
          const midX = mgX + cellW + gap / 2;
          doc.line(midX, mgYTop - 3, midX, pageH - mgYBot + 3);
          
          // Horizontal cross lines for each row gap
          for (let r = 1; r < ROWS; r++) {
            const midY = mgYTop + r * cellH + (r - 0.5) * gap;
            doc.line(mgX - 3, midY, pageW - mgX + 3, midY);
          }

          const chunk = galleryImages.slice(i, i + perPage);
          for (let j = 0; j < chunk.length; j++) {
            const col = j % COLS;
            const row = Math.floor(j / COLS);
            const cx = mgX + col * (cellW + gap);
            const cy = mgYTop + row * (cellH + gap);
            const img = chunk[j];

            // Setup underlying cell clip boundaries
            // (Since jsPDF clipping is buggy, we'll over-scale the image then draw thick frames of BG_COLOR around it)
            let iW = cellW, iH = cellW / img.ratio;
            if (iH < cellH) { iH = cellH; iW = cellH * img.ratio; }
            const iOffX = cx + (cellW - iW) / 2;
            const iOffY = cy + (cellH - iH) / 2;

            doc.addImage(img.data, 'JPEG', iOffX, iOffY, iW, iH);

            // Use the dark background color for the clip masking so it seamlessly vanishes into the background
            doc.setFillColor(...BG_COLOR);
            
            // Mask Left
            if (iOffX < cx) doc.rect(iOffX - 1, iOffY - 1, (cx - iOffX) + 1, iH + 2, 'F');
            // Mask Right
            const iRight = iOffX + iW;
            const cRight = cx + cellW;
            if (iRight > cRight) doc.rect(cRight, iOffY - 1, (iRight - cRight) + 1, iH + 2, 'F');
            // Mask Top
            if (iOffY < cy) doc.rect(Math.min(iOffX, cx) - 1, iOffY - 1, Math.max(iW, cellW) + 2, (cy - iOffY) + 1, 'F');
            // Mask Bottom
            const iBot = iOffY + iH;
            const cBot = cy + cellH;
            if (iBot > cBot) doc.rect(Math.min(iOffX, cx) - 1, cBot, Math.max(iW, cellW) + 2, (iBot - cBot) + 1, 'F');

            // Draw a smooth thin rounded border to give it a polished photo card feel
            doc.setDrawColor(200, 210, 205); // light grayish-teal border
            doc.setLineWidth(0.4);
            doc.roundedRect(cx, cy, cellW, cellH, 4, 4);
          }
        }
      }

      // ═════════════════════════════════════════════════════════════════════════
      // FINAL PAGE — DETAILS TABLE (teal header stripe)
      // ═════════════════════════════════════════════════════════════════════════
      // Details page
      doc.addPage(); // background colored automatically via addPage hook
      
      doc.setTextColor(...WHITE);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('Property Details', margin, 22);

      // Address sub-header
      doc.setTextColor(230, 240, 240);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.text(String(recordTitle).substring(0, 80), margin, 30);

      // Details table
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
        startY: 38,
        head: [['Field', 'Value']],
        body: textRows,
        theme: 'plain',
        headStyles: {
          textColor: WHITE,
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: { top: 4, bottom: 4, left: 5, right: 5 },
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 58, textColor: WHITE },
          1: { cellWidth: contentW - 58, textColor: [220, 230, 230] },
        },
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 3.5, bottom: 3.5, left: 5, right: 5 },
          overflow: 'linebreak',
          lineColor: [60, 110, 115], // subtle teal separators
          lineWidth: 0.2, // border bottom only
        },
        drawRow: (hookData) => {
          // Draw a subtle border below each row
          doc.setDrawColor(60, 110, 115);
          doc.setLineWidth(0.2);
          const y = hookData.row.y + hookData.row.height;
          doc.line(hookData.settings.margin.left, y, pageW - hookData.settings.margin.right, y);
        },
        margin: { top: 37, right: margin, bottom: 14, left: margin },
      });

      // (footer bars drawn inline per page above)

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
