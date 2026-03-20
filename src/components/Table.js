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

    // Truncate long strings in the table
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
    borderRadius: '8px',
    border: '1px solid #eaeaea',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.93rem',
  },
  th: {
    padding: '0.9rem 1rem',
    backgroundColor: '#fafafa',
    borderBottom: '2px solid #eaeaea',
    fontWeight: '600',
    color: '#555',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
  },
  evenRow: {
    backgroundColor: '#ffffff',
  },
  oddRow: {
    backgroundColor: '#f8f9fa',
  },
  td: {
    padding: '0.85rem 1rem',
    borderBottom: '1px solid #eaeaea',
    color: '#333',
    whiteSpace: 'nowrap',
    maxWidth: '280px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  nullText: {
    color: '#aaa',
  },
  idLink: {
    background: 'none',
    border: 'none',
    color: '#0a66c2',
    cursor: 'pointer',
    fontSize: '0.93rem',
    padding: 0,
    textDecoration: 'underline',
    textDecorationStyle: 'dotted',
    fontFamily: 'monospace',
    fontWeight: '500',
    textAlign: 'left',
    wordBreak: 'break-all',
    whiteSpace: 'normal',
    maxWidth: '200px',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 1rem',
    color: '#888',
    fontStyle: 'italic',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
  },
};

export default Table;
