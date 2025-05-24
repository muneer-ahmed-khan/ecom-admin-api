const express = require("express");
const router = express.Router();
const db = require("../db/db");

/**
 * GET /api/categories
 * Retrieves all categories.
 */
router.get("/", async (_req, res, next) => {
  try {
    const result = await db.query(
      "SELECT id, name, created_at FROM categories ORDER BY name;"
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/categories
 * Creates a new category.
 * Body: { name: 'Some Category' }
 */
router.post("/", async (req, res, next) => {
  const { name } = req.body;
  if (!name || typeof name !== "string") {
    return res
      .status(400)
      .json({ error: "Category name is required and must be a string." });
  }
  try {
    const insert = await db.query(
      "INSERT INTO categories(name) VALUES($1) RETURNING id, name, created_at;",
      [name.trim()]
    );
    res.status(201).json(insert.rows[0]);
  } catch (err) {
    // if unique violation
    if (err.code === "23505") {
      return res.status(409).json({ error: "Category name already exists." });
    }
    next(err);
  }
});

/**
 * PUT /api/categories/:id
 * Updates a category name
 * Body: { name: 'New Name' }
 */
router.put("/:id", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (isNaN(id)) return res.status(400).json({ error: "Invalid category ID." });
  if (!name || typeof name !== "string") {
    return res
      .status(400)
      .json({ error: "Category name is required and must be a string." });
  }
  try {
    const upd = await db.query(
      "UPDATE categories SET name = $1 WHERE id = $2 RETURNING id, name, created_at;",
      [name.trim(), id]
    );
    if (upd.rows.length === 0)
      return res.status(404).json({ error: "Category not found." });
    res.json(upd.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Category name already exists." });
    }
    next(err);
  }
});

/**
 * DELETE /api/categories/:id
 * Deletes a category IF no products reference it.
 */
router.delete("/:id", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid category ID." });
  try {
    // Check if any product references this category
    const chk = await db.query(
      "SELECT COUNT(*) FROM products WHERE category_id = $1;",
      [id]
    );
    if (parseInt(chk.rows[0].count, 10) > 0) {
      return res
        .status(409)
        .json({
          error: "Cannot delete: one or more products belong to this category.",
        });
    }
    const del = await db.query(
      "DELETE FROM categories WHERE id = $1 RETURNING id, name;",
      [id]
    );
    if (del.rows.length === 0)
      return res.status(404).json({ error: "Category not found." });
    res.json({ message: `Deleted category ${del.rows[0].name}.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
