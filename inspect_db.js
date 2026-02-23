const fs = require('fs');
const initSqlJs = require('sql.js');
const path = require('path');

const DB_PATH = path.join(__dirname, 'eft_tracker.db');

async function inspect() {
    const SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const fileBuffer = fs.readFileSync(DB_PATH);
        const db = new SQL.Database(fileBuffer);
        const stmt = db.prepare("PRAGMA table_info(profiles)");
        while (stmt.step()) {
            console.log(stmt.getAsObject());
        }
        stmt.free();
    } else {
        console.log("Database not found");
    }
}

inspect();
