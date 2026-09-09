const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbPath = process.argv[2];

if (!dbPath) {
    console.error('Usage: node enumCount.js <database>');
    process.exit(1);
}

const db = new sqlite3.Database(dbPath);

function all(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function getCount(table) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) AS count FROM "${table}"`,
            (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            }
        );
    });
}

async function main() {
    const tables = await all(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    `);

    const result = {};

    for (const { name } of tables) {
        try {
            const count = await getCount(name);

            result[name] = count;
            console.log(`${name}: ${count}`);
        } catch (err) {
            console.warn(`SKIP ${name}: ${err.message}`);
        }
    }

    // JSON 저장
    fs.writeFileSync(
        'tableCount.json',
        JSON.stringify(result, null, 2),
        'utf8'
    );

    console.log('\nSaved: tableCount.json');

    db.close();
}

main().catch(err => {
    console.error(err);
    db.close();
    process.exit(1);
});