/**
 * This script populates:
 *  - categories
 *  - products
 *  - inventory (initial quantities)
 *  - sales (randomized over the past 60 days)
 *  - inventory_history (mirrors initial inventory states and each sale)
 *
 * To run: `node src/seed/seed.js`
 */

require("dotenv").config();
const db = require("../db/db");

async function seed() {
  try {
    // 1. Clear existing data (in reverse-dependency order)
    await db.query("DELETE FROM inventory_history;");
    await db.query("DELETE FROM sales;");
    await db.query("DELETE FROM inventory;");
    await db.query("DELETE FROM products;");
    await db.query("DELETE FROM categories;");

    console.log("Cleared old data.");

    // 2. Insert categories
    const categories = ["Electronics", "Books", "Clothing", "Home", "Sports"];
    const categoryIds = {};

    for (const name of categories) {
      const res = await db.query(
        "INSERT INTO categories(name) VALUES($1) RETURNING id;",
        [name]
      );
      categoryIds[name] = res.rows[0].id;
    }
    console.log("Inserted categories:", categoryIds);

    // 3. Insert products (10 per category)
    const products = [];
    for (const [categoryName, catId] of Object.entries(categoryIds)) {
      for (let i = 1; i <= 10; i++) {
        const productName = `${categoryName} Item ${i}`;
        const description = `Description for ${productName}`;
        // random price between 10 and 500
        const price = (Math.random() * 490 + 10).toFixed(2);

        const res = await db.query(
          `INSERT INTO products(name, description, price, category_id)
           VALUES($1, $2, $3, $4) RETURNING id;`,
          [productName, description, price, catId]
        );
        const prodId = res.rows[0].id;
        products.push({
          id: prodId,
          name: productName,
          category_id: catId,
          price: parseFloat(price),
        });
      }
    }
    console.log(`Inserted ${products.length} products.`);

    // 4. Insert initial inventory (random between 0 and 100)
    for (const prod of products) {
      const qty = Math.floor(Math.random() * 100);
      await db.query(
        `INSERT INTO inventory(product_id, quantity)
         VALUES($1, $2);`,
        [prod.id, qty]
      );
      // Also put an initial row in inventory_history
      await db.query(
        `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
         VALUES($1, $2, $3, $4);`,
        [prod.id, qty, 0, qty]
      );
    }
    console.log("Inventory initial quantities inserted.");

    // 5. Generate random sales over past 60 days
    const dayInMs = 24 * 60 * 60 * 1000;
    const today = new Date();
    for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
      // For each day, generate ~3–7 sales events
      const salesCount = Math.floor(Math.random() * 5) + 3;
      const saleDate = new Date(today.getTime() - dayOffset * dayInMs);

      for (let i = 0; i < salesCount; i++) {
        // pick a random product
        const randomProd =
          products[Math.floor(Math.random() * products.length)];
        // random quantity between 1 and 5
        const qtySold = Math.floor(Math.random() * 5) + 1;
        const totalPrice = (qtySold * randomProd.price).toFixed(2);

        // insert into sales
        const resSale = await db.query(
          `INSERT INTO sales(product_id, quantity, total_price, sale_date)
           VALUES($1, $2, $3, $4) RETURNING id;`,
          [randomProd.id, qtySold, totalPrice, saleDate]
        );

        // Update inventory: fetch current quantity, subtract qtySold (never go below zero)
        const invRes = await db.query(
          "SELECT quantity FROM inventory WHERE product_id = $1 FOR UPDATE;",
          [randomProd.id]
        );
        let currentQty = invRes.rows[0]?.quantity ?? 0;
        const newQty = Math.max(0, currentQty - qtySold);

        // update inventory table
        await db.query(
          `UPDATE inventory
           SET quantity = $1, updated_at = NOW()
           WHERE product_id = $2;`,
          [newQty, randomProd.id]
        );
        // track in inventory_history
        await db.query(
          `INSERT INTO inventory_history(product_id, change_qty, previous_qty, new_qty)
           VALUES($1, $2, $3, $4);`,
          [randomProd.id, -qtySold, currentQty, newQty]
        );
      }
    }
    console.log("Random sales and inventory history seeded.");
    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error during seeding:", err);
    process.exit(1);
  }
}

seed();
