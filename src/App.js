import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Table from './components/Table';
import DownloadPDF from './components/DownloadPDF';
import RecordDetail from './components/RecordDetail';

function App() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [data, setData] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  // The record the user clicked on to see its detail page
  const [selectedRecord, setSelectedRecord] = useState(null);

  useEffect(() => {
    fetchTables();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTables = async () => {
    setLoadingTables(true);
    setError(null);
    try {
      const { data: tableData, error: fetchError } = await supabase.rpc('get_public_tables');
      
      if (fetchError) {
        if (fetchError.message.includes('Could not find the function')) {
          throw new Error('Please run the SQL script in Supabase to create the get_public_tables function.');
        }
        throw fetchError;
      }
      
      const tableNames = tableData ? tableData.map(t => t.table_name) : [];
      setTables(tableNames);
      
      if (tableNames.length > 0 && !selectedTable) {
        setSelectedTable(tableNames[0]);
        fetchDataForTable(tableNames[0]);
      }
    } catch (err) {
      console.error("Error fetching tables:", err);
      setError(err.message);
    } finally {
      setLoadingTables(false);
    }
  };

  const fetchDataForTable = async (tableName) => {
    setSelectedTable(tableName);
    setSelectedRecord(null);
    setSearchQuery('');
    setLoadingData(true);
    setError(null);
    try {
      const { data: tableData, error: fetchError } = await supabase
        .from(tableName)
        .select('*');

      if (fetchError) throw fetchError;
      
      setData(tableData || []);
    } catch (err) {
      console.error(`Error fetching data for ${tableName}:`, err);
      setError(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  // ── Search filtering ──────────────────────────────────────────────────────
  const SEARCH_COLS = ['id', 'external_id', 'global_id'];
  const filteredData = searchQuery.trim() === ''
    ? data
    : data.filter(row =>
        SEARCH_COLS.some(col =>
          row[col] !== undefined &&
          String(row[col]).toLowerCase().includes(searchQuery.toLowerCase())
        )
      );

  // ── If a record is selected, render the full detail page ──
  if (selectedRecord) {
    return (
      <RecordDetail
        record={selectedRecord}
        tableName={selectedTable}
        onBack={() => setSelectedRecord(null)}
      />
    );
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>Dynamic Data Dashboard</h1>
        <p style={styles.subtitle}>Select any table from your Supabase project</p>
      </header>
      
      {error && <div style={styles.error}>Error: {error}</div>}

      <div style={styles.layout}>
        {/* Sidebar */}
        <aside style={styles.sidebar}>
          <h3 style={styles.sidebarTitle}>Your Tables</h3>
          
          {loadingTables ? (
            <p style={styles.loadingText}>Loading tables...</p>
          ) : tables.length === 0 ? (
            <p style={styles.emptyText}>No tables found.</p>
          ) : (
             <div style={styles.navList}>
              {tables.map(tbl => (
                <button
                  key={tbl}
                  onClick={() => fetchDataForTable(tbl)}
                  style={{
                    ...styles.navItem,
                    ...(selectedTable === tbl ? styles.navItemSelected : {})
                  }}
                >
                  {tbl.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          )}
          
          <button onClick={fetchTables} disabled={loadingTables} style={styles.refreshBtn}>
            Refresh Tables List
          </button>
        </aside>

        {/* Main Content */}
        <main style={styles.main}>
          {!selectedTable ? (
            <div style={styles.centerAction}>
              <p style={styles.mutedText}>Select a table from the sidebar to view data.</p>
            </div>
          ) : (
            <div style={styles.dashboard}>
              <div style={styles.toolbar}>
                <h2 style={styles.tableTitle}>Data: <span style={styles.highlight}>{selectedTable}</span></h2>
                <div style={styles.actions}>
                   <button 
                     onClick={() => fetchDataForTable(selectedTable)} 
                     disabled={loadingData} 
                     style={styles.secondaryButton}
                   >
                     {loadingData ? 'Refreshing...' : 'Refresh Data'}
                   </button>
                   <DownloadPDF data={data} tableName={selectedTable} />
                </div>
              </div>

              {/* Search bar */}
              <div style={styles.searchWrap}>
                <span style={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by ID, External ID, or Global ID…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={styles.clearBtn} title="Clear search">
                    ✕
                  </button>
                )}
              </div>
              {searchQuery && (
                <p style={styles.searchMeta}>
                  {filteredData.length} result{filteredData.length !== 1 ? 's' : ''} for <strong>"{searchQuery}"</strong>
                </p>
              )}

              {/* Hint for user */}
              <p style={styles.hint}>
                💡 Click on an <strong>ID</strong> or <strong>External ID</strong> to view full details for that record.
              </p>
              
              {loadingData ? (
                <div style={styles.centerAction}><p style={styles.loadingText}>Fetching data...</p></div>
              ) : (
                 <Table
                   data={filteredData}
                   tableName={selectedTable}
                   onRowClick={(row) => setSelectedRecord(row)}
                 />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  // ── Page wrapper ──────────────────────────────────────────────────────────
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 0 3rem 0',
    minHeight: '100vh',
    background: '#F5F5F5',
  },

  // ── Top navbar ───────────────────────────────────────────────────────────
  header: {
    background: '#1E2A38',
    padding: '0 2.5rem',
    marginBottom: '2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '64px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#FFFFFF',
    margin: 0,
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '400',
  },

  // ── Body layout ──────────────────────────────────────────────────────────
  layout: {
    display: 'flex',
    gap: '1.5rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    padding: '0 2rem',
  },

  // ── Sidebar ───────────────────────────────────────────────────────────────
  sidebar: {
    flex: '0 0 220px',
    background: '#FFFFFF',
    borderRadius: '8px',
    padding: '1.25rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    border: '1px solid #E0E0E0',
  },
  sidebarTitle: {
    margin: '0 0 1rem 0',
    fontSize: '11px',
    fontWeight: '700',
    color: '#999999',
    textTransform: 'uppercase',
    letterSpacing: '0.09em',
    borderBottom: '1px solid #E0E0E0',
    paddingBottom: '0.75rem',
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '1.25rem',
  },
  navItem: {
    padding: '0.6rem 0.9rem',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#555555',
    textTransform: 'capitalize',
    fontWeight: '500',
    transition: 'all 0.15s ease',
    width: '100%',
  },
  navItemSelected: {
    background: '#008080',
    color: '#FFFFFF',
    fontWeight: '600',
  },
  refreshBtn: {
    width: '100%',
    padding: '0.6rem',
    background: '#F5F5F5',
    color: '#444',
    border: '1px solid #E0E0E0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '13px',
    transition: 'background 0.15s',
  },

  // ── Main content card ─────────────────────────────────────────────────────
  main: {
    flex: '1 1 600px',
    background: '#FFFFFF',
    borderRadius: '8px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    padding: '1.75rem 2rem',
    minHeight: '400px',
    border: '1px solid #E0E0E0',
  },
  centerAction: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '200px',
  },
  dashboard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  // ── Search bar ────────────────────────────────────────────────────────────
  searchWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: '0.9rem',
    fontSize: '0.9rem',
    pointerEvents: 'none',
    color: '#AAAAAA',
  },
  searchInput: {
    width: '100%',
    padding: '0.65rem 2.8rem 0.65rem 2.5rem',
    fontSize: '14px',
    border: '1.5px solid #E0E0E0',
    borderRadius: '6px',
    outline: 'none',
    color: '#333333',
    background: '#FAFAFA',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  clearBtn: {
    position: 'absolute',
    right: '0.85rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#AAAAAA',
    fontSize: '0.85rem',
    padding: '0.2rem',
    lineHeight: 1,
  },
  searchMeta: {
    fontSize: '12px',
    color: '#888888',
    margin: '-0.4rem 0 0',
  },

  // ── Toolbar (table title + actions) ──────────────────────────────────────
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1rem',
    borderBottom: '1px solid #E0E0E0',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  tableTitle: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '700',
    color: '#111111',
  },
  highlight: {
    color: '#008080',
    textTransform: 'capitalize',
    fontWeight: '700',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
  },
  secondaryButton: {
    background: '#F5F5F5',
    color: '#444444',
    border: '1px solid #E0E0E0',
    padding: '0.5rem 1.1rem',
    fontSize: '13px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  },

  // ── Hint banner ───────────────────────────────────────────────────────────
  hint: {
    fontSize: '12.5px',
    color: '#555555',
    background: '#F0FAFA',
    border: '1px solid #B2DFDF',
    borderRadius: '6px',
    padding: '0.55rem 1rem',
    margin: '0.25rem 0',
  },

  // ── Error / status ────────────────────────────────────────────────────────
  error: {
    color: '#c0392b',
    textAlign: 'center',
    padding: '1rem',
    background: '#fdecea',
    borderRadius: '6px',
    marginBottom: '1.5rem',
    fontWeight: '500',
    fontSize: '14px',
    margin: '0 2rem 1.5rem',
    border: '1px solid #f5c6c2',
  },
  mutedText: {
    color: '#999999',
    fontStyle: 'italic',
    fontSize: '14px',
  },
  emptyText: {
    color: '#999999',
    marginBottom: '1rem',
    fontSize: '13px',
  },
  loadingText: {
    color: '#666666',
    fontSize: '14px',
  },
};

export default App;
