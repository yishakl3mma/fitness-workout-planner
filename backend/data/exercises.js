const express = require('express');
const { body, query } = require('express-validator');
const {
  getAllExercises,
  getExerciseById,
  getFilterOptions,
  getExercisesByMuscleGroup,
  createExercise,
  updateExercise,
  deleteExercise,
  getLibraryStats,
} = require('../controllers/exerciseController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─── Valid values (used in validation rules below) ────────────────────────────
const VALID_MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'legs', 'glutes', 'abs', 'cardio', 'full_body'];
const VALID_DIFFICULTIES  = ['beginner', 'intermediate', 'advanced'];
const VALID_EQUIPMENT     = ['none', 'dumbbells', 'barbell', 'machine', 'resistance_band', 'kettlebell', 'pull_up_bar', 'bench', 'cable'];
const VALID_CATEGORIES    = ['strength', 'cardio', 'flexibility', 'balance'];

// ─── Validation for creating/updating exercises ───────────────────────────────
const exerciseValidation = [
  body('name')
    .trim()
    .notEmpty().withMessage('Exercise name is required')
    .isLength({ max: 100 }).withMessage('Name cannot exceed 100 characters'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required'),

  body('muscleGroup')
    .notEmpty().withMessage('Muscle group is required')
    .isIn(VALID_MUSCLE_GROUPS).withMessage(`Muscle group must be one of: ${VALID_MUSCLE_GROUPS.join(', ')}`),

  body('difficulty')
    .notEmpty().withMessage('Difficulty is required')
    .isIn(VALID_DIFFICULTIES).withMessage('Difficulty must be: beginner, intermediate, or advanced'),

  body('equipment')
    .notEmpty().withMessage('Equipment is required')
    .isIn(VALID_EQUIPMENT).withMessage(`Equipment must be one of: ${VALID_EQUIPMENT.join(', ')}`),

  body('category')
    .optional()
    .isIn(VALID_CATEGORIES).withMessage(`Category must be one of: ${VALID_CATEGORIES.join(', ')}`),

  body('defaultSets').optional().isInt({ min: 1, max: 10 }).withMessage('Sets must be 1–10'),
  body('defaultReps').optional().isInt({ min: 1, max: 100 }).withMessage('Reps must be 1–100'),
];

const updateExerciseValidation = exerciseValidation.map((v) =>
  // For updates, all fields are optional (just validate if present)
  v.optional ? v : v
);


// ─── Routes ───────────────────────────────────────────────────────────────────

// ── Public routes (no login needed) ──────────────────────────────────────────
// NOTE: Specific paths like /filter-options must come BEFORE /:id
// otherwise Express will think "filter-options" is the :id value

router.get('/filter-options',    getFilterOptions);         // GET all dropdown options
router.get('/by-muscle-group',   getExercisesByMuscleGroup); // GET grouped by muscle
router.get('/stats',             getLibraryStats);           // GET library statistics
router.get('/',                  getAllExercises);            // GET all with filters
router.get('/:id',               getExerciseById);           // GET one by ID

// ── Protected routes (must be logged in) ─────────────────────────────────────
router.post('/',     protect, exerciseValidation, createExercise);  // CREATE
router.put('/:id',   protect, updateExercise);                      // UPDATE
router.delete('/:id', protect, deleteExercise);                     // DELETE (soft)

module.exports = router;
