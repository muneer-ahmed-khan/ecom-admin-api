require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

// built-in body parser for JSON
app.use(express.json());

// Mount route modules
const categoriesRouter = require("./src/routes/categories");
const productsRouter = require("./src/routes/products");
const salesRouter = require("./src/routes/sales");
const inventoryRouter = require("./src/routes/inventory");

// Base path for each domain
app.use("/api/categories", categoriesRouter);
app.use("/api/products", productsRouter);
app.use("/api/sales", salesRouter);
app.use("/api/inventory", inventoryRouter);

// A root health check
app.get("/", (_req, res) => {
  res.json({ message: "E-commerce Admin API is running." });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal Server Error" });
});

app.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
