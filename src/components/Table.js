import React from 'react';

const CLICKABLE_COLS = ['id', 'external_id', 'global_id'];

function Table({ data, tableName, onRowClick }) {
  if (!data || data.length === 0) {
    return (
      <div style={styles.emptyWrap}>
        <span style={styles.emptyIcon}>📭</span>
        <p>No records found in "{tableName}".</p>
      </div>
    );
  }

  const headers = Object.keys(data[0]);
  
  // Convert standard generic table into a strict layout based on headers
  const getColWidth = (header) => {
    const lower = header.toLowerCase();
    if (lower === 'id') return '5%';
    if (lower.includes('uid') || lower.includes('id')) return '10%';
    if (lower.includes('date') || lower.includes('time')) return '12%';
    if (lower.includes('status')) return '8%';
    return `${Math.floor(80 / Math.max(1, headers.length - 4))}%`; 
  };

  const renderCell = (row, header) => {
    const value = row[header];
    const isClickable = CLICKABLE_COLS.includes(header.toLowerCase());

    if (value === null || value === undefined || value === '') {
      return <span style={styles.nullText}>—</span>;
    }

    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);

    if (isClickable) {
      return (
        <button
          style={styles.idLink}
          onClick={() => onRowClick && onRowClick(row)}
          title={`View full profile for ${strVal}`}
        >
          {strVal}
        </button>
      );
    }

    return (
      <span title={strVal} style={styles.cellText}>
        {strVal}
      </span>
    );
  };

  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={{...styles.th, width: getColWidth(header)}}>
                {header.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="table-row-hover"
              style={rowIndex % 2 === 0 ? styles.evenRow : styles.oddRow}
            >
              {headers.map((header) => (
                <td key={header} style={styles.td}>
                  {renderCell(row, header)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  tableContainer: {
    width: '100%',
    // This strictly prevents the container from horizontally scrolling the page
    overflowX: 'hidden', 
    overflowY: 'auto',
    maxHeight: '65vh', // allows vertical scroll within the card
    background: '#FFFFFF',
    borderTop: '1px solid #E2E8F0',
  },
  table: {
    width: '100%',
    tableLayout: 'fixed', // Forces strict column constraints (no horizontal overflow)
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '13px',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  th: {
    position: 'sticky',
    top: 0,
    zIndex: 20,
    padding: '0.85rem 1.25rem',
    // Subtle dual gradient for the header to maintain the theme elegantly 
    background: 'linear-gradient(to right, #F8FAFC, #F1F5F9)',
    borderBottom: '2px solid #E2E8F0',
    fontWeight: '600',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
  },
  evenRow: {
    backgroundColor: '#FFFFFF',
  },
  oddRow: {
    backgroundColor: '#F8FAFC', // very subtle zebra
  },
  td: {
    padding: '0.8rem 1.25rem',
    borderBottom: '1px solid #F1F5F9',
    color: '#334155',
    // Enforcing text truncation
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  cellText: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
  },
  nullText: {
    color: '#CBD5E1',
  },
  idLink: {
    background: 'rgba(20, 184, 166, 0.1)',
    border: '1px solid rgba(20, 184, 166, 0.2)',
    color: '#0F766E',
    cursor: 'pointer',
    fontSize: '12.5px',
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontWeight: '600',
    transition: 'all 0.2s',
    display: 'inline-block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  emptyWrap: {
    padding: '4rem 0',
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: '14px',
  },
  emptyIcon: {
    fontSize: '24px',
    marginBottom: '0.5rem',
    display: 'block',
  }
};

export default Table;
