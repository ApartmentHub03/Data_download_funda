import React from 'react';

// Columns that should be clickable to open the detail page
const CLICKABLE_COLS = ['id', 'external_id', 'global_id'];

function Table({ data, tableName, onRowClick }) {
  if (!data || data.length === 0) {
    return (
      <div style={styles.emptyState}>
        No data found in the "{tableName || 'selected'}" table.
      </div>
    );
  }

  const headers = Object.keys(data[0]);

  const renderCell = (row, header) => {
    const value = row[header];
    const isClickable = CLICKABLE_COLS.includes(header.toLowerCase());

    if (value === null || value === undefined) {
      return <span style={styles.nullText}>—</span>;
    }

    const strVal = String(value);

    if (isClickable) {
      return (
        <button
          style={styles.idLink}
          onClick={() => onRowClick && onRowClick(row)}
          title={`Click to view details for ${strVal}`}
        >
          {strVal}
        </button>
      );
    }

    return strVal.length > 80 ? strVal.substring(0, 78) + '…' : strVal;
  };

  return (
    <div style={styles.tableContainer}>
      <table style={styles.table}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={styles.th}>
                {header.replace(/_/g, ' ')}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="data-row"
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
    overflowX: 'auto',
    borderRadius: '6px',
    border: '1px solid #E0E0E0',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '14px',
    fontFamily: "'Inter', -apple-system, sans-serif",
  },
  th: {
    padding: '0.85rem 1rem',
    backgroundColor: '#F0F0F0',
    borderBottom: '2px solid #E0E0E0',
    fontWeight: '600',
    fontSize: '13px',
    color: '#333333',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
    letterSpacing: '0.01em',
  },
  evenRow: {
    backgroundColor: '#FFFFFF',
    transition: 'background-color 0.15s',
  },
  oddRow: {
    backgroundColor: '#FAFAFA',
    transition: 'background-color 0.15s',
  },
  td: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #F0F0F0',
    color: '#333333',
    whiteSpace: 'nowrap',
    maxWidth: '280px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontSize: '14px',
  },
  nullText: {
    color: '#CCCCCC',
  },
  idLink: {
    background: 'none',
    border: 'none',
    color: '#008080',
    cursor: 'pointer',
    fontSize: '13px',
    padding: 0,
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    fontFamily: 'monospace',
    fontWeight: '600',
    textAlign: 'left',
    wordBreak: 'break-all',
    whiteSpace: 'normal',
    maxWidth: '200px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 1rem',
    color: '#999999',
    fontStyle: 'italic',
    fontSize: '14px',
    backgroundColor: '#FAFAFA',
    borderRadius: '6px',
    border: '1px dashed #E0E0E0',
  },
};

export default Table;
