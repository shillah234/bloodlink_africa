import os
import pymysql
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    try:
        connection = pymysql.connect(
            host=os.getenv("DB_HOST"),
            port=int(os.getenv("DB_PORT", 4000)),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            database=os.getenv("DB_NAME", "test"),
            ssl={"ssl": {}}, # This forces SSL without needing a certificate file
            connect_timeout=15
        )
        return connection
    except Exception as e:
        print(f"CRITICAL DB ERROR: {e}")
        return None