const express = require("express");
const router = express.Router();
const db = require("../db/db");

/**
 * GET /api/products
 * Optional query param: ?category_id=
 * Returns all products; if category_id provided, filters by that category.
 * Also joins to category name and current inventory quantity.
 */
router.get("/", async (req, res, next) => {
  const { category_id } = req.query;
  try {
    let queryText = `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.category_id,
        c.name AS category_name,
        COALESCE(i.quantity, 0) AS quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
    `;
    const params = [];
    if (category_id) {
      params.push(category_id);
      queryText += ` WHERE p.category_id = $1`;
    }
    queryText += " ORDER BY p.name;";
    const result = await db.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/products/:id
 * Returns details of one product, including category name and inventory quantity.
 */
router.get("/:id", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID." });
  try {
    const result = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.category_id,
        c.name AS category_name,
        COALESCE(i.quantity, 0) AS quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = $1;
      `,
      [id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found." });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/products
 * Create a new product. Body must include:
 *  { name, description, price, category_id, initial_quantity }
 */
router.post("/", async (req, res, next) => {
  let { name, description, price, category_id, initial_quantity } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Product name is required." });
  }
  if (price == null || isNaN(parseFloat(price)) || parseFloat(price) < 0) {
    return res
      .status(400)
      .json({ error: "Price must be a non-negative number." });
  }
  if (!category_id || isNaN(parseInt(category_id, 10))) {
    return res
      .status(400)
      .json({ error: "category_id is required and must be a valid integer." });
  }
  if (
    initial_quantity == null ||
    isNaN(parseInt(initial_quantity, 10)) ||
    parseInt(initial_quantity, 10) < 0
  ) {
    return res.status(400).json({
      error: "initial_quantity is required and must be a non-negative integer.",
    });
  }

  name = name.trim();
  description = description ? description.trim() : "";
  price = parseFloat(price);
  category_id = parseInt(category_id, 10);
  initial_quantity = parseInt(initial_quantity, 10);

  try {
    // 1. Insert into products
    const prodRes = await db.query(
      `INSERT INTO products(name, description, price, category_id)
       VALUES($1, $2, $3, $4) RETURNING id, name, description, price, category_id;`,
      [name, description, price, category_id]
    );
    const newProd = prodRes.rows[0];

    // 2. Insert into inventory
    await db.query(
      `INSERT INTO inventory(product_id, quantity, updated_at)
       VALUES($1, $2, NOW());`,
      [newProd.id, initial_quantity]
    );

    // 3. Insert initial row into inventory_history
    await db.query(
      `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
       VALUES($1, $2, $3, $4);`,
      [newProd.id, initial_quantity, 0, initial_quantity]
    );

    // 4. Return the newly created product with inventory
    const fullRes = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.category_id,
        c.name AS category_name,
        i.quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = $1;
      `,
      [newProd.id]
    );
    res.status(201).json(fullRes.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/products/:id
 * Update an existing product’s fields (name, description, price, category_id).
 * Body can include any subset of these keys.
 */
router.put("/:id", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID." });

  // Only allow updates for name, description, price, category_id
  const { name, description, price, category_id } = req.body;
  const fields = [];
  const values = [];
  let idx = 1;

  if (name != null) {
    if (typeof name !== "string") {
      return res.status(400).json({ error: "Name must be a string." });
    }
    fields.push(`name = $${idx++}`);
    values.push(name.trim());
  }
  if (description != null) {
    if (typeof description !== "string") {
      return res.status(400).json({ error: "Description must be a string." });
    }
    fields.push(`description = $${idx++}`);
    values.push(description.trim());
  }
  if (price != null) {
    if (isNaN(parseFloat(price)) || parseFloat(price) < 0) {
      return res
        .status(400)
        .json({ error: "Price must be a non-negative number." });
    }
    fields.push(`price = $${idx++}`);
    values.push(parseFloat(price));
  }
  if (category_id != null) {
    if (isNaN(parseInt(category_id, 10))) {
      return res.status(400).json({ error: "category_id must be an integer." });
    }
    fields.push(`category_id = $${idx++}`);
    values.push(parseInt(category_id, 10));
  }

  if (fields.length === 0) {
    return res
      .status(400)
      .json({ error: "No valid fields provided for update." });
  }

  try {
    const queryText = `
      UPDATE products
      SET ${fields.join(", ")}, updated_at = NOW()
      WHERE id = $${idx}
      RETURNING id, name, description, price, category_id;
    `;
    values.push(id);
    const result = await db.query(queryText, values);
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Product not found." });

    // Return updated product with category name and inventory
    const fullRes = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.description,
        p.price,
        p.category_id,
        c.name AS category_name,
        COALESCE(i.quantity, 0) AS quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      WHERE p.id = $1;
      `,
      [id]
    );
    res.json(fullRes.rows[0]);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/products/:id
 * Deletes a product IF no sales reference it.
 */
router.delete("/:id", async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid product ID." });

  try {
    // Check if any sales reference this product
    const chk = await db.query(
      "SELECT COUNT(*) FROM sales WHERE product_id = $1;",
      [id]
    );
    if (parseInt(chk.rows[0].count, 10) > 0) {
      return res.status(409).json({
        error: "Cannot delete product: sales exist for this product.",
      });
    }

    // Delete from inventory_history, inventory, then products
    await db.query("DELETE FROM inventory_history WHERE product_id = $1;", [
      id,
    ]);
    await db.query("DELETE FROM inventory WHERE product_id = $1;", [id]);
    const del = await db.query(
      "DELETE FROM products WHERE id = $1 RETURNING id, name;",
      [id]
    );
    if (del.rows.length === 0)
      return res.status(404).json({ error: "Product not found." });
    res.json({ message: `Deleted product: ${del.rows[0].name}` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
