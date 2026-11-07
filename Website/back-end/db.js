//Connect to the MySQL database
import {createPool} from 'mysql2/promise';
import "dotenv/config";

export const db = createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectionLimit: 10
});