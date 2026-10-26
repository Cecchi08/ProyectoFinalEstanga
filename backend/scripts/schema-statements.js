// Shared by the tests and scripts/db-recreate.mjs: the schema file and a splitter that understands
// the client-side DELIMITER directive (mysql2 does not), the same way the mysql CLI does.
export const SCHEMA_FILE = new URL('../../database/venti_shema2.sql', import.meta.url);
export function schemaStatements(script) {
    const statements = [];
    let delimiter = ';', buffer = '';
    for (const line of script.split(/\r?\n/)) {
        const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
        if (directive) { delimiter = directive[1]; continue; }
        buffer += `${line}\n`;
        if (buffer.trimEnd().endsWith(delimiter)) {
            const statement = buffer.trimEnd().slice(0, -delimiter.length).trim();
            if (statement) statements.push(statement);
            buffer = '';
        }
    }
    if (buffer.trim()) statements.push(buffer.trim());
    return statements;
}
