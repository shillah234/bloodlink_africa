import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 4000)),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "test"),
            ssl_disabled=False,       # REQUIRED for TiDB
            connection_timeout=15     # Prevents hanging
        )
        return connection
    except Exception as e:
        print(f"CRITICAL DB ERROR: {e}")  # This will show in Render logs!
        return None