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
            ssl_verify_cert=True,
            ssl_verify_identity=True
        )
        return connection
    except Exception as e:
        print(f"Error connecting to TiDB: {e}")
        return None