const express = require("express");
const router = express.Router();
const db = require("../db/db");

/**
 * GET /api/inventory
 * Optional query param:
 *   − low_stock_threshold=<integer>
 *
 * Returns list of products with: id, name, category_id, category_name, quantity.
 * If low_stock_threshold is provided, only returns products whose quantity <= threshold.
 * By default, returns all products ordered by quantity ASC (low first).
 */
router.get("/", async (req, res, next) => {
  let { low_stock_threshold } = req.query;
  try {
    const params = [];
    let idx = 1;
    let whereClause = "";

    if (low_stock_threshold != null) {
      const thr = parseInt(low_stock_threshold, 10);
      if (isNaN(thr) || thr < 0) {
        return res
          .status(400)
          .json({
            error: "low_stock_threshold must be a non-negative integer.",
          });
      }
      whereClause = ` WHERE COALESCE(i.quantity,0) <= $${idx}`;
      params.push(thr);
      idx++;
    }

    const queryText = `
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        p.category_id,
        c.name AS category_name,
        COALESCE(i.quantity, 0) AS quantity
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN inventory i ON p.id = i.product_id
      ${whereClause}
      ORDER BY quantity ASC;
    `;
    const result = await db.query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/inventory/:product_id
 * Update the inventory level for a given product to new_quantity.
 * Body: { new_quantity: <integer> }
 * This:
 *   1. Retrieves current quantity.
 *   2. Updates inventory.quantity = new_quantity.
 *   3. Inserts a row into inventory_history with change_qty = new_quantity - old_quantity.
 */
router.put("/:product_id", async (req, res, next) => {
  const productId = parseInt(req.params.product_id, 10);
  if (isNaN(productId))
    return res.status(400).json({ error: "Invalid product_id." });

  const { new_quantity } = req.body;
  if (
    new_quantity == null ||
    isNaN(parseInt(new_quantity, 10)) ||
    parseInt(new_quantity, 10) < 0
  ) {
    return res
      .status(400)
      .json({
        error: "new_quantity is required and must be a non-negative integer.",
      });
  }
  const newQty = parseInt(new_quantity, 10);

  try {
    // 1. Fetch current quantity
    const currRes = await db.query(
      "SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE;",
      [productId]
    );
    if (currRes.rows.length === 0) {
      // If no row, it means no inventory record exists yet. We can create one.
      // But it’s safer to insist the product exists first:
      const prodCheck = await db.query(
        "SELECT id FROM products WHERE id = $1;",
        [productId]
      );
      if (prodCheck.rows.length === 0) {
        return res.status(404).json({ error: "Product not found." });
      }
      // Create initial inventory row
      await db.query(
        `INSERT INTO inventory(product_id, quantity, updated_at) VALUES($1, $2, NOW());`,
        [productId, newQty]
      );
      // Insert history row (previous was 0)
      await db.query(
        `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
         VALUES($1, $2, $3, $4);`,
        [productId, newQty, 0, newQty]
      );
      return res.json({ product_id: productId, quantity: newQty });
    }

    const prevQty = currRes.rows[0].quantity;
    // 2. Update inventory
    await db.query(
      `UPDATE inventory
       SET quantity = $1, updated_at = NOW()
       WHERE product_id = $2;`,
      [newQty, productId]
    );
    // 3. Insert into inventory_history
    const changeQty = newQty - prevQty;
    await db.query(
      `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
       VALUES($1, $2, $3, $4);`,
      [productId, changeQty, prevQty, newQty]
    );

    res.json({
      product_id: productId,
      previous_quantity: prevQty,
      new_quantity: newQty,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/inventory/history/:product_id
 * Returns all inventory_history rows for this product, ordered by changed_at DESC.
 */
router.get("/history/:product_id", async (req, res, next) => {
  const productId = parseInt(req.params.product_id, 10);
  if (isNaN(productId))
    return res.status(400).json({ error: "Invalid product_id." });
  try {
    // Check product exists
    const prodCheck = await db.query("SELECT id FROM products WHERE id = $1;", [
      productId,
    ]);
    if (prodCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found." });
    }

    const hist = await db.query(
      `
      SELECT
        ih.id,
        ih.product_id,
        ih.change_qty,
        ih.previous_qty,
        ih.new_qty,
        ih.changed_at
      FROM inventory_history ih
      WHERE ih.product_id = $1
      ORDER BY changed_at DESC;
      `,
      [productId]
    );
    res.json(hist.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
