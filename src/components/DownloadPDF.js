import React, { useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function DownloadPDF({ data, tableName }) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleDownload = () => {
    if (!data || data.length === 0) {
      alert("No data available to download.");
      return;
    }

    // Set loading state so UI shows "Generating..."
    setIsGenerating(true);

    // Use a tiny timeout to allow React to render the "Generating..." text
    // before the PDF processing locks up the main thread
    setTimeout(() => {
      try {
        // Initialize jsPDF document
        const doc = new jsPDF('l', 'mm', 'a4');
        
        // Header setup
        const reportTitle = tableName ? `${tableName.replace(/_/g, ' ').toUpperCase()} Report` : "Data Report";
        doc.setFontSize(18);
        doc.setTextColor(40);
        doc.text(reportTitle, 14, 22);
        
        // Subtitle / metadata
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
        doc.text(`Total Records: ${data.length} (Displaying up to 1000)`, 14, 36);

        // Prepare headers and body rows
        const headers = Object.keys(data[0]);
        
        // SAFETY 1: Limit rows to a maximum of 1000 so the browser memory doesn't explode
        const maxRows = data.slice(0, 1000);
        
        // SAFETY 2: Truncate massively long strings
        // If a column contains a huge paragraph (e.g. thousands of words), 
        // the PDF library loops infinitely trying to calculate word-wraps.
        const body = maxRows.map(row => headers.map(header => {
          const cellValue = row[header];
          if (cellValue === null || cellValue === undefined) return '-';
          const strVal = String(cellValue);
          return strVal.length > 200 ? strVal.substring(0, 197) + '...' : strVal;
        }));

        // Generate table in PDF
        autoTable(doc, {
          startY: 42,
          head: [headers.map(h => h.replace(/_/g, ' ').toUpperCase())],
          body: body,
          theme: 'grid',
          headStyles: { 
            fillColor: [10, 102, 194],
            textColor: 255,
            fontStyle: 'bold' 
          },
          styles: {
            fontSize: 8,
            cellPadding: 2,
            overflow: 'linebreak'
          },
          alternateRowStyles: {
            fillColor: [248, 249, 250]
          },
          margin: { top: 40, right: 14, bottom: 20, left: 14 },
          // SAFETY 3: Horizontal Page Breaks
          // If your table has 20+ columns, the library will crash trying to squeeze them 
          // into one single page. This allows it to spill over horizontally!
          horizontalPageBreak: true,
          horizontalPageBreakRepeat: 0,
        });

        // Save as local PDF file
        const safeName = tableName ? tableName.replace(/[^a-z0-9]/gi, '-').toLowerCase() : 'export';
        doc.save(`${safeName}-data-export.pdf`);
      } catch (err) {
        console.error("PDF Generation Error: ", err);
        alert("An error occurred while generating the PDF. The data might be too wide or complex.");
      } finally {
        setIsGenerating(false);
      }
    }, 50);
  };

  return (
    <button 
      onClick={handleDownload} 
      disabled={isGenerating}
      style={{
        ...styles.button, 
        opacity: isGenerating ? 0.7 : 1,
        cursor: isGenerating ? 'wait' : 'pointer'
      }}
    >
      {isGenerating ? 'Generating PDF...' : 'Download PDF'}
    </button>
  );
}

const styles = {
  button: {
    background: '#10b981',
    color: '#ffffff',
    border: 'none',
    padding: '0.6rem 1.2rem',
    fontSize: '0.95rem',
    borderRadius: '6px',
    fontWeight: '500',
    transition: 'background 0.2s',
    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
  }
};

export default DownloadPDF;
