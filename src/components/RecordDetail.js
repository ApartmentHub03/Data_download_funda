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

// Check if a URL looks like an image (by extension or known CDN patterns)
function isImageUrl(url) {
  if (typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  // Common image extensions
  if (/\.(jpe?g|png|gif|webp|bmp|svg|tiff?|avif)(\?|$)/i.test(lower)) return true;
  // Known image CDN/hosting patterns
  if (/cloud\.funda\.nl|imgur|cloudinary|unsplash|images\.|img\.|cdn\.|media\.|photos\./i.test(lower)) return true;
  // Reject known non-image URLs
  if (/funda\.nl\/(detail|koop|huur)|google\.(nl|com)\/maps|maps\.google/i.test(lower)) return false;
  // Reject URLs that look like web pages (no extension or .html/.php/.aspx)
  if (/\.(html?|php|aspx?|jsp)\b/i.test(lower)) return false;
  return true;
}

// ─── Collect all image URLs from a record ───────────────────────────────────
function collectImageUrls(record) {
  const urls = [];
  for (const value of Object.values(record)) {
    if (typeof value === 'string' && isUrl(value) && isImageUrl(value)) {
      urls.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && isUrl(item) && isImageUrl(item)) urls.push(item);
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
              const label = sf.title || sf.label || sf.name || '';
              const val = sf.value != null ? String(sf.value) : '';
              if (label && val) lines.push(`  • ${label}: ${val}`);
              else if (label) lines.push(`  • ${label}`);
              else if (val) lines.push(`  • ${val}`);
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

      // ── Brand colours ─────────────────────────────────────
      const TEAL      = [42, 90, 93];
      const WHITE     = [255, 255, 255];
      const ORANGE    = [210, 125, 45];

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

      // ── Key features extraction (clean one-liners) ──────────
      const featuresRaw =
        record.features || record.kenmerken ||
        record.key_features || record.highlights || null;

      const keyFeatureLines = (() => {
        if (!featuresRaw) return [];
        if (typeof featuresRaw === 'string') {
          return featuresRaw.split(/\n|;/).map(s => s.trim()).filter(Boolean).slice(0, 24);
        }
        if (Array.isArray(featuresRaw)) {
          // Extract clean one-liner features from nested structure
          const lines = [];
          for (const section of featuresRaw) {
            if (typeof section === 'string') {
              lines.push(section);
              continue;
            }
            if (!section || typeof section !== 'object') continue;
            // Each section has subfeatures — extract as "Label: Value" one-liners
            if (Array.isArray(section.subfeatures)) {
              for (const sf of section.subfeatures) {
                if (typeof sf === 'string') { lines.push(sf); continue; }
                if (!sf || typeof sf !== 'object') continue;
                const label = sf.title || sf.label || sf.name || '';
                const val = sf.value != null ? String(sf.value) : '';
                if (label && val) {
                  lines.push(`${label}: ${val}`);
                } else if (label) {
                  lines.push(label);
                } else if (val) {
                  lines.push(val);
                }
              }
            } else if (section.title && section.value != null) {
              lines.push(`${section.title}: ${section.value}`);
            } else if (section.title) {
              lines.push(section.title);
            }
          }
          return lines.filter(l => l.length > 0).slice(0, 30);
        }
        return [];
      })();

      // ── Price (prefer rental price) ──────────────────────────
      const priceRaw =
        record.rental_price || record.huurprijs || record.rent ||
        record.price || record.asking_price ||
        record.selling_price || record.prijs || record.koopprijs ||
        record.verkoopprijs ||
        '';

      // Determine if rental (per month) or sale price
      const isRental = !!(record.rental_price || record.huurprijs || record.rent);
      const isSale = !isRental && !!(record.selling_price || record.asking_price ||
        record.koopprijs || record.verkoopprijs);

      // Format price with € symbol and period suffix
      const priceStr = (() => {
        if (!priceRaw) return '';
        const raw = String(priceRaw).replace(/[€$£\s]/g, '').replace(/,/g, '');
        const num = parseFloat(raw);
        const formatted = !isNaN(num)
          ? `€ ${num.toLocaleString('nl-NL')}, -`
          : `€ ${String(priceRaw).replace(/[€$£]/g, '').trim()}`;
        if (isRental) return `${formatted} excl. Per month`;
        if (isSale) return `${formatted} kosten koper`;
        // Check record for period hints
        const period = record.price_period || record.rental_period || record.periode || '';
        if (/year|jaar|annual/i.test(String(period))) return `${formatted} Per year`;
        if (/month|maand/i.test(String(period))) return `${formatted} excl. Per month`;
        return formatted;
      })();

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

      // Logo centred at top with generous spacing (wide format, ratio ~2.46)
      const logoH = 65;
      const logoW = logoH * 2.458;
      doc.addImage(LOGO_BASE64, 'PNG', (W - logoW) / 2, 22, logoW, logoH);

      // Calculate title + price layout (may wrap for long addresses)
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      const titleLines = doc.splitTextToSize(String(recordTitle), W - 100);
      const titleBaseY = 135;  // more space after logo
      const titleLineH = 34;
      const titleBottomY = titleBaseY + (titleLines.length - 1) * titleLineH;

      // Price immediately below property name
      let priceBottomY = titleBottomY;
      if (priceStr) {
        priceBottomY = titleBottomY + 34;
      }

      const coverImgTop = Math.max(185, priceBottomY + 18);

      // Hero property image (covers bottom portion of page)
      if (loadedImages.length > 0) {
        drawCoverImage(loadedImages[0], 0, coverImgTop, W, H - coverImgTop, TEAL);
      }

      // Re-fill teal band above image for clean logo / address / price area
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, W, coverImgTop, 'F');

      // Re-draw logo on top of teal band
      doc.addImage(LOGO_BASE64, 'PNG', (W - logoW) / 2, 22, logoW, logoH);

      // Address heading
      doc.setTextColor(...WHITE);
      doc.setFontSize(28);
      doc.setFont('helvetica', 'bold');
      doc.text(titleLines, W / 2, titleBaseY, { align: 'center' });

      // Price below property name (clean, just the value)
      if (priceStr) {
        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(220, 235, 235);
        doc.text(priceStr, W / 2, titleBottomY + 30, { align: 'center' });
      }

      // Contact info at bottom-left (with subtle scrim for readability)
      if (loadedImages.length > 0) {
        doc.setGState(new doc.GState({ opacity: 0.4 }));
        doc.setFillColor(0, 0, 0);
        doc.roundedRect(10, H - 110, 200, 100, 5, 5, 'F');
        doc.setGState(new doc.GState({ opacity: 1 }));
      }

      doc.setTextColor(...WHITE);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Korte leidsedwarsstraat', 21, H - 90);
      doc.text('12 Amsterdam 1017PB', 21, H - 74);
      doc.text('https://apartmenthub.nl', 21, H - 58);
      doc.text('+31658975449', 21, H - 42);

      // ═══════════════════════════════════════════════════════════════════════
      // PAGE 2+ — KEY FEATURES: image left, features right, orange accents
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Orange accent vertical line (left edge)
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(3);
      doc.line(25, 0, 25, H);

      // Logo in top-left
      const featLogoH = 40;
      const featLogoW = featLogoH * 2.458;
      doc.addImage(LOGO_BASE64, 'PNG', 40, 15, featLogoW, featLogoH);

      // Orange horizontal line under logo
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(2);
      doc.line(40, 62, 40 + featLogoW, 62);

      // Property image on the left ~60% of the page
      const featImg = loadedImages.length > 1 ? loadedImages[1] : loadedImages[0];
      const featImgLeft = 40;
      const featImgTop = 75;
      const featImgW = 460;
      const featImgH = H - featImgTop - 30;
      if (featImg) {
        drawCoverImage(featImg, featImgLeft, featImgTop, featImgW, featImgH, TEAL);
      }

      // "Key features" heading on right
      const featColX = featImgLeft + featImgW + 25;
      const featColW = W - featColX - 30;
      doc.setTextColor(...WHITE);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'italic');
      doc.text('Key features', featColX + featColW / 2, 50, { align: 'center' });

      // Orange line under "Key features"
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(1.5);
      doc.line(featColX, 62, featColX + featColW, 62);

      // Feature list — clean one-liner bullet points
      const featureList = keyFeatureLines.length > 0 ? keyFeatureLines : (() => {
        // Fallback: show scalar text entries as features
        return entries.filter(([k, v]) => {
          if (EXCLUDED.has(k)) return false;
          if (!v || (typeof v === 'string' && isUrl(v))) return false;
          if (Array.isArray(v)) return false;
          if (typeof v === 'object') return false;
          return typeof v === 'string' || typeof v === 'number';
        }).slice(0, 20).map(([k, v]) =>
          `${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}: ${String(v).substring(0, 50)}`
        );
      })();

      // Draw features with pagination across pages
      let fy = 90;
      doc.setFontSize(12);
      const maxFeatY = H - 40;

      for (let fi = 0; fi < featureList.length; fi++) {
        const text = featureList[fi];
        const wrapped = doc.splitTextToSize(text, featColW - 20);
        const neededH = wrapped.length * 16 + 12;

        // Check if we need a new page
        if (fy + neededH > maxFeatY && fi > 0) {
          doc.addPage();

          // Redraw orange vertical line
          doc.setDrawColor(...ORANGE);
          doc.setLineWidth(3);
          doc.line(25, 0, 25, H);

          // Logo
          doc.addImage(LOGO_BASE64, 'PNG', 40, 15, featLogoW, featLogoH);
          doc.setDrawColor(...ORANGE);
          doc.setLineWidth(2);
          doc.line(40, 62, 40 + featLogoW, 62);

          // Image on left (use next available image or repeat)
          const imgIdx = Math.min(1 + Math.floor(fi / 12), loadedImages.length - 1);
          const nextImg = loadedImages[imgIdx] || featImg;
          if (nextImg) {
            drawCoverImage(nextImg, featImgLeft, featImgTop, featImgW, featImgH, TEAL);
          }

          // Re-draw "Key features" header
          doc.setTextColor(...WHITE);
          doc.setFontSize(22);
          doc.setFont('helvetica', 'italic');
          doc.text('Key features', featColX + featColW / 2, 50, { align: 'center' });
          doc.setDrawColor(...ORANGE);
          doc.setLineWidth(1.5);
          doc.line(featColX, 62, featColX + featColW, 62);

          fy = 90;
          doc.setFontSize(12);
        }

        doc.setTextColor(...WHITE);
        doc.setFillColor(...WHITE);
        // Bullet point
        doc.circle(featColX + 4, fy - 3, 2.5, 'F');
        // Text
        doc.text(wrapped, featColX + 14, fy);
        fy += neededH;
      }

      // ═══════════════════════════════════════════════════════════════════════
      // Helper: draw logo with rounded corner cutout in top-left
      // ═══════════════════════════════════════════════════════════════════════
      function drawLogoCorner() {
        const cLogoH = 40;
        const cLogoW = cLogoH * 2.458;
        const cornerW = cLogoW + 55;
        const cornerH = cLogoH + 30;
        const curveR = 30;

        // Draw rounded teal rectangle in top-left corner
        doc.setFillColor(...TEAL);
        // Main rectangle
        doc.rect(0, 0, cornerW - curveR, cornerH, 'F');
        doc.rect(0, 0, cornerW, cornerH - curveR, 'F');
        // Rounded corner (bottom-right of the teal block)
        // Fill the corner area then mask with a quarter-circle
        doc.rect(cornerW - curveR, 0, curveR, cornerH - curveR, 'F');
        doc.rect(0, cornerH - curveR, cornerW - curveR, curveR, 'F');
        // Draw a filled quarter-circle for the rounded corner
        const cx = cornerW - curveR;
        const cy = cornerH - curveR;
        doc.setFillColor(...TEAL);
        // Approximate quarter circle with bezier
        const segments = 20;
        for (let s = 0; s < segments; s++) {
          const a1 = (s / segments) * Math.PI / 2;
          const a2 = ((s + 1) / segments) * Math.PI / 2;
          const x1 = cx + Math.cos(a1) * curveR;
          const y1 = cy + Math.sin(a1) * curveR;
          const x2 = cx + Math.cos(a2) * curveR;
          const y2 = cy + Math.sin(a2) * curveR;
          doc.triangle(cx, cy, x1, y1, x2, y2, 'F');
        }

        // Logo inside the corner
        doc.addImage(LOGO_BASE64, 'PNG', 35, 10, cLogoW, cLogoH);

        // Orange horizontal line under logo
        doc.setDrawColor(...ORANGE);
        doc.setLineWidth(2);
        doc.line(35, 10 + cLogoH + 5, 35 + cLogoW, 10 + cLogoH + 5);
      }

      // ═══════════════════════════════════════════════════════════════════════
      // GALLERY PAGES — 2 x 2 grid per page
      // ═══════════════════════════════════════════════════════════════════════
      const galleryStart = loadedImages.length > 1 ? 2 : 1;
      const galleryImages = loadedImages.slice(galleryStart);
      const PER_PAGE = 4;

      // Cell positions (792 x 612 pt landscape letter) — shifted down for logo
      const cells = [
        { x: 43, y: 80, w: 348, h: 240 },  // top-left
        { x: 403, y: 80, w: 348, h: 240 }, // top-right
        { x: 43, y: 340, w: 348, h: 240 }, // bottom-left
        { x: 403, y: 340, w: 348, h: 240 },// bottom-right
      ];

      for (let i = 0; i < galleryImages.length; i += PER_PAGE) {
        doc.addPage();

        // Orange accent vertical line (left)
        doc.setDrawColor(...ORANGE);
        doc.setLineWidth(3);
        doc.line(28, 0, 28, H);

        const chunk = galleryImages.slice(i, i + PER_PAGE);
        for (let j = 0; j < chunk.length; j++) {
          const c = cells[j];
          drawCoverImage(chunk[j], c.x, c.y, c.w, c.h, TEAL);
        }

        // Draw logo corner on top of images (overlaps top-left)
        drawLogoCorner();
      }

      // ═══════════════════════════════════════════════════════════════════════
      // FINAL PAGE — PROPERTY DETAILS (filtered, no IDs / timestamps)
      // ═══════════════════════════════════════════════════════════════════════
      doc.addPage();

      // Orange accent vertical line
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(3);
      doc.line(25, 0, 25, H);

      // Logo corner (top-left with rounded edge)
      drawLogoCorner();

      doc.setTextColor(...WHITE);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text('Property Details', W / 2, 35, { align: 'center' });

      // Address & price sub-header
      doc.setTextColor(220, 235, 235);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(String(recordTitle).substring(0, 90), W / 2, 55, { align: 'center' });
      if (priceStr) doc.text(priceStr, W / 2, 72, { align: 'center' });

      // Orange line separator
      doc.setDrawColor(...ORANGE);
      doc.setLineWidth(1.5);
      doc.line(40, 78, W - 30, 78);

      // Filtered details table
      const textRows = entries
        .filter(([k, v]) => {
          if (EXCLUDED.has(k)) return false;
          if (v === null || v === undefined || v === '') return false;
          if (typeof v === 'string' && isUrl(v)) return false;
          if (Array.isArray(v) && v.length > 0 && v.every(i => isUrl(String(i)))) return false;
          return true;
        })
        .map(([k, v]) => [
          k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          flattenForPDF(v).substring(0, 400),
        ]);

      autoTable(doc, {
        startY: 88,
        head: [['Field', 'Value']],
        body: textRows,
        theme: 'grid',
        headStyles: {
          textColor: WHITE,
          fillColor: [32, 68, 70],
          fontStyle: 'bold',
          fontSize: 10,
          cellPadding: { top: 6, bottom: 6, left: 10, right: 10 },
        },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 170, textColor: WHITE },
          1: { cellWidth: W - 80 - 170, textColor: [220, 230, 230] },
        },
        styles: {
          fontSize: 9,
          cellPadding: { top: 5, bottom: 5, left: 10, right: 10 },
          overflow: 'linebreak',
          fillColor: [42, 90, 93],
          lineColor: [90, 145, 148],
          lineWidth: 0.75,
        },
        alternateRowStyles: {
          fillColor: [36, 78, 81],
        },
        margin: { top: 88, right: 30, bottom: 30, left: 40 },
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

            {/* Price — highlighted */}
            {(() => {
              const price =
                record.rental_price || record.huurprijs || record.rent ||
                record.price || record.asking_price ||
                record.prijs || record.koopprijs ||
                record.selling_price || record.verkoopprijs;
              if (!price) return null;
              const isRent = !!(record.rental_price || record.huurprijs || record.rent);
              const raw = String(price).replace(/[€$£\s]/g, '').replace(/,/g, '');
              const num = parseFloat(raw);
              const formatted = !isNaN(num)
                ? `€ ${num.toLocaleString('nl-NL')}, -`
                : `€ ${String(price).replace(/[€$£]/g, '').trim()}`;
              const suffix = isRent ? 'excl. Per month' : '';
              return (
                <div style={styles.priceTag}>
                  <span style={styles.priceLabel}>Price</span>
                  <span style={styles.priceValue}>{formatted}</span>
                  {suffix && <span style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.15rem' }}>{suffix}</span>}
                </div>
              );
            })()}
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
