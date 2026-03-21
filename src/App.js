import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Table from './components/Table';
import DownloadPDF from './components/DownloadPDF';
import RecordDetail from './components/RecordDetail';

function App() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [data, setData] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
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
      if (fetchError) throw fetchError;
      
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
    if (!tableName) return;
    setSelectedTable(tableName);
    setSelectedRecord(null);
    setSearchQuery('');
    setLoadingData(true);
    setError(null);
    try {
      const { data: tableData, error: fetchError } = await supabase.from(tableName).select('*');
      if (fetchError) throw fetchError;
      setData(tableData || []);
    } catch (err) {
      console.error(`Error fetching data for ${tableName}:`, err);
      setError(err.message);
    } finally {
      setLoadingData(false);
    }
  };

  const SEARCH_COLS = ['id', 'external_id', 'global_id'];
  const filteredData = searchQuery.trim() === ''
    ? data
    : data.filter(row =>
        SEARCH_COLS.some(col =>
          row[col] !== undefined &&
          String(row[col]).toLowerCase().includes(searchQuery.toLowerCase())
        )
      );

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
      {/* ── Sticky Top Navbar ── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoCircle}>
            <span style={styles.logoText}>D</span>
          </div>
          <div>
            <h1 style={styles.title}>Dynamic Data Dashboard</h1>
            <p style={styles.subtitle}>Supabase Explorer</p>
          </div>
        </div>
        
        <div style={styles.headerCenter}>
          {loadingTables ? (
            <span style={styles.navLoading}>Loading tables...</span>
          ) : tables.length > 0 && (
            <div style={styles.tableSelectorWrap}>
              <select 
                value={selectedTable} 
                onChange={(e) => fetchDataForTable(e.target.value)}
                style={styles.tableSelect}
              >
                {tables.map(tbl => (
                  <option key={tbl} value={tbl} style={{color: '#333'}}>{tbl.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <div style={styles.selectChevron}>▼</div>
            </div>
          )}
        </div>

        <div style={styles.headerRight}>
          <button 
            onClick={() => fetchDataForTable(selectedTable)} 
            disabled={loadingData || !selectedTable} 
            style={styles.actionBtn}
            className="action-btn-hover"
          >
            {loadingData ? '⏳ Refreshing...' : '↻ Refresh'}
          </button>
          
          <div className="action-btn-hover" style={styles.pdfWrap}>
             {selectedTable && data.length > 0 && (
               <DownloadPDF data={filteredData} tableName={selectedTable} />
             )}
          </div>
        </div>
      </header>
      
      {/* ── Main Content Area ── */}
      <main style={styles.main}>
        {error && <div style={styles.errorBanner}>{error}</div>}

        {!selectedTable && !loadingTables && !error ? (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>📂</div>
            <p>Select a table from the top menu to view data.</p>
          </div>
        ) : (
          <div style={styles.card}>
            {/* Search & Info */}
            <div style={styles.cardTop}>
              <div style={styles.searchWrap}>
                <span style={styles.searchIcon}>🔍</span>
                <input
                  type="text"
                  placeholder="Search by ID, External ID, or Global ID…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={styles.searchInput}
                  className="search-input"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={styles.clearBtn} title="Clear search">✕</button>
                )}
              </div>
              
              <div style={styles.infoBanner}>
                <span style={styles.infoIcon}>💡</span>
                <span>Click on any highlighted <strong>ID</strong> or <strong>External ID</strong> to view the full details profile.</span>
              </div>
            </div>

            {searchQuery && (
               <p style={styles.searchMeta}>
                 Found <strong style={{color: '#0F766E'}}>{filteredData.length}</strong> result{filteredData.length !== 1 ? 's' : ''} for "{searchQuery}"
               </p>
            )}

            {/* Table Area */}
            <div style={styles.tableSection}>
              {loadingData ? (
                <div style={styles.loadingState}>
                  <div style={styles.spinner}></div>
                  <p>Fetching {selectedTable} data...</p>
                </div>
              ) : (
                 <Table
                   data={filteredData}
                   tableName={selectedTable}
                   onRowClick={(row) => setSelectedRecord(row)}
                 />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Global styles injection for animations and strictly preventing horizontal scroll */}
      <style>{`
        body { 
          margin: 0; 
          background: #F4F9F9; 
          overflow-x: hidden !important; 
          width: 100vw;
        }
        * { box-sizing: border-box; }
        
        .table-row-hover {
          transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.15s ease;
        }
        .table-row-hover:hover {
          background-color: #F0FDFA !important;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(13, 148, 136, 0.08);
          position: relative;
          z-index: 10;
        }

        .action-btn-hover {
          transition: all 0.25s ease;
        }
        .action-btn-hover:hover {
          box-shadow: 0 0 12px rgba(20, 184, 166, 0.4);
          transform: translateY(-1px);
        }

        .search-input:focus {
          border-color: #14B8A6 !important;
          box-shadow: 0 0 0 3px rgba(20, 184, 166, 0.15) !important;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    color: '#1E293B',
    paddingBottom: '4rem',
    overflowX: 'hidden',
  },

  // ── Header (Sticky, Gradient) ──
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    // Dual color gradient requested by user (Deep Teal to Vibrant Turquoise/Soft Green)
    background: 'linear-gradient(135deg, #0F766E 0%, #14B8A6 100%)', 
    padding: '0.75rem 2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 4px 20px rgba(15, 118, 110, 0.25)',
    gap: '1.5rem',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flex: '1 1 20%',
  },
  logoCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    border: '1px solid rgba(255,255,255,0.3)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
  },
  logoText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: '18px',
  },
  title: {
    margin: 0,
    color: '#FFFFFF',
    fontSize: '17px',
    fontWeight: '700',
    letterSpacing: '-0.2px',
    textShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
  subtitle: {
    margin: 0,
    color: '#CCFBF1',
    fontSize: '11px',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  headerCenter: {
    flex: '1 1 40%',
    display: 'flex',
    justifyContent: 'center',
  },
  tableSelectorWrap: {
    position: 'relative',
    width: '100%',
    maxWidth: '300px',
  },
  tableSelect: {
    width: '100%',
    appearance: 'none',
    background: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    backdropFilter: 'blur(10px)',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '600',
    padding: '0.6rem 2.5rem 0.6rem 1.25rem',
    borderRadius: '20px',
    cursor: 'pointer',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
  },
  selectChevron: {
    position: 'absolute',
    right: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#FFFFFF',
    fontSize: '10px',
    pointerEvents: 'none',
    opacity: 0.8,
  },
  navLoading: {
    color: '#CCFBF1',
    fontSize: '13px',
    fontStyle: 'italic',
  },

  headerRight: {
    flex: '1 1 20%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
  actionBtn: {
    background: 'rgba(255,255,255,0.15)',
    color: '#FFFFFF',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    backdropFilter: 'blur(4px)',
  },
  pdfWrap: {
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '8px',
    backdropFilter: 'blur(4px)',
    display: 'flex',
  },

  // ── Main Content ──
  main: {
    maxWidth: '1350px',
    margin: '2.5rem auto 0',
    padding: '0 1.5rem',
  },
  card: {
    background: '#FFFFFF',
    borderRadius: '16px',
    boxShadow: '0 10px 40px -10px rgba(15, 118, 110, 0.08)',
    border: '1px solid #E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  cardTop: {
    padding: '1.5rem',
    borderBottom: '1px solid #F1F5F9',
    background: 'linear-gradient(to bottom, #FFFFFF 0%, #F8FAFC 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },

  searchWrap: {
    position: 'relative',
    maxWidth: '500px',
  },
  searchIcon: {
    position: 'absolute',
    left: '1rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94A3B8',
    fontSize: '14px',
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid #CBD5E1',
    padding: '0.65rem 2.5rem 0.65rem 2.5rem',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#1E293B',
    outline: 'none',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.02) inset',
  },
  clearBtn: {
    position: 'absolute',
    right: '0.8rem',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#94A3B8',
    cursor: 'pointer',
    padding: '0.2rem',
  },

  infoBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '12.5px',
    color: '#64748B',
    padding: '0.5rem 0.75rem',
    background: '#F0FDFA',
    borderRadius: '8px',
    borderLeft: '3px solid #14B8A6',
  },
  infoIcon: {
    fontSize: '14px',
  },
  searchMeta: {
    fontSize: '12px',
    color: '#64748B',
    margin: '0',
    padding: '0.5rem 1.5rem 0',
  },

  tableSection: {
    padding: '0', 
    width: '100%',
  },

  loadingState: {
    padding: '4rem 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    color: '#0F766E',
    fontSize: '14px',
    fontWeight: '500',
  },
  spinner: {
    width: '30px',
    height: '30px',
    border: '3px solid #CCFBF1',
    borderTop: '3px solid #0F766E',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },

  emptyState: {
    padding: '6rem 0',
    textAlign: 'center',
    color: '#64748B',
    fontSize: '15px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '1rem',
    opacity: 0.6,
  },

  errorBanner: {
    background: '#FEF2F2',
    color: '#B91C1C',
    padding: '1rem 1.5rem',
    borderRadius: '10px',
    marginBottom: '1.5rem',
    border: '1px solid #FECACA',
    fontSize: '14px',
    fontWeight: '500',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
};

export default App;
