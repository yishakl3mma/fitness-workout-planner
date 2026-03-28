// ─────────────────────────────────────────────────────────────────────────────
//  SEED SCRIPT
//  Populates the database with the initial exercise library.
//
//  How to run:
//    node src/data/seed.js          ← adds all exercises
//    node src/data/seed.js --clear  ← clears ALL exercises first, then adds them
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const mongoose = require('mongoose');
const Exercise = require('../models/Exercise');
const exercises = require('./exercises');
const connectDB = require('../config/db');

const seedDB = async () => {
  await connectDB();

  // If --clear flag is passed, delete everything first
  if (process.argv.includes('--clear')) {
    await Exercise.deleteMany({});
    console.log('🗑️  Cleared all existing exercises.');
  }

  // Insert all exercises (insertMany is faster than individual saves)
  // ordered: false means it keeps going even if one fails (e.g. duplicate)
  const result = await Exercise.insertMany(exercises, { ordered: false }).catch((err) => {
    // Duplicate key errors are fine — just skip those
    if (err.code === 11000) {
      console.log('⚠️  Some exercises already exist — skipped duplicates.');
      return err.insertedDocs || [];
    }
    throw err;
  });

  const count = Array.isArray(result) ? result.length : result?.insertedCount || 0;
  console.log(`✅ Seeded ${count} exercises successfully!`);
  process.exit(0);
};

seedDB().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
