const { Client } = require('pg');

const DB_PASSWORD = process.argv[2];

if (!DB_PASSWORD) {
    console.error('Please provide your database password as an argument.');
    process.exit(1);
}

const connectionConfig = {
    host: 'aws-0-eu-central-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.klgkwzdedomqcfbkykmb',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
};

const candidates = [
    { name: 'James Mwangi', position: 'President', motto: 'Unity in Progress' },
    { name: 'Amina Hassan', position: 'President', motto: 'Students First, Always' },
    { name: 'Brian Ochieng', position: 'President', motto: 'Innovation for All' },
    
    { name: 'Grace Wanjiku', position: 'Vice President', motto: 'Together We Rise' },
    { name: 'Kevin Mutua', position: 'Vice President', motto: 'Your Voice Matters' },
    
    { name: 'Faith Chebet', position: 'Secretary General', motto: 'Transparency Always' },
    { name: 'Daniel Kiprop', position: 'Secretary General', motto: 'Service with Integrity' },
    
    { name: 'Mercy Akinyi', position: 'Finance Secretary', motto: 'Accountable Leadership' },
    { name: 'Hassan Ali', position: 'Finance Secretary', motto: 'Fiscal Responsibility' },
    
    { name: 'Peter Kamau', position: 'Secretary for Academics', motto: 'Excellence in Education' },
    { name: 'Lydia Njeri', position: 'Secretary for Academics', motto: 'Knowledge is Power' },
    
    { name: 'Samuel Otieno', position: 'Secretary for Clubs and Society', motto: 'Vibrant Campus Life' },
    { name: 'Diana Wambui', position: 'Secretary for Clubs and Society', motto: 'Unite Through Activities' },
    
    { name: 'Martin Kibet', position: 'Secretary for Sports and Entertainment', motto: 'Play Hard, Win Together' },
    { name: 'Rose Muthoni', position: 'Secretary for Sports and Entertainment', motto: 'Champions of Fun' }
];

async function seedDatabase() {
    const client = new Client(connectionConfig);

    try {
        await client.connect();
        console.log('Connected to database. Seeding candidates...');

        for (const c of candidates) {
            // Check if already exists to avoid duplicates if run multiple times
            const res = await client.query('SELECT id FROM public.candidates WHERE name = $1 AND position = $2', [c.name, c.position]);
            if (res.rows.length === 0) {
                await client.query(
                    'INSERT INTO public.candidates (name, position, motto) VALUES ($1, $2, $3)',
                    [c.name, c.position, c.motto]
                );
                console.log(`✅ Added: ${c.name} (${c.position})`);
            } else {
                console.log(`⚠️ Skipped: ${c.name} (Already exists)`);
            }
        }

        console.log('🎉 Seeding complete!');
    } catch (err) {
        console.error('❌ Error seeding database:', err.message);
    } finally {
        await client.end();
    }
}

seedDatabase();
