#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
    const args = {
        projectRoot: "",
        envFile: ".env",
        schema: "public",
        maxTables: 3,
        dryRun: false,
        cleanupOrphans: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (value === "--project-root") args.projectRoot = argv[++index] || "";
        else if (value === "--env-file") args.envFile = argv[++index] || "";
        else if (value === "--schema") args.schema = argv[++index] || "";
        else if (value === "--max-tables") args.maxTables = Number(argv[++index]);
        else if (value === "--dry-run") args.dryRun = true;
        else if (value === "--cleanup-orphans") args.cleanupOrphans = true;
        else throw new Error(`Unknown argument: ${value}`);
    }
    if (!args.projectRoot) throw new Error("--project-root is required");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.schema)) {
        throw new Error("--schema must be a simple PostgreSQL identifier");
    }
    if (!Number.isInteger(args.maxTables) || args.maxTables < 0 || args.maxTables > 20) {
        throw new Error("--max-tables must be an integer between 0 and 20");
    }
    return args;
}

function loadProjectEnvironment(projectRoot, envFile) {
    const dotenvPath = require.resolve("dotenv", { paths: [projectRoot] });
    const dotenv = require(dotenvPath);
    const absoluteEnv = path.resolve(projectRoot, envFile);
    if (!fs.existsSync(absoluteEnv)) throw new Error(`Environment file not found: ${envFile}`);
    const parsed = dotenv.parse(fs.readFileSync(absoluteEnv));
    return parsed;
}

function safeIdentifier(value) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error("Unsafe SQL identifier");
    return `"${value}"`;
}

function buildCandidateUrl(adminUrl, loginRole, password) {
    const candidate = new URL(adminUrl);
    candidate.username = loginRole;
    candidate.password = password;
    candidate.searchParams.set("application_name", "qa-skill-readonly-smoke");
    return candidate.toString();
}

function assessProof(row, tablePrivileges, dangerousRoutineCount) {
    const dangerousRoleFlags = [
        "rolsuper",
        "rolcreaterole",
        "rolcreatedb",
        "rolreplication",
        "rolbypassrls",
    ];
    const roleSafe = dangerousRoleFlags.every((field) => row[field] === false);
    const tableSafe = tablePrivileges.every(
        (item) =>
            !item.can_insert &&
            !item.can_update &&
            !item.can_delete &&
            !item.can_truncate &&
            !item.can_references &&
            !item.can_trigger
    );
    return {
        role_flags_safe: roleSafe,
        no_schema_create: row.can_create_schema === false,
        no_database_create: row.can_create_database === false,
        default_transaction_read_only: row.default_transaction_read_only === "on",
        table_write_privileges_absent: tableSafe,
        public_security_definer_routines_absent: Number(dangerousRoutineCount) === 0,
    };
}

async function cleanupRole(admin, role, schema, database) {
    const roleIdentifier = safeIdentifier(role);
    const schemaIdentifier = safeIdentifier(schema);
    const databaseIdentifier = safeIdentifier(database);
    const errorCodes = [];
    const operations = [
        ["terminate_sessions", () =>
            admin.query(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity " +
                    "WHERE usename = $1 AND pid <> pg_backend_pid()",
                [role]
            )],
        ["revoke_tables", () =>
            admin.query(
                `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA ` +
                    `${schemaIdentifier} FROM ${roleIdentifier}`
            )],
        ["revoke_sequences", () =>
            admin.query(
                `REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ` +
                    `${schemaIdentifier} FROM ${roleIdentifier}`
            )],
        ["revoke_functions", () =>
            admin.query(
                `REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA ` +
                    `${schemaIdentifier} FROM ${roleIdentifier}`
            )],
        ["revoke_schema", () =>
            admin.query(
                `REVOKE ALL PRIVILEGES ON SCHEMA ${schemaIdentifier} FROM ${roleIdentifier}`
            )],
        ["revoke_database", () =>
            admin.query(
                `REVOKE ALL PRIVILEGES ON DATABASE ${databaseIdentifier} FROM ${roleIdentifier}`
            )],
        ["drop_owned", () => admin.query(`DROP OWNED BY ${roleIdentifier}`)],
        ["drop_role", () => admin.query(`DROP ROLE IF EXISTS ${roleIdentifier}`)],
    ];
    for (const [name, operation] of operations) {
        try {
            await operation();
        } catch (error) {
            errorCodes.push(`${name}:${error && error.code ? error.code : "runtime_error"}`);
        }
    }
    const remaining = await admin.query(
        "SELECT count(*)::int AS count FROM pg_roles WHERE rolname = $1",
        [role]
    );
    return {
        removed: remaining.rows[0].count === 0,
        error_codes: errorCodes,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.resolve(args.projectRoot);
    const environment = loadProjectEnvironment(projectRoot, args.envFile);
    const adminUrl = environment.DATABASE_URL;
    if (!adminUrl) {
        console.log(JSON.stringify({ status: "BLOCKED", reason: "DATABASE_URL missing" }));
        return 2;
    }
    const parsedAdminUrl = new URL(adminUrl);
    const adminRole = decodeURIComponent(parsedAdminUrl.username || "");
    const poolerSuffix = adminRole.includes(".")
        ? adminRole.slice(adminRole.indexOf("."))
        : "";
    const staticResult = {
        status: "READY_FOR_APPROVAL",
        engine: "postgresql",
        database: parsedAdminUrl.pathname.replace(/^\//, "") || "missing",
        schema: args.schema,
        admin_role_detected: /^postgres(?:\.|$)/.test(adminRole),
        candidate_role_strategy: "ephemeral_direct_select_only",
        write_action: "create and drop one ephemeral database role",
    };
    if (args.dryRun) {
        console.log(JSON.stringify(staticResult, null, 2));
        return 0;
    }

    const pgPath = require.resolve("pg", { paths: [projectRoot] });
    const { Client } = require(pgPath);
    const database = parsedAdminUrl.pathname.replace(/^\//, "") || "postgres";
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
        throw new Error("Database name must be a simple PostgreSQL identifier");
    }
    if (args.cleanupOrphans) {
        const cleanupAdmin = new Client({
            connectionString: adminUrl,
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
            query_timeout: 10000,
            statement_timeout: 10000,
            application_name: "qa-skill-readonly-cleanup",
        });
        await cleanupAdmin.connect();
        const candidates = await cleanupAdmin.query(
            "SELECT rolname FROM pg_roles WHERE rolname LIKE 'qa\\_readonly\\_%' ESCAPE '\\' " +
                "ORDER BY rolname"
        );
        const cleanupResults = [];
        for (const item of candidates.rows) {
            cleanupResults.push(
                await cleanupRole(cleanupAdmin, item.rolname, args.schema, database)
            );
        }
        const remaining = await cleanupAdmin.query(
            "SELECT count(*)::int AS count FROM pg_roles " +
                "WHERE rolname LIKE 'qa\\_readonly\\_%' ESCAPE '\\'"
        );
        await cleanupAdmin.end();
        const cleanupPassed =
            remaining.rows[0].count === 0 && cleanupResults.every((item) => item.removed);
        console.log(
            JSON.stringify(
                {
                    status: cleanupPassed ? "PASS" : "FAILED",
                    orphan_candidates: candidates.rows.length,
                    removed: cleanupResults.filter((item) => item.removed).length,
                    remaining: remaining.rows[0].count,
                    error_codes: cleanupResults.flatMap((item) => item.error_codes),
                },
                null,
                2
            )
        );
        return cleanupPassed ? 0 : 2;
    }
    const suffix = crypto.randomBytes(6).toString("hex");
    const role = `qa_readonly_${suffix}`;
    const password = crypto.randomBytes(24).toString("base64url");
    const roleIdentifier = safeIdentifier(role);
    const schemaIdentifier = safeIdentifier(args.schema);
    const admin = new Client({
        connectionString: adminUrl,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
        query_timeout: 10000,
        statement_timeout: 10000,
        application_name: "qa-skill-readonly-provisioner",
    });
    let readonly;
    let created = false;
    let cleanupVerified = false;
    let cleanupErrorCodes = [];
    const result = {
        status: "FAILED",
        engine: "postgresql",
        schema: args.schema,
        role_lifecycle: "ephemeral",
        proof: {},
        smoke: {},
        cleanup_verified: false,
    };

    try {
        await admin.connect();
        const escapedPassword = password.replace(/'/g, "''");
        await admin.query(
            `CREATE ROLE ${roleIdentifier} LOGIN PASSWORD '${escapedPassword}' ` +
                "NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS"
        );
        created = true;
        await admin.query(`ALTER ROLE ${roleIdentifier} SET default_transaction_read_only = on`);
        await admin.query(`ALTER ROLE ${roleIdentifier} SET statement_timeout = '5000ms'`);
        await admin.query(`GRANT CONNECT ON DATABASE postgres TO ${roleIdentifier}`);
        await admin.query(`GRANT USAGE ON SCHEMA ${schemaIdentifier} TO ${roleIdentifier}`);
        await admin.query(`GRANT SELECT ON ALL TABLES IN SCHEMA ${schemaIdentifier} TO ${roleIdentifier}`);

        readonly = new Client({
            connectionString: buildCandidateUrl(adminUrl, `${role}${poolerSuffix}`, password),
            ssl: { rejectUnauthorized: false },
            connectionTimeoutMillis: 10000,
            query_timeout: 5000,
            statement_timeout: 5000,
            application_name: "qa-skill-readonly-verifier",
        });
        await readonly.connect();
        const roleResult = await readonly.query(
            `
            SELECT
                r.rolsuper,
                r.rolcreaterole,
                r.rolcreatedb,
                r.rolreplication,
                r.rolbypassrls,
                has_schema_privilege(current_user, $1, 'CREATE') AS can_create_schema,
                has_database_privilege(current_user, current_database(), 'CREATE') AS can_create_database,
                current_setting('default_transaction_read_only') AS default_transaction_read_only
            FROM pg_roles r
            WHERE r.rolname = current_user
            `,
            [args.schema]
        );
        const privilegeResult = await readonly.query(
            `
            SELECT
                table_name,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'INSERT'
                ) AS can_insert,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'UPDATE'
                ) AS can_update,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'DELETE'
                ) AS can_delete,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'TRUNCATE'
                ) AS can_truncate,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'REFERENCES'
                ) AS can_references,
                has_table_privilege(
                    current_user,
                    format('%I.%I', table_schema, table_name),
                    'TRIGGER'
                ) AS can_trigger
            FROM information_schema.tables
            WHERE table_schema = $1 AND table_type = 'BASE TABLE'
            ORDER BY table_name
            `,
            [args.schema]
        );
        const routineResult = await readonly.query(
            `
            SELECT count(*)::int AS count
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = $1
              AND p.prosecdef
              AND has_function_privilege(current_user, p.oid, 'EXECUTE')
            `,
            [args.schema]
        );
        const proof = assessProof(
            roleResult.rows[0],
            privilegeResult.rows,
            routineResult.rows[0].count
        );
        result.proof = proof;
        if (!Object.values(proof).every(Boolean)) {
            result.status = "BLOCKED";
            result.reason = "candidate role did not satisfy every read-only proof";
            return 2;
        }

        const tablesResult = await readonly.query(
            `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = $1 AND table_type = 'BASE TABLE'
            ORDER BY table_name
            LIMIT $2
            `,
            [args.schema, args.maxTables]
        );
        const aggregateChecks = [];
        for (const item of tablesResult.rows) {
            const tableIdentifier = safeIdentifier(item.table_name);
            const countResult = await readonly.query(
                `SELECT count(*)::bigint AS row_count FROM ${schemaIdentifier}.${tableIdentifier}`
            );
            aggregateChecks.push({
                table: item.table_name,
                row_count_observed: Number(countResult.rows[0].row_count),
            });
        }
        result.smoke = {
            select_one: (await readonly.query("SELECT 1 AS ok")).rows[0].ok === 1,
            aggregate_checks: aggregateChecks,
            verdict_scope: "connectivity_metadata_and_aggregate_only",
        };
        result.status = "PASS";
        return 0;
    } catch (error) {
        result.status = "BLOCKED";
        result.reason = error && error.code ? `postgres_error:${error.code}` : "runtime_error";
        return 2;
    } finally {
        if (readonly) await readonly.end().catch(() => {});
        if (created) {
            const cleanup = await cleanupRole(admin, role, args.schema, database).catch((error) => ({
                removed: false,
                error_codes: [error && error.code ? error.code : "runtime_error"],
            }));
            cleanupVerified = cleanup.removed;
            cleanupErrorCodes = cleanup.error_codes;
        }
        await admin.end().catch(() => {});
        result.cleanup_verified = cleanupVerified;
        if (created && !cleanupVerified) {
            result.status = "FAILED";
            result.reason = "cleanup_failed";
            result.cleanup_error_codes = cleanupErrorCodes;
        }
        console.log(JSON.stringify(result, null, 2));
        if (created && !cleanupVerified) return 2;
    }
}

main()
    .then((code) => {
        process.exitCode = code;
    })
    .catch((error) => {
        console.error(JSON.stringify({ status: "BLOCKED", reason: error.message }));
        process.exitCode = 2;
    });
