const { validationResult } = require('express-validator');
const Exercise = require('../models/Exercise');

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/exercises
//  Returns a list of exercises with optional filtering and search.
//
//  Query parameters (all optional):
//    ?muscleGroup=chest
//    ?difficulty=beginner
//    ?equipment=dumbbells
//    ?category=strength
//    ?search=push          ← searches name and description
//    ?page=1               ← which page (default: 1)
//    ?limit=10             ← results per page (default: 10, max: 50)
//    ?sort=name            ← sort by: name, difficulty, muscleGroup (default: name)
// ─────────────────────────────────────────────────────────────────────────────
const getAllExercises = async (req, res) => {
  try {
    const {
      muscleGroup,
      difficulty,
      equipment,
      category,
      search,
      page = 1,
      limit = 10,
      sort = 'name',
    } = req.query;

    // ── Build the MongoDB filter object ──────────────────────────────────────
    const filter = { isActive: true }; // always only show active exercises

    // Add filters only if they were actually sent
    if (muscleGroup) filter.muscleGroup = muscleGroup;
    if (difficulty)  filter.difficulty  = difficulty;
    if (equipment)   filter.equipment   = equipment;
    if (category)    filter.category    = category;

    // Text search: if user sends ?search=push, search name + description
    if (search && search.trim()) {
      filter.$or = [
        { name:        { $regex: search.trim(), $options: 'i' } }, // case-insensitive
        { description: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // ── Pagination ───────────────────────────────────────────────────────────
    const pageNum  = Math.max(1, parseInt(page));           // minimum page 1
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // between 1–50
    const skip     = (pageNum - 1) * limitNum;             // how many docs to skip

    // ── Sort ─────────────────────────────────────────────────────────────────
    const validSorts = ['name', 'difficulty', 'muscleGroup', 'createdAt'];
    const sortField  = validSorts.includes(sort) ? sort : 'name';
    const sortObj    = { [sortField]: 1 }; // 1 = ascending

    // ── Run queries in parallel for speed ────────────────────────────────────
    const [exercises, total] = await Promise.all([
      Exercise.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .select('-__v'), // hide the internal __v field

      Exercise.countDocuments(filter), // total matching docs (for pagination info)
    ]);

    res.status(200).json({
      success: true,
      total,                          // total matching exercises
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      count: exercises.length,        // exercises returned on this page
      exercises,
    });
  } catch (error) {
    console.error('GetAllExercises error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/exercises/:id
//  Returns a single exercise by its MongoDB ID
// ─────────────────────────────────────────────────────────────────────────────
const getExerciseById = async (req, res) => {
  try {
    const exercise = await Exercise.findById(req.params.id).select('-__v');

    if (!exercise || !exercise.isActive) {
      return res.status(404).json({ success: false, message: 'Exercise not found.' });
    }

    res.status(200).json({ success: true, exercise });
  } catch (error) {
    // Invalid MongoDB ID format
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid exercise ID format.' });
    }
    console.error('GetExerciseById error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/exercises/filter-options
//  Returns all valid values for each filter so the frontend can build dropdowns
// ─────────────────────────────────────────────────────────────────────────────
const getFilterOptions = async (req, res) => {
  try {
    // Get distinct values that actually exist in the DB
    const [muscleGroups, difficulties, equipmentList, categories] = await Promise.all([
      Exercise.distinct('muscleGroup', { isActive: true }),
      Exercise.distinct('difficulty',  { isActive: true }),
      Exercise.distinct('equipment',   { isActive: true }),
      Exercise.distinct('category',    { isActive: true }),
    ]);

    res.status(200).json({
      success: true,
      filterOptions: {
        muscleGroups: muscleGroups.sort(),
        difficulties: ['beginner', 'intermediate', 'advanced'], // always in this order
        equipment:    equipmentList.sort(),
        categories:   categories.sort(),
      },
    });
  } catch (error) {
    console.error('GetFilterOptions error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/exercises/by-muscle-group
//  Returns exercises GROUPED by muscle group — useful for workout planning UI
//  Example response: { chest: [...], back: [...], legs: [...] }
// ─────────────────────────────────────────────────────────────────────────────
const getExercisesByMuscleGroup = async (req, res) => {
  try {
    const exercises = await Exercise.find({ isActive: true })
      .sort({ muscleGroup: 1, name: 1 })
      .select('name muscleGroup difficulty equipment defaultSets defaultReps description');

    // Group exercises by muscle group using JavaScript
    const grouped = exercises.reduce((acc, exercise) => {
      const group = exercise.muscleGroup;
      if (!acc[group]) acc[group] = [];
      acc[group].push(exercise);
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      totalExercises: exercises.length,
      grouped,
    });
  } catch (error) {
    console.error('GetExercisesByMuscleGroup error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/exercises
//  Creates a new exercise (admin/authenticated users only)
//  Body: { name, description, muscleGroup, difficulty, equipment, ... }
// ─────────────────────────────────────────────────────────────────────────────
const createExercise = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
      });
    }

    // Attach the user who created it (from the auth middleware)
    const exerciseData = { ...req.body, createdBy: req.user._id };
    const exercise = await Exercise.create(exerciseData);

    res.status(201).json({
      success: true,
      message: 'Exercise created successfully!',
      exercise,
    });
  } catch (error) {
    // Duplicate name error
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'An exercise with this name already exists.' });
    }
    console.error('CreateExercise error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  PUT /api/exercises/:id
//  Updates an existing exercise (authenticated users only)
// ─────────────────────────────────────────────────────────────────────────────
const updateExercise = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
      });
    }

    const exercise = await Exercise.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!exercise) {
      return res.status(404).json({ success: false, message: 'Exercise not found.' });
    }

    res.status(200).json({ success: true, message: 'Exercise updated!', exercise });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid exercise ID.' });
    }
    console.error('UpdateExercise error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/exercises/:id
//  Soft-deletes an exercise (sets isActive: false instead of actually deleting)
//  This way workout history referencing this exercise is not broken
// ─────────────────────────────────────────────────────────────────────────────
const deleteExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!exercise) {
      return res.status(404).json({ success: false, message: 'Exercise not found.' });
    }

    res.status(200).json({ success: true, message: 'Exercise removed from library.' });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid exercise ID.' });
    }
    console.error('DeleteExercise error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/exercises/stats
//  Returns library statistics (how many per group, difficulty, etc.)
// ─────────────────────────────────────────────────────────────────────────────
const getLibraryStats = async (req, res) => {
  try {
    const [byMuscle, byDifficulty, byEquipment, total] = await Promise.all([
      Exercise.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$muscleGroup', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Exercise.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),
      Exercise.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$equipment', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Exercise.countDocuments({ isActive: true }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        total,
        byMuscleGroup: byMuscle,
        byDifficulty:  byDifficulty,
        byEquipment:   byEquipment,
      },
    });
  } catch (error) {
    console.error('GetLibraryStats error:', error);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getAllExercises,
  getExerciseById,
  getFilterOptions,
  getExercisesByMuscleGroup,
  createExercise,
  updateExercise,
  deleteExercise,
  getLibraryStats,
};
