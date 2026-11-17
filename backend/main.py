from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_db_connection
import pandas as pd
from sklearn.linear_model import LinearRegression
import datetime

app = FastAPI(title="BloodLink Africa API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 1. DATA MODELS ---
class BloodRequest(BaseModel):
    hospital_id: int
    patient_blood_type: str
    units_needed: int

# --- 2. BLOOD COMPATIBILITY LOGIC ---
# This dictionary maps the Patient's Blood Type to the Donor Types they can safely receive.
COMPATIBILITY_MATRIX = {
    "O-": ["O-"],
    "O+": ["O-", "O+"],
    "A-": ["O-", "A-"],
    "A+": ["O-", "O+", "A-", "A+"],
    "B-": ["O-", "B-"],
    "B+": ["O-", "O+", "B-", "B+"],
    "AB-": ["O-", "A-", "B-", "AB-"],
    "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"] # Universal recipient
}

@app.get("/")
def read_root():
    return {"message": "Welcome to the BloodLink Smart Engine"}

# --- 3. SMART MATCHING ENDPOINT ---
@app.post("/api/smart-request")
def create_smart_request(request: BloodRequest):
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    # Step 1: Find compatible donor blood types
    compatible_types = COMPATIBILITY_MATRIX.get(request.patient_blood_type)
    if not compatible_types:
        raise HTTPException(status_code=400, detail="Invalid blood type")

    cursor = conn.cursor(dictionary=True)
    
    # Step 2: Find available bags of those compatible types, ordered by expiry date (FIFO)
    placeholders = ','.join(['%s'] * len(compatible_types))
    query = f"""
        SELECT * FROM blood_inventory 
        WHERE blood_type IN ({placeholders}) 
        AND status = 'Available' 
        AND expiry_date >= CURDATE()
        ORDER BY expiry_date ASC 
        LIMIT %s
    """
    
    # Add the units_needed to the parameters for the LIMIT clause
    params = compatible_types + [request.units_needed]
    
    cursor.execute(query, params)
    available_bags = cursor.fetchall()
    
    # Step 3: Check if we have enough bags
    if len(available_bags) < request.units_needed:
        cursor.close()
        conn.close()
        raise HTTPException(
            status_code=400, 
            detail=f"Not enough compatible blood. Requested {request.units_needed}, found only {len(available_bags)}."
        )

    # Step 4: Reserve the bags and create the request
    bag_codes = [bag['bag_code'] for bag in available_bags]
    try:
        # Mark bags as Reserved
        for bag in available_bags:
            cursor.execute("UPDATE blood_inventory SET status = 'Reserved' WHERE id = %s", (bag['id'],))
        
        # Log the request in the database
        cursor.execute(
            "INSERT INTO blood_requests (hospital_id, blood_type, units_needed, status) VALUES (%s, %s, %s, 'Fulfilled')",
            (request.hospital_id, request.patient_blood_type, request.units_needed)
        )
        conn.commit()
        
        return {
            "message": "Smart Match Successful",
            "patient_type": request.patient_blood_type,
            "bags_reserved": bag_codes,
            "note": "The oldest compatible bags were selected automatically."
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")
    finally:
        cursor.close()
        conn.close()

# --- 4. INVENTORY ENDPOINT ---
@app.get("/api/inventory")
def get_inventory():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM blood_inventory WHERE status = 'Available'")
    inventory = cursor.fetchall()
    
    cursor.close()
    conn.close()
    
    return {"inventory": inventory}

# --- 5. AI FORECASTING ENDPOINT ---
@app.get("/api/forecast")
def get_forecast():
    conn = get_db_connection()
    if not conn:
        raise HTTPException(status_code=500, detail="Database connection failed")
    
    query = "SELECT created_at as request_date, units_needed as units_requested FROM blood_requests"
    df = pd.read_sql(query, conn)
    conn.close()

    if len(df) < 3:
        return {"forecast": [], "message": "Not enough data to generate a forecast yet."}

    df['request_date'] = pd.to_datetime(df['request_date'])
    df['days_since_start'] = (df['request_date'] - df['request_date'].min()).dt.days

    X = df[['days_since_start']]
    y = df['units_requested']
    model = LinearRegression()
    model.fit(X, y)

    max_day = df['days_since_start'].max()
    future_days = [[max_day + i] for i in range(1, 8)]
    predictions = model.predict(future_days)

    forecast_results = []
    for i, pred in enumerate(predictions):
        future_date = (df['request_date'].min() + datetime.timedelta(days=int(future_days[i][0]))).strftime('%Y-%m-%d')
        safe_prediction = max(0, round(float(pred), 2))
        forecast_results.append({
            "date": future_date,
            "predicted_units": safe_prediction
        })

    return {"forecast": forecast_results}