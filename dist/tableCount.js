import esMain from "es-main";
import sqlite3 from "sqlite3";
import fs from 'fs';
function all(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
}
function getCount(table) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT COUNT(*) AS count FROM "${table}"`, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row.count);
        });
    });
}
async function getTableNames() {
    const tables = await all(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `);
    return tables.map(t => t.name);
}
async function getTableCounts(tables) {
    const result = {};
    for (const table of tables) {
        try {
            const count = await getCount(table);
            result[table] = count;
        }
        catch (err) {
            console.warn(`SKIP ${table}: ${err.message}`);
        }
    }
    return result;
}
let db;
function openDB(path) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(path, (err) => {
            if (err)
                reject(err);
            else
                resolve(db);
        });
    });
}
if (esMain(import.meta)) {
    if (!process.argv[2]) {
        console.error('Usage: node enumCount.js <database>');
        process.exit(1);
    }
    db = await openDB(process.argv[2])
        .catch(err => {
        console.error(err);
        process.exit(1);
    });
    try {
        const tables = await getTableNames();
        const result = await getTableCounts(tables);
        fs.writeFileSync('tableCount.json', JSON.stringify(result, null, 2), 'utf8');
        console.log('\nSaved: tableCount.json');
    }
    catch (err) {
        console.error(err);
        process.exit(1);
    }
    finally {
        db.close();
    }
}
//# sourceMappingURL=tableCount.js.map