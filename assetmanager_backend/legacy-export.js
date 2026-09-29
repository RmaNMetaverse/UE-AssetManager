'use strict';
// Run this once in the OLD backend environment while its Prisma/PostgreSQL
// dependencies and DATABASE_URL are still available.
const fs = require('node:fs');
try { require('dotenv').config(); } catch (_) { /* DATABASE_URL may already be set */ }
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const output = process.argv[2];
  if (!output) throw new Error('Usage: node legacy-export.js <output.json>');
  const [assets, users, favorites] = await Promise.all([
    prisma.asset.findMany({ orderBy: { id: 'asc' } }),
    prisma.user.findMany({ orderBy: { id: 'asc' } }),
    prisma.favorite.findMany({ orderBy: { id: 'asc' } })
  ]);
  fs.writeFileSync(output, JSON.stringify({ format: 1, assets, users, favorites }));
  console.log(`Exported ${assets.length} assets, ${users.length} users, ${favorites.length} favorites to ${output}`);
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
