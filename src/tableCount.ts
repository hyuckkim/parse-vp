import esMain from "es-main";
import sqlite3 from "sqlite3";
import fs from 'fs';

function all(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        db.all(sql, (err: Error, rows: any[]) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getCount(table: string): Promise<number> {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) AS count FROM "${table}"`,
            (err: Error, row: { count: number }) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });
}
async function getTableNames(): Promise<string[]> {
    const tables = await all(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `);
    
    return tables.map(t => t.name);
}

async function getTableCounts(tables: string[]): Promise<{ [key: string]: number }> {
    const result: { [key: string]: number } = {};
    for (const table of tables) {
        try {
            const count = await getCount(table);
            result[table] = count;
        } catch (err: any) {
            console.warn(`SKIP ${table}: ${err.message}`);
        }
    }
    return result;
}

let db: sqlite3.Database;
function openDB(path: string): Promise<sqlite3.Database> {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(path, (err: Error | null) => {
            if (err) reject(err);
            else resolve(db);
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

        fs.writeFileSync(
            'tableCount.json',
            JSON.stringify(result, null, 2),
            'utf8'
        );

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