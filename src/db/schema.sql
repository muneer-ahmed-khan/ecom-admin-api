

-- 1. Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Products table
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Inventory table (tracks current stock)
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Index on product_id for quick lookups
CREATE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id);

-- 4. Inventory history (tracks every change over time)
CREATE TABLE IF NOT EXISTS inventory_history (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  change_qty INTEGER NOT NULL,     -- positive for restock, negative for sale/adjustment
  previous_qty INTEGER NOT NULL,   -- quantity before change
  new_qty INTEGER NOT NULL,        -- quantity after change
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Index on product_id for quick history queries
CREATE INDEX IF NOT EXISTS idx_inventory_history_product_id ON inventory_history(product_id);

-- 5. Sales table
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  total_price NUMERIC(14,2) NOT NULL CHECK (total_price >= 0),
  sale_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
-- We’ll index sale_date for range queries/aggregations
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_product_id ON sales(product_id);

