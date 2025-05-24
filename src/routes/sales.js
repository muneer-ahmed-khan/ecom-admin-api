const express = require("express");
const router = express.Router();
const db = require("../db/db");

/**
 * Helper: parse YYYY-MM-DD into a JS Date at midnight UTC.
 * If invalid, returns null.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/sales
 * Query params:
 *   - startDate (YYYY-MM-DD)
 *   - endDate (YYYY-MM-DD)
 *   - product_id
 *   - category_id
 *
 * Returns a list of sales rows with product & category info.
 */
router.get("/", async (req, res, next) => {
  const { startDate, endDate, product_id, category_id } = req.query;
  try {
    const filters = [];
    const values = [];
    let idx = 1;

    if (startDate) {
      const d = parseDate(startDate);
      if (!d)
        return res.status(400).json({ error: "Invalid startDate format." });
      filters.push(`sale_date >= $${idx++}`);
      values.push(d);
    }
    if (endDate) {
      const d = parseDate(endDate);
      if (!d) return res.status(400).json({ error: "Invalid endDate format." });
      // add 1 day to include the entire endDate
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filters.push(`sale_date < $${idx++}`);
      values.push(nextDay);
    }
    if (product_id) {
      const pid = parseInt(product_id, 10);
      if (isNaN(pid))
        return res.status(400).json({ error: "Invalid product_id." });
      filters.push(`s.product_id = $${idx++}`);
      values.push(pid);
    }
    if (category_id) {
      const cid = parseInt(category_id, 10);
      if (isNaN(cid))
        return res.status(400).json({ error: "Invalid category_id." });
      filters.push(`p.category_id = $${idx++}`);
      values.push(cid);
    }

    let queryText = `
      SELECT
        s.id,
        s.product_id,
        p.name AS product_name,
        p.category_id,
        c.name AS category_name,
        s.quantity,
        s.total_price,
        s.sale_date
      FROM sales s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    if (filters.length > 0) {
      queryText += " WHERE " + filters.join(" AND ");
    }
    queryText += " ORDER BY s.sale_date DESC;";

    const result = await db.query(queryText, values);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sales/aggregate
 * Query params:
 *   - period = daily | weekly | monthly | yearly   (required)
 *   - startDate, endDate                        (optional)
 *   - category_id, product_id                    (optional)
 *
 * Returns: [{ period_label, total_revenue, total_quantity }…]
 *  e.g., period_label = '2025-05-01' for daily, '2025-W18' for weekly, '2025-05' for monthly, '2025' for yearly.
 */
router.get("/aggregate", async (req, res, next) => {
  let { period, startDate, endDate, category_id, product_id } = req.query;
  if (!period || !["daily", "weekly", "monthly", "yearly"].includes(period)) {
    return res
      .status(400)
      .json({
        error:
          "period is required and must be one of: daily, weekly, monthly, yearly.",
      });
  }
  try {
    const filters = [];
    const values = [];
    let idx = 1;

    if (startDate) {
      const d = parseDate(startDate);
      if (!d) return res.status(400).json({ error: "Invalid startDate." });
      filters.push(`sale_date >= $${idx++}`);
      values.push(d);
    }
    if (endDate) {
      const d = parseDate(endDate);
      if (!d) return res.status(400).json({ error: "Invalid endDate." });
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      filters.push(`sale_date < $${idx++}`);
      values.push(nextDay);
    }
    if (product_id) {
      const pid = parseInt(product_id, 10);
      if (isNaN(pid))
        return res.status(400).json({ error: "Invalid product_id." });
      filters.push(`s.product_id = $${idx++}`);
      values.push(pid);
    }
    if (category_id) {
      const cid = parseInt(category_id, 10);
      if (isNaN(cid))
        return res.status(400).json({ error: "Invalid category_id." });
      filters.push(`p.category_id = $${idx++}`);
      values.push(cid);
    }

    // Build GROUP BY expression depending on period
    let groupByExpr, labelExpr;
    switch (period) {
      case "daily":
        groupByExpr = `DATE(s.sale_date)`;
        labelExpr = `TO_CHAR(DATE(s.sale_date), 'YYYY-MM-DD')`;
        break;
      case "weekly":
        // ISO week
        groupByExpr = `TO_CHAR(s.sale_date, 'IYYY-IW')`;
        labelExpr = `TO_CHAR(s.sale_date, 'IYYY-IW')`;
        break;
      case "monthly":
        groupByExpr = `TO_CHAR(s.sale_date, 'YYYY-MM')`;
        labelExpr = `TO_CHAR(s.sale_date, 'YYYY-MM')`;
        break;
      case "yearly":
        groupByExpr = `TO_CHAR(s.sale_date, 'YYYY')`;
        labelExpr = `TO_CHAR(s.sale_date, 'YYYY')`;
        break;
    }

    let queryText = `
      SELECT
        ${labelExpr} AS period_label,
        SUM(s.total_price)::NUMERIC(14,2) AS total_revenue,
        SUM(s.quantity) AS total_quantity
      FROM sales s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    if (filters.length > 0) {
      queryText += " WHERE " + filters.join(" AND ");
    }
    queryText += `
      GROUP BY ${groupByExpr}
      ORDER BY ${groupByExpr} DESC;
    `;

    const result = await db.query(queryText, values);
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sales/comparison
 * Compare revenue between two date ranges (and optionally category/product).
 * Query params (all required):
 *   range1_start, range1_end, range2_start, range2_end  (YYYY-MM-DD)
 *   Optionally: category_id or product_id
 *
 * Returns:
 * {
 *   range1: { start: '2025-01-01', end: '2025-01-31', total_revenue: 1234.56, total_quantity: 789 },
 *   range2: { start: '2024-01-01', end: '2024-01-31', total_revenue: 2345.67, total_quantity: 890 }
 * }
 */
router.get("/comparison", async (req, res, next) => {
  let {
    range1_start,
    range1_end,
    range2_start,
    range2_end,
    category_id,
    product_id,
  } = req.query;

  // Validate dates
  const r1s = parseDate(range1_start);
  const r1e = parseDate(range1_end);
  const r2s = parseDate(range2_start);
  const r2e = parseDate(range2_end);
  if (!r1s || !r1e || !r2s || !r2e) {
    return res
      .status(400)
      .json({ error: "All four date params must be valid YYYY-MM-DD." });
  }
  // For comparison, we treat ranges as inclusive: sale_date >= start AND sale_date < (end + 1 day)
  try {
    // Build dynamic filters part
    const baseFilters = [];
    const values = [];
    let idx = 1;

    if (category_id) {
      const cid = parseInt(category_id, 10);
      if (isNaN(cid))
        return res.status(400).json({ error: "Invalid category_id." });
      baseFilters.push(`p.category_id = $${idx++}`);
      values.push(cid);
    }
    if (product_id) {
      const pid = parseInt(product_id, 10);
      if (isNaN(pid))
        return res.status(400).json({ error: "Invalid product_id." });
      baseFilters.push(`s.product_id = $${idx++}`);
      values.push(pid);
    }

    // Helper to compute sum for a given range
    async function getRangeTotals(startD, endD) {
      const filters = [...baseFilters];
      const vals = [...values];
      let localIdx = idx;

      // sale_date >= startD
      filters.push(`s.sale_date >= $${localIdx++}`);
      vals.push(startD);
      // sale_date < endD + 1 day
      const ed = new Date(endD);
      ed.setDate(ed.getDate() + 1);
      filters.push(`s.sale_date < $${localIdx++}`);
      vals.push(ed);

      let q = `
        SELECT
          SUM(s.total_price)::NUMERIC(14,2) AS total_revenue,
          SUM(s.quantity) AS total_quantity
        FROM sales s
        JOIN products p ON s.product_id = p.id
      `;
      if (filters.length > 0) {
        q += " WHERE " + filters.join(" AND ");
      }

      const r = await db.query(q, vals);
      return {
        total_revenue: r.rows[0].total_revenue || 0,
        total_quantity: parseInt(r.rows[0].total_quantity || 0, 10),
      };
    }

    const range1Totals = await getRangeTotals(r1s, r1e);
    const range2Totals = await getRangeTotals(r2s, r2e);

    res.json({
      range1: {
        start: range1_start,
        end: range1_end,
        total_revenue: range1Totals.total_revenue,
        total_quantity: range1Totals.total_quantity,
      },
      range2: {
        start: range2_start,
        end: range2_end,
        total_revenue: range2Totals.total_revenue,
        total_quantity: range2Totals.total_quantity,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sales
 * Manually record a new sale (for testing/demo). Body:
 *   { product_id, quantity, sale_date (optional, defaults to NOW) }
 * This will:
 *   - Insert into sales (calculating total_price = quantity * product.price).
 *   - Update inventory (subtract quantity), never below zero.
 *   - Insert a row into inventory_history.
 */
router.post("/", async (req, res, next) => {
  const { product_id, quantity, sale_date } = req.body;
  if (!product_id || isNaN(parseInt(product_id, 10))) {
    return res.status(400).json({ error: "Valid product_id is required." });
  }
  if (
    !quantity ||
    isNaN(parseInt(quantity, 10)) ||
    parseInt(quantity, 10) <= 0
  ) {
    return res
      .status(400)
      .json({ error: "quantity must be a positive integer." });
  }
  let saleDate = sale_date ? new Date(sale_date) : new Date();
  if (isNaN(saleDate.getTime())) {
    return res.status(400).json({ error: "Invalid sale_date format." });
  }

  try {
    // 1. Fetch product price and current inventory
    const pRes = await db.query("SELECT price FROM products WHERE id = $1;", [
      product_id,
    ]);
    if (pRes.rows.length === 0)
      return res.status(404).json({ error: "Product not found." });
    const price = parseFloat(pRes.rows[0].price);
    const totPrice = (price * parseInt(quantity, 10)).toFixed(2);

    // 2. Insert into sales
    const insSale = await db.query(
      `INSERT INTO sales(product_id, quantity, total_price, sale_date)
       VALUES($1, $2, $3, $4) RETURNING id;`,
      [product_id, quantity, totPrice, saleDate]
    );
    const saleId = insSale.rows[0].id;

    // 3. Get current inventory (FOR UPDATE lock if concurrent)
    const invRes = await db.query(
      "SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE;",
      [product_id]
    );
    let currQty = invRes.rows[0]?.quantity || 0;
    const newQty = Math.max(0, currQty - parseInt(quantity, 10));

    // 4. Update inventory table
    await db.query(
      `UPDATE inventory SET quantity = $1, updated_at = NOW() WHERE product_id = $2;`,
      [newQty, product_id]
    );

    // 5. Insert into inventory_history
    await db.query(
      `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
       VALUES($1, $2, $3, $4);`,
      [product_id, -parseInt(quantity, 10), currQty, newQty]
    );

    // 6. Return the newly created sale record
    const fullSale = await db.query(
      `
      SELECT
        s.id,
        s.product_id,
        p.name AS product_name,
        p.category_id,
        c.name AS category_name,
        s.quantity,
        s.total_price,
        s.sale_date
      FROM sales s
      JOIN products p ON s.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE s.id = $1;
      `,
      [saleId]
    );
    res.status(201).json(fullSale.rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
