import { useState, useEffect } from 'react'

function App() {
  const [inventory, setInventory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [forecast, setForecast] = useState([])
  
  // Offline State
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [queuedRequests, setQueuedRequests] = useState(0)

  // Form State
  const [patientBloodType, setPatientBloodType] = useState('O+')
  const [units, setUnits] = useState(1)
  const [message, setMessage] = useState({ type: '', text: '' })
  const [reservedBags, setReservedBags] = useState([])

  const fetchData = () => {
    if (!navigator.onLine) return; // Don't fetch if offline

    fetch('http://127.0.0.1:8000/api/inventory')
      .then(response => response.json())
      .then(data => {
        setInventory(Array.isArray(data.inventory) ? data.inventory : [])
        setLoading(false)
      })
      .catch(error => {
        console.error("Error fetching data:", error)
        setError("Could not connect to the backend.")
        setLoading(false)
      })

    fetch('http://127.0.0.1:8000/api/forecast')
      .then(response => response.json())
      .then(data => {
        if (data.forecast && data.forecast.length > 0) setForecast(data.forecast)
        else setForecast([])
      })
      .catch(error => console.error("Error fetching forecast:", error))
  }

  // Function to sync offline requests
  const syncOfflineRequests = async () => {
    const queue = JSON.parse(localStorage.getItem('offline_requests') || '[]');
    if (queue.length === 0) return;

    setMessage({ type: 'info', text: `Syncing ${queue.length} offline requests...` });

    for (const request of queue) {
      try {
        await fetch('http://127.0.0.1:8000/api/smart-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request)
        });
      } catch (err) {
        console.error("Failed to sync request", err);
      }
    }

    // Clear the queue after syncing
    localStorage.removeItem('offline_requests');
    setQueuedRequests(0);
    setMessage({ type: 'success', text: '✅ Offline requests synced successfully!' });
    fetchData(); // Refresh the dashboard
  };

  // Network listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineRequests(); // Trigger sync when coming back online
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Check initial queue count
    const queue = JSON.parse(localStorage.getItem('offline_requests') || '[]');
    setQueuedRequests(queue.length);

    fetchData();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSmartMatch = async (e) => {
    e.preventDefault();
    setMessage({ type: 'info', text: 'Running compatibility engine...' });
    setReservedBags([]);
    
    const requestData = {
      hospital_id: 1,
      patient_blood_type: patientBloodType,
      units_needed: parseInt(units)
    };

    // 🔥 OFFLINE LOGIC
    if (!isOnline) {
      const queue = JSON.parse(localStorage.getItem('offline_requests') || '[]');
      queue.push(requestData);
      localStorage.setItem('offline_requests', JSON.stringify(queue));
      setQueuedRequests(queue.length);
      setMessage({ type: 'error', text: '📡 Network offline. Request saved locally and queued for sync.' });
      return; // Stop here, don't try to fetch
    }

    // 🌐 ONLINE LOGIC
    try {
      const response = await fetch('http://127.0.0.1:8000/api/smart-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setMessage({ type: 'success', text: '✅ Match Found! Bags Reserved.' });
        setReservedBags(data.bags_reserved);
        setUnits(1);
        fetchData(); 
      } else {
        setMessage({ type: 'error', text: '❌ ' + (data.detail || 'Match failed.') });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '❌ Error connecting to server.' });
    }
  };

  const getBloodColor = (type) => {
    if (type.includes('-')) return 'bg-red-100 text-red-700 border border-red-200';
    if (type.includes('A')) return 'bg-blue-100 text-blue-700 border border-blue-200';
    if (type.includes('B')) return 'bg-green-100 text-green-700 border border-green-200';
    return 'bg-purple-100 text-purple-700 border border-purple-200';
  }

  if (error) {
    return (
      <div className="min-h-screen bg-sky-50 text-slate-800 p-8 flex items-center justify-center">
        <div className="bg-red-100 p-8 rounded-lg border border-red-300 shadow-lg">
          <h2 className="text-xl font-bold mb-2 text-red-700">System Offline</h2>
          <p className="text-red-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-sky-50 text-slate-800 p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        
        {/* Header */}
        <header className="mb-8 border-b border-sky-200 pb-4 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-bold text-sky-900 tracking-wider">BLOODLINK <span className="text-sky-500 text-2xl font-normal">/ COMMAND</span></h1>
            <p className="text-sky-700 mt-2 font-medium">Smart Matching & Logistics Engine</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-sky-600 font-bold">SYSTEM STATUS</p>
            {isOnline ? (
              <p className="text-green-600 font-bold flex items-center gap-2 justify-end">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span> ONLINE
              </p>
            ) : (
              <p className="text-orange-500 font-bold flex items-center gap-2 justify-end">
                <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span> OFFLINE
              </p>
            )}
            {queuedRequests > 0 && (
              <p className="text-xs text-orange-500 font-bold mt-1">
                {queuedRequests} Request(s) Queued
              </p>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Patient Matcher */}
          <div className="lg:col-span-1 space-y-8">
            <div className="bg-sky-100 p-6 rounded-xl border border-sky-200 shadow-sm">
              <h2 className="text-lg font-bold text-sky-900 mb-4 border-b border-sky-200 pb-2">PATIENT MATCHING</h2>
              <form onSubmit={handleSmartMatch} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-sky-700 mb-1">PATIENT BLOOD TYPE</label>
                  <select 
                    value={patientBloodType} 
                    onChange={(e) => setPatientBloodType(e.target.value)} 
                    className="w-full bg-sky-50 border border-sky-300 text-slate-800 p-3 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                  >
                    <option>O-</option><option>O+</option><option>A-</option><option>A+</option>
                    <option>B-</option><option>B+</option><option>AB-</option><option>AB+</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-sky-700 mb-1">UNITS REQUIRED</label>
                  <input 
                    type="number" min="1" 
                    value={units} 
                    onChange={(e) => setUnits(e.target.value)} 
                    className="w-full bg-sky-50 border border-sky-300 text-slate-800 p-3 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none transition-all" 
                  />
                </div>
                <button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 rounded-lg transition-colors shadow-md shadow-sky-200">
                  RUN COMPATIBILITY ENGINE
                </button>
              </form>

              {message.text && (
                <div className={`mt-4 p-4 rounded-lg text-sm font-bold border ${
                  message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 
                  message.type === 'error' ? 'bg-red-50 text-red-700 border-red-200' : 
                  'bg-sky-50 text-sky-700 border-sky-200'
                }`}>
                  {message.text}
                </div>
              )}

              {reservedBags.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-bold text-sky-700 mb-2">RESERVED BAGS (FIFO):</h3>
                  <div className="space-y-2">
                    {reservedBags.map(bag => (
                      <div key={bag} className="bg-sky-50 p-2 rounded-lg border border-sky-200 flex justify-between items-center">
                        <span className="text-xs font-medium text-sky-900">{bag}</span>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold border border-green-200">LOCKED</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Forecast */}
            <div className="bg-sky-100 p-6 rounded-xl border border-sky-200 shadow-sm">
              <h2 className="text-lg font-bold text-sky-900 mb-4 border-b border-sky-200 pb-2">AI DEMAND FORECAST</h2>
              {forecast.length === 0 ? (
                <p className="text-slate-500 text-sm">Insufficient data for neural forecast.</p>
              ) : (
                <div className="space-y-2">
                  {forecast.map((day, index) => (
                    <div key={index} className="flex justify-between text-sm bg-sky-50 p-2 rounded-lg border border-sky-200">
                      <span className="text-sky-700 font-medium">{day.date}</span>
                      <span className="font-bold text-sky-900">{day.predicted_units} units</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Inventory */}
          <div className="lg:col-span-2">
            <div className="bg-sky-100 rounded-xl border border-sky-200 shadow-sm h-full">
              <div className="p-6 border-b border-sky-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-sky-900">LIVE INVENTORY MATRIX</h2>
                <span className="text-xs bg-sky-200 px-3 py-1 rounded-full border border-sky-300 text-sky-800 font-bold">
                  {inventory.length} BAGS AVAILABLE
                </span>
              </div>
              
              {loading ? (
                <div className="p-8 text-center text-sky-600 font-medium">Scanning database...</div>
              ) : (
                <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {inventory.map((item) => (
                    <div key={item.id} className="bg-sky-50 border border-sky-200 rounded-xl p-4 hover:border-sky-400 transition-colors shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-xl font-bold px-2 py-1 rounded-lg ${getBloodColor(item.blood_type)}`}>
                          {item.blood_type}
                        </span>
                        <span className="text-xs text-sky-400 font-bold">#{item.bag_code.slice(-3)}</span>
                      </div>
                      <div className="text-xs text-sky-700 mt-2 font-medium">
                        <p>Exp: <span className="text-sky-900">{item.expiry_date}</span></p>
                        <p className="mt-1">Status: <span className="text-green-600 font-bold">READY</span></p>
                      </div>
                    </div>
                  ))}
                  {inventory.length === 0 && (
                    <div className="col-span-full text-center text-sky-600 py-8 font-medium">
                      No blood bags available in inventory.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App