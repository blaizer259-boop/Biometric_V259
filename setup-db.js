// setup-db.js
// Connects directly to Supabase PostgreSQL and creates all tables for the MMU E-Voting System
// Usage: node setup-db.js YOUR_DB_PASSWORD

const { Client } = require('pg');

const DB_PASSWORD = process.argv[2];

if (!DB_PASSWORD) {
    console.error('\n❌ ERROR: Please provide your database password as an argument.');
    console.error('Usage: node setup-db.js YOUR_DB_PASSWORD\n');
    process.exit(1);
}

// Use individual params to avoid URL-encoding issues with special chars in password
const connectionConfig = {
    host: 'aws-0-eu-central-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.klgkwzdedomqcfbkykmb',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
};

async function setupDatabase() {
    const client = new Client(connectionConfig);

    console.log('\n🔗 Connecting to Supabase PostgreSQL...');
    try {
        await client.connect();
        console.log('✅ Connected successfully!\n');
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        console.error('\nPlease check your database password and try again.');
        process.exit(1);
    }

    const queries = [
        {
            name: 'Create voters table',
            sql: `
            CREATE TABLE IF NOT EXISTS public.voters (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                name TEXT NOT NULL,
                reg_number TEXT UNIQUE NOT NULL,
                email TEXT,
                phone TEXT,
                face_hash TEXT,
                has_voted BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
            );`
        },
        {
            name: 'Create candidates table',
            sql: `
            CREATE TABLE IF NOT EXISTS public.candidates (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                name TEXT NOT NULL,
                position TEXT NOT NULL,
                motto TEXT,
                image_url TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
            );`
        },
        {
            name: 'Create votes table',
            sql: `
            CREATE TABLE IF NOT EXISTS public.votes (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                voter_id UUID REFERENCES public.voters(id) ON DELETE CASCADE NOT NULL,
                candidate_id UUID REFERENCES public.candidates(id) ON DELETE CASCADE NOT NULL,
                position TEXT NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
                UNIQUE(voter_id, position)
            );`
        },
        {
            name: 'Enable Realtime on voters',
            sql: `ALTER PUBLICATION supabase_realtime ADD TABLE public.voters;`
        },
        {
            name: 'Enable Realtime on candidates',
            sql: `ALTER PUBLICATION supabase_realtime ADD TABLE public.candidates;`
        },
        {
            name: 'Enable Realtime on votes',
            sql: `ALTER PUBLICATION supabase_realtime ADD TABLE public.votes;`
        },
        {
            name: 'Disable RLS on voters',
            sql: `ALTER TABLE public.voters DISABLE ROW LEVEL SECURITY;`
        },
        {
            name: 'Disable RLS on candidates',
            sql: `ALTER TABLE public.candidates DISABLE ROW LEVEL SECURITY;`
        },
        {
            name: 'Disable RLS on votes',
            sql: `ALTER TABLE public.votes DISABLE ROW LEVEL SECURITY;`
        }
    ];

    let successCount = 0;
    for (const query of queries) {
        try {
            await client.query(query.sql);
            console.log(`  ✅ ${query.name}`);
            successCount++;
        } catch (err) {
            // Ignore "already exists" type errors for realtime
            if (err.message.includes('already exists') || err.message.includes('already member')) {
                console.log(`  ⚠️  ${query.name} (already done, skipped)`);
                successCount++;
            } else {
                console.error(`  ❌ ${query.name}: ${err.message}`);
            }
        }
    }

    await client.end();

    console.log(`\n${successCount === queries.length ? '🎉' : '⚠️ '} Done! ${successCount}/${queries.length} tasks completed.`);
    if (successCount >= 6) {
        console.log('\n✅ Your MMU E-Voting database is ready!');
        console.log('   You can now open Biometric.html and register voters.');
    }
}

setupDatabase();
