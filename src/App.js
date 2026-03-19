import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Table from './components/Table';
import DownloadPDF from './components/DownloadPDF';

function App() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [data, setData] = useState([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState(null);

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
              
              {loadingData ? (
                <div style={styles.centerAction}><p style={styles.loadingText}>Fetching data...</p></div>
              ) : (
                 <Table data={data} tableName={selectedTable} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const styles = {
  container: {
    maxWidth: '1300px',
    margin: '0 auto',
    padding: '2rem 1rem',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2.5rem',
  },
  title: {
    fontSize: '2.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.5rem 0',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '1.2rem',
    color: '#666',
    margin: 0,
  },
  layout: {
    display: 'flex',
    gap: '2rem',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  sidebar: {
    flex: '0 0 250px',
    background: '#ffffff',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
  },
  sidebarTitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.2rem',
    color: '#333',
    borderBottom: '2px solid #eaebec',
    paddingBottom: '0.8rem',
  },
  navList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  navItem: {
    padding: '0.8rem 1rem',
    textAlign: 'left',
    background: 'transparent',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#555',
    textTransform: 'capitalize',
    transition: 'all 0.2s',
  },
  navItemSelected: {
    background: '#0a66c2',
    color: '#fff',
    fontWeight: '600',
  },
  refreshBtn: {
    width: '100%',
    padding: '0.8rem',
    background: '#f4f4f9',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  main: {
    flex: '1 1 600px',
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
    padding: '2rem',
    minHeight: '400px',
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
    gap: '1.5rem',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1rem',
    borderBottom: '1px solid #eaebec',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  tableTitle: {
    margin: 0,
    fontSize: '1.4rem',
    color: '#555',
  },
  highlight: {
    color: '#0a66c2',
    textTransform: 'capitalize',
  },
  actions: {
    display: 'flex',
    gap: '1rem',
  },
  secondaryButton: {
    background: '#f4f4f9',
    color: '#333',
    border: '1px solid #ddd',
    padding: '0.6rem 1.2rem',
    fontSize: '0.95rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  error: {
    color: '#d32f2f',
    textAlign: 'center',
    padding: '1rem',
    background: '#fdecea',
    borderRadius: '6px',
    marginBottom: '2rem',
    fontWeight: '500',
  },
  mutedText: {
    color: '#888',
    fontStyle: 'italic',
  },
  emptyText: {
    color: '#888',
    marginBottom: '1rem',
  },
  loadingText: {
    color: '#555',
  }
};

export default App;
