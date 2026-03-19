import React from 'react';

function Table({ data, tableName }) {
  if (!data || data.length === 0) {
    return <div style={styles.emptyState}>No data found in the "{tableName || 'selected'}" table.</div>;
  }

  // Extract headers dynamically from the keys of the first object
  const headers = Object.keys(data[0]);

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
            <tr key={rowIndex} style={rowIndex % 2 === 0 ? styles.evenRow : styles.oddRow}>
              {headers.map((header) => (
                <td key={header} style={styles.td}>
                  {row[header] !== null && row[header] !== undefined 
                    ? String(row[header]) 
                    : <span style={styles.nullText}>-</span>}
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
    fontSize: '0.95rem',
  },
  th: {
    padding: '1rem',
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
    padding: '1rem',
    borderBottom: '1px solid #eaeaea',
    color: '#333',
    whiteSpace: 'nowrap',
  },
  nullText: {
    color: '#aaa',
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem 1rem',
    color: '#888',
    fontStyle: 'italic',
    backgroundColor: '#fafafa',
    borderRadius: '8px',
  }
};

export default Table;
